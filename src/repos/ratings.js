"use strict";

const db = require("../db");

/**
 * Avaliacoes (§29).
 *
 * Uma avaliacao ATUAL por usuario e obra, alteravel, sem historico de versoes.
 * A escala oficial e' 0,5 a 5 de meia em meia — a restricao esta na migracao,
 * e a validacao de entrada tambem acontece na rota.
 */

const ESCALA_MINIMA = 0.5;
const ESCALA_MAXIMA = 5;

/** Confere a escala oficial antes de tocar no banco. */
function escalaValida(nota) {
  const valor = Number(nota);
  return (
    Number.isFinite(valor) &&
    valor >= ESCALA_MINIMA &&
    valor <= ESCALA_MAXIMA &&
    Number.isInteger(valor * 2)
  );
}

/**
 * Cria ou atualiza a avaliacao do usuario.
 *
 * O `xmax = 0` no RETURNING distingue insercao de atualizacao: e' assim que a
 * rota sabe se deve registrar a escuta automatica (§28) — ela acontece somente
 * na criacao, nunca na edicao.
 */
async function salvar(userId, releaseId, nota) {
  if (!escalaValida(nota)) throw new Error("nota fora da escala oficial");

  return db.one(
    `INSERT INTO ratings (user_id, release_id, rating)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, release_id)
       DO UPDATE SET rating = EXCLUDED.rating, updated_at = now()
     RETURNING rating::float AS rating, (xmax = 0) AS criada`,
    [userId, releaseId, nota]
  );
}

async function remover(userId, releaseId) {
  const resultado = await db.query(
    "DELETE FROM ratings WHERE user_id = $1 AND release_id = $2",
    [userId, releaseId]
  );
  return resultado.rowCount > 0;
}

const doUsuarioParaObra = (userId, releaseId) =>
  db.one(
    `SELECT rating::float AS rating, created_at, updated_at
       FROM ratings WHERE user_id = $1 AND release_id = $2`,
    [userId, releaseId]
  );

/** Media e quantidade da comunidade para uma obra (§29). */
async function daComunidade(releaseId) {
  const linha = await db.one(
    `SELECT round(avg(rating), 2)::float AS media, count(*)::int AS total
       FROM ratings WHERE release_id = $1`,
    [releaseId]
  );
  return linha || { media: null, total: 0 };
}

/** Distribuicao de notas, usada no histograma da pagina da obra (§37). */
const histograma = (releaseId) =>
  db.rows(
    `SELECT rating::float AS nota, count(*)::int AS quantidade
       FROM ratings WHERE release_id = $1
      GROUP BY rating ORDER BY rating`,
    [releaseId]
  );

/** Avaliacoes do usuario, para a area "Avaliacoes" do perfil (§24). */
const doUsuario = ({ userId, limite = 100 }) =>
  db.rows(
    `SELECT av.rating::float AS rating, av.updated_at,
            r.id AS release_id, r.title, r.type, r.release_year, r.cover_url, r.origin,
            a.id AS artist_id, a.name AS artist_name
       FROM ratings av
       JOIN releases r ON r.id = av.release_id
       JOIN artists  a ON a.id = r.artist_id
      WHERE av.user_id = $1
      ORDER BY av.updated_at DESC
      LIMIT $2`,
    [userId, limite]
  );

async function estatisticas(userId) {
  const linha = await db.one(
    `SELECT count(*)::int AS total, round(avg(rating), 2)::float AS media
       FROM ratings WHERE user_id = $1`,
    [userId]
  );
  return linha || { total: 0, media: null };
}

module.exports = {
  ESCALA_MINIMA,
  ESCALA_MAXIMA,
  escalaValida,
  salvar,
  remover,
  doUsuarioParaObra,
  daComunidade,
  histograma,
  doUsuario,
  estatisticas,
};
