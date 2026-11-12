"use strict";

require("dotenv").config();

const path = require("node:path");
const express = require("express");

const config = require("./src/config");
const dados = require("./src/dados");
const db = require("./src/db");
const auth = require("./src/auth");
const demo = require("./src/demo/config");
const security = require("./src/security");
const { HttpError } = require("./src/routes/helpers");

const app = express();

// Atras de proxy o IP real vem no X-Forwarded-For. Confia so no numero exato de
// saltos (TRUST_PROXY_HOPS), para o rate limiting nao ser burlado por header
// falsificado.
if (config.isProduction) app.set("trust proxy", config.trustProxyHops);
app.disable("x-powered-by");

// ─────────────────────────────────────────────────────────────────────────────
// Probe de saude: sempre a PRIMEIRA rota, publica e sem depender do banco.
// O cluster consulta este endereco para decidir se o app subiu.
// ─────────────────────────────────────────────────────────────────────────────
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

app.use(security.securityHeaders());
app.use(security.corsPolicy());
app.use(express.json({ limit: "128kb" }));

auth.setupSession(app);

// Arquivos da interface (HTML, CSS, JS). Nao contem dado nenhum: tudo o que e'
// informacao passa pela API autenticada abaixo.
// `index: false`: "/" nao sai daqui com cache de 1 hora; cai na rota da SPA
// abaixo, que manda o index.html para ser revalidado a cada visita. Assim, depois
// de uma publicacao, ninguem fica com o HTML antigo.
app.use(
  express.static(path.join(__dirname, "public"), {
    maxAge: config.isProduction ? "1h" : 0,
    etag: true,
    index: false,
  })
);

// ─── API ─────────────────────────────────────────────────────────────────────
app.use("/api", security.apiLimiter);
app.use("/api/auth", require("./src/routes/auth.routes"));
app.use("/api/users", require("./src/routes/users.routes"));
app.use("/api/catalogo", require("./src/routes/catalog.routes"));
app.use("/api/interacoes", require("./src/routes/interactions.routes"));
app.use("/api/listas", require("./src/routes/lists.routes"));
app.use("/api/admin", require("./src/routes/admin.routes"));

// Publico de proposito: a tela de login precisa saber se estamos em
// demonstracao para mostrar as credenciais de teste.
app.get("/api/status", (_req, res) => {
  res.json({
    app: config.appTitle,
    dadosProntos: dados.pronto(),
    demo: demo.ativo,
    detalheBanco: db.isReady() ? undefined : db.lastError() || undefined,
  });
});

app.use("/api", (_req, res) => res.status(404).json({ erro: "Endereco nao encontrado." }));

// ─── Interface (SPA) ─────────────────────────────────────────────────────────
// Qualquer outra rota devolve a casca do app; o roteamento acontece no navegador.
app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// ─── Erros ───────────────────────────────────────────────────────────────────
// Mensagem generica para o usuario; detalhe completo apenas no log do servidor.
app.use((err, _req, res, _next) => {
  const status = err instanceof HttpError ? err.status : err.status || 500;

  if (status >= 500) {
    console.error("[erro]", err);
  } else {
    console.warn(`[aviso ${status}]`, err.message);
  }

  const mensagem = status >= 500 ? "Ocorreu um erro interno. Tente novamente." : err.message;
  res.status(status).json({ erro: mensagem });
});

// ─── Subida ──────────────────────────────────────────────────────────────────
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`[${config.appTitle}] ouvindo em http://localhost:${config.port}`);
  demo.avisarNoBoot();

  if (demo.ativo) {
    require("./src/demo/seed").semear();
    return;
  }
  if (!config.db.url) {
    console.warn("[boot] DATABASE_URL ausente — o app sobe, mas sem diario, notas nem login");
    return;
  }
  // Migra em segundo plano e cria o admin inicial quando o banco responder.
  // Se o banco atrasar, tenta de novo sem derrubar o processo.
  db.migrateWithRetry(() =>
    auth.bootstrapAdmin().catch((err) => console.error("[boot] bootstrap do admin:", err.message))
  );
});

function shutdown(signal) {
  console.log(`[boot] recebido ${signal} — encerrando`);
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 8_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
