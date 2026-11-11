"use strict";

const session = require("express-session");
const bcrypt = require("bcryptjs");

const config = require("./config");
const db = require("./db");
const { users } = require("./repos");

const BCRYPT_ROUNDS = 12;

/**
 * Sessao com cookie httpOnly. O armazenamento fica no Postgres (nao em memoria),
 * para a sessao sobreviver a reinicio e funcionar com mais de uma replica.
 */
function resolveSessionSecret() {
  if (config.session.secret) return config.session.secret;

  // Sem segredo configurado o app ainda sobe (o Health gate continua verde), mas
  // com um segredo efemero: as sessoes caem a cada reinicio e nao valem entre
  // replicas. Configure SESSION_SECRET nas variaveis do app.
  console.error(
    "[auth] SESSION_SECRET ausente — usando segredo temporario. Defina a variavel: " +
      'node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"'
  );
  return require("node:crypto").randomBytes(48).toString("hex");
}

function setupSession(app) {
  const options = {
    name: "sonora.sid",
    secret: resolveSessionSecret(),
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: config.isProduction,
      maxAge: config.session.maxAgeMs,
    },
  };

  const pool = db.getPool();
  if (pool) {
    const PgStore = require("connect-pg-simple")(session);
    options.store = new PgStore({
      pool,
      tableName: "session",
      schemaName: config.db.schema,
      createTableIfMissing: true,
      pruneSessionInterval: 60 * 15,
    });
  } else {
    console.warn("[auth] sem banco — sessoes ficam em memoria (apenas desenvolvimento)");
  }

  app.use(session(options));
}

const hashPassword = (plain) => bcrypt.hash(plain, BCRYPT_ROUNDS);

/** Compara senha com o hash. `bcrypt.compare` e' resistente a timing attack. */
const checkPassword = (plain, hash) => (hash ? bcrypt.compare(plain, hash) : Promise.resolve(false));

/**
 * Cria o primeiro administrador a partir de ADMIN_BOOTSTRAP_*.
 *
 * O autocadastro publico existe (§21) e cria usuarios comuns; ninguem nasce
 * administrador por ali. Este e' o unico caminho para o primeiro admin — os
 * demais recebem o perfil de outro administrador (§45). Idempotente.
 */
async function bootstrapAdmin() {
  const { username, password, email } = config.adminBootstrap;
  if (!username || !password) {
    console.warn("[auth] ADMIN_BOOTSTRAP_USER/PASSWORD ausentes — nenhum admin criado");
    return;
  }
  if (password.length < 8) {
    console.error("[auth] ADMIN_BOOTSTRAP_PASSWORD muito curta (minimo 8) — admin nao criado");
    return;
  }

  const existing = await users.findByUsername(username);
  if (existing) return;

  await users.create({
    username,
    // Endereco obrigatorio no banco. Sem ADMIN_BOOTSTRAP_EMAIL, usa um
    // placeholder .invalid (reservado por norma, nunca resolve) para o admin
    // inicial existir sem fingir um e-mail de alguem.
    email: email || `${username}@sonora.invalid`,
    displayName: username,
    passwordHash: await hashPassword(password),
    isAdmin: true,
  });
  console.log(`[auth] administrador inicial criado: ${username}`);
}

/** Middleware: exige login. */
function requireUser(req, res, next) {
  if (req.session?.user) return next();
  return res.status(401).json({ erro: "Faca login para continuar." });
}

/** Middleware: exige perfil de administrador. */
function requireAdmin(req, res, next) {
  if (req.session?.user?.isAdmin) return next();
  return res.status(403).json({ erro: "Area restrita a administradores." });
}

/** Formato do usuario guardado na sessao (nunca inclui hash de senha). */
const toSessionUser = (row) => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  isAdmin: Boolean(row.is_admin),
});

// ─── MODO 2: SSO corporativo (OIDC / Entra ID) — preparado, desativado ────────
//
// Pre-requisito NO ENTRA (obrigatorio): registrar o app, obter issuer/clientID/
// secret E deixar o enterprise application com "Atribuicao obrigatoria = Sim",
// atribuindo apenas os usuarios/grupos que podem usar o Sonora. Sem isso,
// qualquer conta do tenant conseguiria entrar — o que este padrao proibe.
//
// Para ligar: `npm i express-openid-connect jwt-decode`, preencha as variaveis
// OIDC_* no portal e troque `setupLocalAuth(app)` por `setupOidcAuth(app)`
// no server.js.
//
// const { auth } = require("express-openid-connect");
// const { jwtDecode } = require("jwt-decode");
//
// function setupOidcAuth(app) {
//   app.use(auth({
//     authRequired: true,
//     issuerBaseURL: process.env.OIDC_ISSUER,
//     baseURL:       config.baseUrl,
//     clientID:      process.env.OIDC_CLIENT_ID,
//     clientSecret:  process.env.OIDC_CLIENT_SECRET,
//     secret:        config.session.secret,
//     authorizationParams: { response_type: "code", scope: "openid profile email" },
//     afterCallback: async (req, res, sess) => {
//       const claims = jwtDecode(sess.id_token);
//       // GATE DE ACESSO — nunca auto-provisiona. A restricao real vem do Entra
//       // ("Atribuicao obrigatoria"): so membros atribuidos ao app chegam aqui.
//       const requiredRole = process.env.OIDC_REQUIRED_ROLE;
//       if (requiredRole && !(claims.roles || []).includes(requiredRole)) {
//         throw new Error("forbidden: usuario nao e membro do app");
//       }
//       // Apenas ATUALIZA o perfil de quem ja e membro. Nada de INSERT cego.
//       const member = await users.findByUsername(claims.preferred_username);
//       if (!member) throw new Error("forbidden: usuario sem acesso ao Sonora");
//       await users.touchProfile(member.id, { displayName: claims.name });
//       req.session.user = toSessionUser(member);
//       return sess;
//     },
//   }));
// }

module.exports = {
  setupSession,
  hashPassword,
  checkPassword,
  bootstrapAdmin,
  requireUser,
  requireAdmin,
  toSessionUser,
};
