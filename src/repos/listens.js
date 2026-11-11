"use strict";

const db = require("../db");

/**
 * Escutas (§26).
 *
 * Entidade propria e independente de nota e review (§27). O mesmo usuario pode
 * registrar a mesma obra quantas vezes quiser, e cada ocorrencia aparece no
 * historico em ordem cronologica (§33).
 */

const PROJECAO = `
  SELECT l.id, l.listened_on, l.created_at,
         u.id AS user_id, u.username, u.display_name,
         r.id AS release_id, r.title, r.type, r.release_year, r.cover_url, r.origin,
         a.id AS artist_id, a.name AS artist_name
    FROM listens l
    JOIN users    u ON u.id = l.user_id
    JOIN releases r ON r.id = l.release_id
    JOIN artists  a ON a.id = r.artist_id`;

/**
 * Hoje no fuso do processo (variavel TZ), em AAAA-MM-DD. A escuta automatica
 * (§28) nao usa o `current_date` do banco: o Postgres do Supabase roda em UTC e,
 * a partir das 21h no Brasil, ja seria o dia seguinte.
 */
function hojeNoFuso() {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const criar = (userId, releaseId, listenedOn = null) =>
  db.one(
    `INSERT INTO listens (user_id, release_id, listened_on)
     VALUES ($1, $2, $3::date)
     RETURNING id, listened_on`,
    [userId, releaseId, listenedOn || hojeNoFuso()]
  );

async function remover(listenId, userId) {
  const resultado = await db.query("DELETE FROM listens WHERE id = $1 AND user_id = $2", [
    listenId,
    userId,
  ]);
  return resultado.rowCount > 0;
}

const porId = (listenId) => db.one(`${PROJECAO} WHERE l.id = $1`, [listenId]);

/** Historico do usuario: mais recente primeiro (§33). */
const historico = ({ userId, limite = 100 }) =>
  db.rows(
    `${PROJECAO}
      WHERE l.user_id = $1
      ORDER BY l.listened_on DESC, l.created_at DESC
      LIMIT $2`,
    [userId, limite]
  );

/** Escutas do usuario para uma obra, usadas na pagina do lancamento (§37). */
const doUsuarioParaObra = (userId, releaseId) =>
  db.rows(
    `SELECT id, listened_on, created_at
       FROM listens
      WHERE user_id = $1 AND release_id = $2
      ORDER BY listened_on DESC, created_at DESC`,
    [userId, releaseId]
  );

/**
 * Obras distintas que a pessoa ouviu, com a contagem de escutas e a nota
 * atual dela para cada uma. Alimenta a area "Obras ouvidas" do perfil (§24).
 */
const obrasOuvidas = ({ userId, limite = 100 }) =>
  db.rows(
    `SELECT r.id, r.title, r.type, r.release_year, r.cover_url, r.origin,
            a.id AS artist_id, a.name AS artist_name,
            count(l.id)::int        AS escutas,
            max(l.listened_on)      AS ultima_escuta,
            av.rating::float        AS minha_nota
       FROM listens l
       JOIN releases r ON r.id = l.release_id
       JOIN artists  a ON a.id = r.artist_id
       LEFT JOIN ratings av ON av.release_id = r.id AND av.user_id = l.user_id
      WHERE l.user_id = $1
      GROUP BY r.id, r.title, r.type, r.release_year, r.cover_url, r.origin,
               a.id, a.name, av.rating
      ORDER BY max(l.listened_on) DESC
      LIMIT $2`,
    [userId, limite]
  );

/** Popularidade (§42): no Sonora, popularidade e' quantidade de escutas. */
async function totalDaObra(releaseId) {
  const linha = await db.one(
    "SELECT count(*)::int AS escutas, count(DISTINCT user_id)::int AS ouvintes FROM listens WHERE release_id = $1",
    [releaseId]
  );
  return linha || { escutas: 0, ouvintes: 0 };
}

/** Numeros do perfil (§24). */
async function estatisticas(userId) {
  const linha = await db.one(
    `SELECT count(*)::int                     AS total_escutas,
            count(DISTINCT release_id)::int   AS obras_ouvidas
       FROM listens WHERE user_id = $1`,
    [userId]
  );
  return linha || { total_escutas: 0, obras_ouvidas: 0 };
}

module.exports = {
  criar,
  remover,
  porId,
  historico,
  doUsuarioParaObra,
  obrasOuvidas,
  totalDaObra,
  estatisticas,
};
