"use strict";

const { listens, ratings, releases, reviews } = require("../repos");
const catalogo = require("./catalogo");

/**
 * Servico de interacoes — escuta, avaliacao, review, favorito e quero ouvir.
 *
 * Duas regras da especificacao vivem aqui, porque atravessam mais de uma
 * entidade e nao cabem num repositorio:
 *
 * §28 — ESCUTA AUTOMATICA
 *   Publicar a primeira avaliacao ou a primeira review registra uma escuta.
 *   Editar uma avaliacao ou review existente NAO registra outra. Se nota e
 *   review forem criadas na mesma acao, registra-se somente UMA escuta.
 *
 * §32 — QUERO OUVIR
 *   Ao registrar escuta de uma obra que esta em Quero ouvir, o sistema
 *   PERGUNTA se deve remover. Nunca remove sozinho. O servico nao decide: ele
 *   devolve `perguntarQueroOuvir` e a interface faz a pergunta.
 */

/** Resultado padrao das interacoes que podem disparar a pergunta do §32. */
const resposta = (releaseId, extras = {}) => ({
  releaseId,
  escutaRegistrada: false,
  perguntarQueroOuvir: false,
  ...extras,
});

/**
 * Registra escuta e informa se cabe perguntar sobre o Quero ouvir.
 * Nao remove nada por conta propria.
 */
async function registrarEscuta(ref, userId, { listenedOn = null } = {}) {
  const releaseId = await catalogo.garantirPersistido(ref, userId);
  const escuta = await listens.criar(userId, releaseId, listenedOn);
  const estaNaLista = await releases.estaNoQueroOuvir(userId, releaseId);

  return resposta(releaseId, {
    escutaRegistrada: true,
    escuta,
    perguntarQueroOuvir: estaNaLista,
  });
}

/**
 * Salva a avaliacao. Na criacao, registra escuta automatica; na edicao, nao.
 */
async function avaliar(ref, userId, nota) {
  const releaseId = await catalogo.garantirPersistido(ref, userId);
  const salva = await ratings.salvar(userId, releaseId, nota);

  if (!salva.criada) {
    return resposta(releaseId, { nota: salva.rating, criada: false });
  }

  await listens.criar(userId, releaseId);
  const estaNaLista = await releases.estaNoQueroOuvir(userId, releaseId);

  return resposta(releaseId, {
    nota: salva.rating,
    criada: true,
    escutaRegistrada: true,
    perguntarQueroOuvir: estaNaLista,
  });
}

const removerAvaliacao = async (ref, userId) => {
  const releaseId = await catalogo.resolverSePersistido(ref, userId);
  if (!releaseId) return { releaseId: null, removida: false };
  return { releaseId, removida: await ratings.remover(userId, releaseId) };
};

/**
 * Salva a review. Na criacao, registra escuta automatica; na edicao, nao.
 */
async function publicarReview(ref, userId, texto) {
  const releaseId = await catalogo.garantirPersistido(ref, userId);
  const salva = await reviews.salvar(userId, releaseId, texto);

  if (!salva.criada) {
    return resposta(releaseId, { reviewId: salva.id, criada: false });
  }

  await listens.criar(userId, releaseId);
  const estaNaLista = await releases.estaNoQueroOuvir(userId, releaseId);

  return resposta(releaseId, {
    reviewId: salva.id,
    criada: true,
    escutaRegistrada: true,
    perguntarQueroOuvir: estaNaLista,
  });
}

/** Excluir a review remove SOMENTE a review (§30). */
const removerReview = async (ref, userId) => {
  const releaseId = await catalogo.resolverSePersistido(ref, userId);
  if (!releaseId) return { releaseId: null, removida: false };
  return { releaseId, removida: await reviews.remover(userId, releaseId) };
};

/**
 * Nota e review na mesma acao de interface: uma escuta automatica so (§28).
 */
async function avaliarEResenhar(ref, userId, { nota = null, texto = null }) {
  const releaseId = await catalogo.garantirPersistido(ref, userId);
  let criouAlgo = false;

  if (nota !== null && nota !== undefined) {
    const salva = await ratings.salvar(userId, releaseId, nota);
    criouAlgo = criouAlgo || salva.criada;
  }

  if (typeof texto === "string" && texto.trim().length > 0) {
    const salva = await reviews.salvar(userId, releaseId, texto.trim());
    criouAlgo = criouAlgo || salva.criada;
  }

  if (!criouAlgo) return resposta(releaseId);

  await listens.criar(userId, releaseId);
  const estaNaLista = await releases.estaNoQueroOuvir(userId, releaseId);

  return resposta(releaseId, {
    escutaRegistrada: true,
    perguntarQueroOuvir: estaNaLista,
  });
}

// ─── Favoritos (§31) e Quero ouvir (§32) ────────────────────────────────────
// Favoritar uma obra que so existe na API provoca a persistencia dela antes.

async function favoritar(ref, userId) {
  const releaseId = await catalogo.garantirPersistido(ref, userId);
  await releases.favoritar(userId, releaseId);
  return { releaseId };
}

async function desfavoritar(ref, userId) {
  const releaseId = await catalogo.resolverSePersistido(ref, userId);
  if (!releaseId) return { releaseId: null };
  await releases.desfavoritar(userId, releaseId);
  return { releaseId };
}

async function adicionarQueroOuvir(ref, userId) {
  const releaseId = await catalogo.garantirPersistido(ref, userId);
  await releases.adicionarQueroOuvir(userId, releaseId);
  return { releaseId };
}

async function removerQueroOuvir(ref, userId) {
  const releaseId = await catalogo.resolverSePersistido(ref, userId);
  if (!releaseId) return { releaseId: null };
  await releases.removerQueroOuvir(userId, releaseId);
  return { releaseId };
}

module.exports = {
  registrarEscuta,
  avaliar,
  removerAvaliacao,
  publicarReview,
  removerReview,
  avaliarEResenhar,
  favoritar,
  desfavoritar,
  adicionarQueroOuvir,
  removerQueroOuvir,
};
