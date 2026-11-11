"use strict";

/**
 * Configuracao central do Sonora.
 * Toda configuracao vem de variavel de ambiente — nada de valor sensivel no codigo.
 */

const DB_PORT = "5432";

/**
 * Resolve a porta do servidor web.
 *
 * Armadilha do Geno: ao provisionar um Postgres, a plataforma injeta `PORT=5432`
 * (a porta do banco). Se o servidor web subisse nessa porta, o Health gate
 * falharia. Por isso `WEB_PORT` tem prioridade e o valor 5432 e' descartado.
 */
function resolveWebPort() {
  const raw = process.env.WEB_PORT || process.env.PORT || "8000";
  if (raw === DB_PORT) return 8000;
  const port = Number.parseInt(raw, 10);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : 8000;
}

const isProduction = process.env.NODE_ENV === "production";

const config = {
  isProduction,
  port: resolveWebPort(),
  appTitle: process.env.APP_TITULO || "Sonora",
  baseUrl: process.env.BASE_URL || "",

  db: {
    url: process.env.DATABASE_URL || "",
    schema: (process.env.APP_SCHEMA || "public").replace(/[^a-zA-Z0-9_]/g, ""),
    requireSsl: process.env.DATABASE_SSL === "require",
  },

  session: {
    secret: process.env.SESSION_SECRET || "",
    // 30 dias — app interno de uso continuo, sessao longa com cookie httpOnly.
    maxAgeMs: 30 * 24 * 60 * 60 * 1000,
  },

  adminBootstrap: {
    username: process.env.ADMIN_BOOTSTRAP_USER || "",
    password: process.env.ADMIN_BOOTSTRAP_PASSWORD || "",
    // O login aceita usuario OU e-mail (§23) e a coluna e' obrigatoria, entao o
    // admin inicial tambem precisa de um endereco.
    email: process.env.ADMIN_BOOTSTRAP_EMAIL || "",
  },

  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
};

module.exports = config;
