"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { Pool } = require("pg");

const config = require("./config");

const MIGRATIONS_DIR = path.join(__dirname, "..", "migrations");
// Numero arbitrario, mas fixo: garante que so uma replica roda migracao por vez.
const MIGRATION_LOCK_KEY = 528491;

const state = { ready: false, lastError: "" };
let pool = null;

// Porta do pooler do Supabase em modo transacao.
const PORTA_POOLER_TRANSACAO = "6543";

/**
 * O app guarda estado na conexao: `SET search_path` (schema da aplicacao) e
 * `pg_advisory_lock` (uma instancia migrando por vez). O pooler do Supabase em
 * modo transacao troca a conexao do servidor a cada transacao e perde os dois.
 * Use o pooler em modo sessao (porta 5432) ou a conexao direta.
 */
function avisarSePoolerDeTransacao(url) {
  try {
    if (new URL(url).port !== PORTA_POOLER_TRANSACAO) return;
  } catch {
    return; // URL malformada: o proprio pg reporta o erro ao conectar.
  }
  console.error(
    "[db] DATABASE_URL usa a porta 6543 (pooler do Supabase em modo transacao), que nao " +
      "mantem search_path nem advisory lock. Use a string do Session pooler (porta 5432)."
  );
}

/** O pool so existe se houver DATABASE_URL. Sem banco, o app sobe degradado. */
function getPool() {
  if (pool || !config.db.url) return pool;

  avisarSePoolerDeTransacao(config.db.url);

  pool = new Pool({
    connectionString: config.db.url,
    ssl: config.db.requireSsl ? { rejectUnauthorized: false } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });

  // Isola a app no seu schema. No Supabase, um schema proprio (fora de `public`)
  // nao e' exposto pela Data API, entao as tabelas so sao alcancaveis por aqui.
  pool.on("connect", (client) => {
    client.query(`SET search_path TO ${config.db.schema}, public`).catch((err) => {
      console.error("[db] falha ao ajustar search_path:", err.message);
    });
  });

  pool.on("error", (err) => {
    state.ready = false;
    state.lastError = err.message;
    console.error("[db] erro no pool:", err.message);
  });

  return pool;
}

const isReady = () => state.ready;
const lastError = () => state.lastError;

/**
 * Executa uma query parametrizada. Nunca concatene input do usuario em SQL:
 * use sempre `$1, $2, ...`.
 */
async function query(text, params = []) {
  const activePool = getPool();
  if (!activePool) throw new Error("banco nao configurado");
  return activePool.query(text, params);
}

/** Atalho para leituras: devolve so as linhas. */
async function rows(text, params = []) {
  const result = await query(text, params);
  return result.rows;
}

/** Atalho para leituras de um registro so. */
async function one(text, params = []) {
  const result = await query(text, params);
  return result.rows[0] || null;
}

/** Roda um bloco dentro de uma transacao, com rollback automatico em erro. */
async function transaction(handler) {
  const activePool = getPool();
  if (!activePool) throw new Error("banco nao configurado");

  const client = await activePool.connect();
  try {
    await client.query("BEGIN");
    const result = await handler(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

function listMigrationFiles() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b));
}

async function prepareSchema(client) {
  await client.query(`CREATE SCHEMA IF NOT EXISTS ${config.db.schema}`);
  await client.query(`SET search_path TO ${config.db.schema}, public`);
  await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    filename    TEXT PRIMARY KEY,
    executed_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);
}

async function applyPending(client) {
  const applied = await client.query("SELECT filename FROM schema_migrations");
  const done = new Set(applied.rows.map((row) => row.filename));

  for (const filename of listMigrationFiles()) {
    if (done.has(filename)) continue;
    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, filename), "utf8");
    await client.query(sql);
    await client.query("INSERT INTO schema_migrations (filename) VALUES ($1)", [filename]);
    console.log(`[db] migracao aplicada: ${filename}`);
  }
}

/**
 * Cria/evolui as tabelas na subida. Nao derruba o processo se o banco atrasar:
 * `/healthz` continua 200 e as rotas de dados respondem 503 ate conectar.
 */
async function migrate() {
  const activePool = getPool();
  if (!activePool) {
    state.lastError = "DATABASE_URL nao configurada";
    console.warn("[db] sem DATABASE_URL — rotas de dados vao responder 503");
    return false;
  }

  const client = await activePool.connect();
  try {
    await client.query("SELECT pg_advisory_lock($1)", [MIGRATION_LOCK_KEY]);
    await prepareSchema(client);
    await applyPending(client);
    state.ready = true;
    state.lastError = "";
    console.log(`[db] pronto (schema "${config.db.schema}")`);
    return true;
  } finally {
    await client.query("SELECT pg_advisory_unlock($1)", [MIGRATION_LOCK_KEY]).catch(() => {});
    client.release();
  }
}

/**
 * Tenta migrar e, se falhar, reagenda com espera crescente. Assim o container
 * nao morre em loop quando o banco sobe depois do app.
 */
function migrateWithRetry(onReady, attempt = 1) {
  migrate()
    .then((ok) => {
      if (ok && typeof onReady === "function") return onReady();
      return null;
    })
    .catch((err) => {
      state.ready = false;
      state.lastError = err.message;
      const delayMs = Math.min(30_000, 2_000 * attempt);
      console.error(`[db] indisponivel (${err.message}) — nova tentativa em ${delayMs}ms`);
      setTimeout(() => migrateWithRetry(onReady, attempt + 1), delayMs).unref();
    });
}

/**
 * Middleware: barra rotas de dados enquanto o banco nao esta pronto.
 * A mensagem distingue os dois casos, porque a acao do usuario e' diferente:
 * banco nao configurado nunca se resolve sozinho; banco atrasado, sim.
 */
function requireDb(_req, res, next) {
  if (state.ready) return next();

  const naoConfigurado = !config.db.url;
  return res.status(503).json({
    erro: naoConfigurado
      ? "Este ambiente ainda nao tem banco de dados configurado (DATABASE_URL). Sem ele nao da para entrar nem registrar escutas."
      : "O banco de dados ainda nao respondeu. Tente novamente em instantes.",
    detalhe: naoConfigurado ? undefined : state.lastError || undefined,
  });
}

module.exports = {
  getPool,
  query,
  rows,
  one,
  transaction,
  migrate,
  migrateWithRetry,
  requireDb,
  isReady,
  lastError,
};
