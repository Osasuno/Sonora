"use strict";

const db = require("../db");

/**
 * Listas (§34, §35, §36).
 *
 * Nascem PUBLICAS e podem virar privadas. Lista privada so aparece para o
 * proprietario — e, no contexto de moderacao, para um administrador (§24).
 * Cada item aceita um comentario textual proprio; nao existe nota numerica
 * separada do item, porque a avaliacao oficial e' a do usuario para a obra.
 */

const VISIBILIDADES = ["PUBLIC", "PRIVATE"];

const PROJECAO = `
  SELECT l.id, l.title, l.description, l.visibility, l.created_at, l.updated_at,
         u.id AS user_id, u.username, u.display_name,
         (SELECT count(*)::int FROM list_items i WHERE i.list_id = l.id) AS total_itens
    FROM lists l
    JOIN users u ON u.id = l.user_id`;

const criar = ({ userId, title, description = "", visibility = "PUBLIC" }) =>
  db.one(
    `INSERT INTO lists (user_id, title, description, visibility)
     VALUES ($1, $2, $3, $4) RETURNING id`,
    [userId, title.trim(), description, VISIBILIDADES.includes(visibility) ? visibility : "PUBLIC"]
  );

const atualizar = (listId, userId, { title, description = "", visibility = "PUBLIC" }) =>
  db.one(
    `UPDATE lists
        SET title = $3, description = $4, visibility = $5, updated_at = now()
      WHERE id = $1 AND user_id = $2
      RETURNING id`,
    [listId, userId, title.trim(), description, VISIBILIDADES.includes(visibility) ? visibility : "PUBLIC"]
  );

async function remover(listId, userId) {
  const resultado = await db.query("DELETE FROM lists WHERE id = $1 AND user_id = $2", [
    listId,
    userId,
  ]);
  return resultado.rowCount > 0;
}

/** Remocao por administrador, na moderacao (§45). */
async function removerPorId(listId) {
  const resultado = await db.query("DELETE FROM lists WHERE id = $1", [listId]);
  return resultado.rowCount > 0;
}

const porId = (listId) => db.one(`${PROJECAO} WHERE l.id = $1`, [listId]);

/** Listas de um perfil. Quem nao e' o dono (nem admin) so ve as publicas. */
const doUsuario = (userId, { incluirPrivadas = false } = {}) =>
  db.rows(
    `${PROJECAO}
      WHERE l.user_id = $1 ${incluirPrivadas ? "" : "AND l.visibility = 'PUBLIC'"}
      ORDER BY l.updated_at DESC`,
    [userId]
  );

/** Exploracao de listas publicas da comunidade (§36). */
const publicas = (limite = 40) =>
  db.rows(
    `${PROJECAO} WHERE l.visibility = 'PUBLIC' ORDER BY l.updated_at DESC LIMIT $1`,
    [limite]
  );

/** Todas as listas, para a tela de moderacao (§45). */
const todas = (limite = 80) =>
  db.rows(`${PROJECAO} ORDER BY l.updated_at DESC LIMIT $1`, [limite]);

const itens = (listId, userId) =>
  db.rows(
    `SELECT i.position, i.comment,
            r.id, r.mbid, r.title, r.type, r.release_year, r.cover_url, r.origin,
            a.id AS artist_id, a.name AS artist_name,
            (SELECT round(avg(av.rating), 2)::float FROM ratings av WHERE av.release_id = r.id) AS nota_media,
            (SELECT av.rating::float FROM ratings av WHERE av.release_id = r.id AND av.user_id = $2) AS minha_nota
       FROM list_items i
       JOIN releases r ON r.id = i.release_id
       JOIN artists  a ON a.id = r.artist_id
      WHERE i.list_id = $1
      ORDER BY i.position`,
    [listId, userId || 0]
  );

const capas = (listId, limite = 4) =>
  db.rows(
    `SELECT r.cover_url
       FROM list_items i JOIN releases r ON r.id = i.release_id
      WHERE i.list_id = $1 AND r.cover_url IS NOT NULL
      ORDER BY i.position LIMIT $2`,
    [listId, limite]
  );

/** Substitui os itens pela ordem recebida. Obra repetida entra uma vez so. */
async function substituirItens(listId, entradas) {
  return db.transaction(async (client) => {
    await client.query("DELETE FROM list_items WHERE list_id = $1", [listId]);

    const vistos = new Set();
    let posicao = 0;
    for (const item of entradas) {
      const releaseId = Number(item.releaseId);
      if (vistos.has(releaseId)) continue;
      vistos.add(releaseId);

      posicao += 1;
      await client.query(
        "INSERT INTO list_items (list_id, release_id, position, comment) VALUES ($1, $2, $3, $4)",
        [listId, releaseId, posicao, item.comment || ""]
      );
    }
    await client.query("UPDATE lists SET updated_at = now() WHERE id = $1", [listId]);
    return posicao;
  });
}

/** Adiciona uma obra ao fim da lista, sem mexer no resto. */
async function adicionarItem(listId, releaseId, comment = "") {
  const posicao = await db.one(
    "SELECT COALESCE(max(position), 0) + 1 AS proxima FROM list_items WHERE list_id = $1",
    [listId]
  );
  await db.query(
    `INSERT INTO list_items (list_id, release_id, position, comment)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (list_id, release_id) DO NOTHING`,
    [listId, releaseId, posicao.proxima, comment]
  );
  await db.query("UPDATE lists SET updated_at = now() WHERE id = $1", [listId]);
}

module.exports = {
  VISIBILIDADES,
  criar,
  atualizar,
  remover,
  removerPorId,
  porId,
  doUsuario,
  publicas,
  todas,
  itens,
  capas,
  substituirItens,
  adicionarItem,
};
