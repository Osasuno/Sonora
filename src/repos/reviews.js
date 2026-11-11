"use strict";

const db = require("../db");

/**
 * Reviews (§30).
 *
 * Uma review ATUAL por usuario e obra. Excluir a review remove somente a
 * review: escuta, avaliacao, favorito, quero ouvir e presenca em listas
 * continuam intactos (§30, §55).
 */

const PROJECAO = `
  SELECT rv.id, rv.review, rv.created_at, rv.updated_at,
         u.id AS user_id, u.username, u.display_name,
         r.id AS release_id, r.title, r.type, r.release_year, r.cover_url, r.origin,
         a.id AS artist_id, a.name AS artist_name,
         av.rating::float AS rating
    FROM reviews rv
    JOIN users    u ON u.id = rv.user_id
    JOIN releases r ON r.id = rv.release_id
    JOIN artists  a ON a.id = r.artist_id
    LEFT JOIN ratings av ON av.user_id = rv.user_id AND av.release_id = rv.release_id`;

/**
 * Cria ou atualiza a review. O `xmax = 0` distingue insercao de atualizacao,
 * que e' como a rota sabe se deve registrar a escuta automatica (§28).
 */
const salvar = (userId, releaseId, texto) =>
  db.one(
    `INSERT INTO reviews (user_id, release_id, review)
     VALUES ($1, $2, $3)
     ON CONFLICT (user_id, release_id)
       DO UPDATE SET review = EXCLUDED.review, updated_at = now()
     RETURNING id, (xmax = 0) AS criada`,
    [userId, releaseId, texto]
  );

/** Exclusao pelo proprio autor. */
async function remover(userId, releaseId) {
  const resultado = await db.query(
    "DELETE FROM reviews WHERE user_id = $1 AND release_id = $2",
    [userId, releaseId]
  );
  return resultado.rowCount > 0;
}

/** Exclusao por administrador, na moderacao (§45). */
async function removerPorId(reviewId) {
  const resultado = await db.query("DELETE FROM reviews WHERE id = $1", [reviewId]);
  return resultado.rowCount > 0;
}

const doUsuarioParaObra = (userId, releaseId) =>
  db.one(
    `SELECT id, review, created_at, updated_at
       FROM reviews WHERE user_id = $1 AND release_id = $2`,
    [userId, releaseId]
  );

/** Reviews da comunidade na pagina da obra (§37, §44). */
const daObra = ({ releaseId, limite = 40 }) =>
  db.rows(`${PROJECAO} WHERE rv.release_id = $1 ORDER BY rv.created_at DESC LIMIT $2`, [
    releaseId,
    limite,
  ]);

const doUsuario = ({ userId, limite = 100 }) =>
  db.rows(`${PROJECAO} WHERE rv.user_id = $1 ORDER BY rv.created_at DESC LIMIT $2`, [
    userId,
    limite,
  ]);

/** Todas as reviews, para a tela de moderacao (§45). */
const recentes = (limite = 60) =>
  db.rows(`${PROJECAO} ORDER BY rv.created_at DESC LIMIT $1`, [limite]);

async function estatisticas(userId) {
  const linha = await db.one("SELECT count(*)::int AS total FROM reviews WHERE user_id = $1", [
    userId,
  ]);
  return linha || { total: 0 };
}

async function totalDaObra(releaseId) {
  const linha = await db.one("SELECT count(*)::int AS total FROM reviews WHERE release_id = $1", [
    releaseId,
  ]);
  return linha?.total || 0;
}

module.exports = {
  salvar,
  remover,
  removerPorId,
  doUsuarioParaObra,
  daObra,
  doUsuario,
  recentes,
  estatisticas,
  totalDaObra,
};
