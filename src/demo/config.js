"use strict";

/**
 * MODO DEMONSTRACAO — vitrine temporaria, nao e' o banco do app.
 *
 * Existe para uma coisa so: deixar o MVP navegavel sem Postgres, quando o banco
 * de desenvolvimento da area nao esta alcancavel. Os dados vivem em memoria e
 * somem quando o processo reinicia.
 *
 * O caminho de verdade continua sendo Postgres via DATABASE_URL, nos dois
 * ambientes. Nada do SQL do app foi adaptado para caber aqui — os repositorios
 * de producao seguem intactos em src/repos/.
 *
 * Tres travas para isso nunca subir junto com o app no Geno:
 *   1. exige DEMO_MODE=true explicito;
 *   2. desliga sozinho se existir DATABASE_URL (banco real sempre ganha);
 *   3. desliga sozinho se NODE_ENV=production.
 */

const pedido = process.env.DEMO_MODE === "true";
const temBancoReal = Boolean(process.env.DATABASE_URL);
const emProducao = process.env.NODE_ENV === "production";

const ativo = pedido && !temBancoReal && !emProducao;

// Senha unica e publica dos usuarios de demonstracao. Nunca sai daqui: em modo
// normal quem cria conta e' um administrador, com senha propria.
const SENHA_DEMO = "demo1234";

function avisarNoBoot() {
  if (!ativo) {
    if (pedido && temBancoReal) {
      console.log("[demo] DEMO_MODE ignorado: existe DATABASE_URL, usando o banco real");
    }
    if (pedido && emProducao) {
      console.warn("[demo] DEMO_MODE ignorado: NODE_ENV=production nao aceita dados ficticios");
    }
    return;
  }

  console.warn("┌──────────────────────────────────────────────────────────────┐");
  console.warn("│  MODO DEMONSTRACAO ATIVO                                     │");
  console.warn("│  Dados ficticios, em memoria, perdidos a cada reinicio.      │");
  console.warn(`│  Entre com  usuario: leo   senha: ${SENHA_DEMO}                 │`);
  console.warn("│  Para usar de verdade: preencha DATABASE_URL e apague        │");
  console.warn("│  DEMO_MODE do .env.                                          │");
  console.warn("└──────────────────────────────────────────────────────────────┘");
}

module.exports = { ativo, SENHA_DEMO, avisarNoBoot };
