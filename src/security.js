"use strict";

const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const config = require("./config");

/**
 * Origens permitidas para imagem.
 *
 * As capas da API vem do Cover Art Archive, que responde 307 para o arquivo
 * real no Internet Archive — por isso as tres entradas: o redirecionamento
 * pode cair no dominio raiz (`archive.org`) ou num no de entrega
 * (`ia800…us.archive.org`), e o curinga `*.archive.org` NAO cobre o dominio raiz.
 *
 * `https:` entra porque o cadastro manual exige informar uma URL de imagem
 * valida e o upload de capa esta fora do MVP (§18, §58): a capa de uma obra
 * manual pode morar em qualquer host. O afrouxamento vale so para `img-src`;
 * script, conexao e estilo continuam restritos a origem propria.
 *
 * Nao ha `media-src`: o projeto nao reproduz audio (§58).
 */
const HOSTS_DE_CAPA = [
  "https://coverartarchive.org",
  "https://archive.org",
  "https://*.archive.org",
  "https:",
];

function securityHeaders() {
  return helmet({
    contentSecurityPolicy: {
      useDefaults: false,
      directives: {
        defaultSrc: ["'self'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        objectSrc: ["'none'"],
        scriptSrc: ["'self'"],
        // 'unsafe-inline' apenas para estilo: barras de nota e histogramas
        // ajustam largura via atributo style. Nenhum script inline e' permitido.
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "blob:", ...HOSTS_DE_CAPA],
        connectSrc: ["'self'"],
        fontSrc: ["'self'", "data:"],
        // Em dev o app roda em http://localhost; forcar https quebraria o fluxo.
        upgradeInsecureRequests: config.isProduction ? [] : null,
      },
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });
}

/** Restringe origens externas. Vazio = ninguem de fora (padrao). */
function corsPolicy() {
  const permitidas = new Set(config.corsOrigins);

  return function aplicarCors(req, res, next) {
    const origem = req.headers.origin;
    if (origem && permitidas.has(origem)) {
      res.setHeader("Access-Control-Allow-Origin", origem);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE");
      res.setHeader("Access-Control-Allow-Headers", "Content-Type");
      res.setHeader("Vary", "Origin");
    }
    if (req.method === "OPTIONS") return res.sendStatus(204);
    return next();
  };
}

const construir = ({ windowMs, max, message }) =>
  rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { erro: message },
  });

// Login: 5 tentativas por IP a cada 15 minutos (nao conta login bem-sucedido).
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { erro: "Muitas tentativas de login. Tente novamente em alguns minutos." },
});

// Cadastro aberto (US01): limite baixo por IP, para nao virar porta de abuso.
const cadastroLimiter = construir({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: "Muitas contas criadas deste endereco. Tente novamente mais tarde.",
});

const apiLimiter = construir({
  windowMs: 60 * 1000,
  max: 600,
  message: "Muitas requisicoes. Aguarde alguns segundos e tente de novo.",
});

// Busca externa: bate em servico de terceiro com limite de 1 req/s por IP.
const searchLimiter = construir({
  windowMs: 60 * 1000,
  max: 30,
  message: "Muitas buscas externas seguidas. Aguarde um instante.",
});

const writeLimiter = construir({
  windowMs: 60 * 1000,
  max: 120,
  message: "Muitas alteracoes seguidas. Aguarde um instante.",
});

module.exports = {
  securityHeaders,
  corsPolicy,
  loginLimiter,
  cadastroLimiter,
  apiLimiter,
  searchLimiter,
  writeLimiter,
};
