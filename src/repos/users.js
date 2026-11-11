"use strict";

const db = require("../db");

/**
 * Contas da plataforma.
 *
 * Sem relacoes sociais: seguir pessoas ficou fora do MVP (secao 20 do escopo).
 * A dimensao social do MVP acontece na pagina da obra, com as notas e reviews da
 * comunidade (US19).
 */

const COLUNAS = "id, username, email, display_name, password_hash, is_admin, bio, created_at";
const PUBLICAS = "id, username, display_name, is_admin, bio, created_at";

const findByUsername = (username) =>
  db.one(`SELECT ${COLUNAS} FROM users WHERE lower(username) = lower($1)`, [username]);

const findByEmail = (email) =>
  email
    ? db.one(`SELECT ${COLUNAS} FROM users WHERE lower(email) = lower($1)`, [email])
    : Promise.resolve(null);

const findById = (id) => db.one(`SELECT ${COLUNAS} FROM users WHERE id = $1`, [id]);

const listAll = () => db.rows(`SELECT ${PUBLICAS} FROM users ORDER BY lower(display_name)`);

const create = ({ username, email = null, displayName, passwordHash, isAdmin = false }) =>
  db.one(
    `INSERT INTO users (username, email, display_name, password_hash, is_admin)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PUBLICAS}`,
    [username, email, displayName || username, passwordHash, isAdmin]
  );

const updateProfile = (id, { displayName, bio }) =>
  db.one(
    `UPDATE users
        SET display_name = COALESCE($2, display_name),
            bio          = COALESCE($3, bio)
      WHERE id = $1
      RETURNING ${PUBLICAS}`,
    [id, displayName ?? null, bio ?? null]
  );

const setPassword = (id, passwordHash) =>
  db.query("UPDATE users SET password_hash = $2 WHERE id = $1", [id, passwordHash]);

const setAdmin = (id, isAdmin) =>
  db.query("UPDATE users SET is_admin = $2 WHERE id = $1", [id, isAdmin]);

const remove = (id) => db.query("DELETE FROM users WHERE id = $1", [id]);

/**
 * Contribuicoes ao catalogo (§19).
 *
 * Somente cadastro manual conta. Encontrar uma obra pelo MusicBrainz ou ser a
 * primeira pessoa a interagir com ela NAO e' contribuicao.
 */
async function contribuicoes(userId) {
  const linha = await db.one(
    "SELECT count(*)::int AS manuais FROM releases WHERE created_by = $1 AND origin = 'MANUAL'",
    [userId]
  );
  return linha || { manuais: 0 };
}

module.exports = {
  findByUsername,
  findByEmail,
  findById,
  listAll,
  create,
  updateProfile,
  setPassword,
  setAdmin,
  remove,
  contribuicoes,
};
