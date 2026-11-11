"use strict";

/**
 * Disponibilidade dos dados.
 *
 * As rotas nao perguntam "o Postgres conectou?", e sim "da para ler e gravar?".
 * Isso mantem o comportamento resiliente do app (o `/healthz` continua 200 e as
 * rotas de dados respondem 503 enquanto o banco nao vem) e ao mesmo tempo
 * permite que o modo demonstracao responda sem banco nenhum.
 */

const db = require("./db");
const demo = require("./demo/config");

const emDemonstracao = () => demo.ativo;

/** Ha uma fonte de dados atendendo agora? */
const pronto = () => (demo.ativo ? true : db.isReady());

/** Middleware para rotas que leem ou gravam dados. */
async function exigir(_req, res, next) {
  if (demo.ativo) {
    // Espera a semente terminar de criar as pessoas antes de liberar o login.
    await require("./demo/store").aguardar();
    return next();
  }

  if (db.isReady()) return next();

  const semConfiguracao = !process.env.DATABASE_URL;
  return res.status(503).json({
    erro: semConfiguracao
      ? "Este ambiente ainda nao tem banco de dados configurado (DATABASE_URL). Sem ele nao da para entrar nem registrar escutas."
      : "O banco de dados ainda nao respondeu. Tente novamente em instantes.",
    detalhe: semConfiguracao ? undefined : db.lastError() || undefined,
  });
}

module.exports = { pronto, exigir, emDemonstracao };
