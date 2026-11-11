"use strict";

const db = require("../db");

/**
 * Artistas persistidos (§21, §49).
 *
 * Dois artistas podem ter o mesmo nome, entao nome sozinho nao identifica
 * ninguem: quem distingue e' o MBID. Por isso nao existe unicidade por nome,
 * e a deduplicacao olha o identificador externo primeiro.
 *
 * A pagina de artista usa principalmente dados da API (§38); esta tabela
 * guarda apenas os artistas cujas obras entraram no catalogo.
 */

const COLUNAS = "id, mbid, name, sort_name, origin, created_by, created_at";

const porId = (id) => db.one(`SELECT ${COLUNAS} FROM artists WHERE id = $1`, [id]);

const porMbid = (mbid) =>
  mbid ? db.one(`SELECT ${COLUNAS} FROM artists WHERE mbid = $1`, [mbid]) : Promise.resolve(null);

/** Busca por nome exato: so vale para artistas sem MBID (cadastro manual). */
const porNomeSemMbid = (name) =>
  db.one(
    `SELECT ${COLUNAS} FROM artists
      WHERE lower(btrim(name)) = lower(btrim($1)) AND mbid IS NULL
      LIMIT 1`,
    [name]
  );

const criar = ({ mbid = null, name, sortName = null, origin, createdBy = null }) =>
  db.one(
    `INSERT INTO artists (mbid, name, sort_name, origin, created_by)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${COLUNAS}`,
    [mbid, name.trim(), sortName, origin, createdBy]
  );

/**
 * Devolve o artista existente ou cria um novo.
 *
 * Com MBID, a deduplicacao e' confiavel. Sem MBID (cadastro manual), caimos
 * no nome — e aceitamos o risco de homonimo, porque e' a unica informacao
 * disponivel nesse caso.
 */
async function garantir({ mbid = null, name, sortName = null, origin, createdBy = null }) {
  if (mbid) {
    const existente = await porMbid(mbid);
    if (existente) return existente;
    return criar({ mbid, name, sortName, origin, createdBy });
  }

  const porNome = await porNomeSemMbid(name);
  if (porNome) return porNome;
  return criar({ name, sortName, origin, createdBy });
}

/** Artistas com obra no catalogo, para o filtro por artista (§40). */
const comObras = () =>
  db.rows(
    `SELECT a.id, a.name, a.mbid, a.origin, count(r.id)::int AS total_lancamentos
       FROM artists a JOIN releases r ON r.artist_id = a.id
      GROUP BY a.id, a.name, a.mbid, a.origin
      ORDER BY lower(a.name)`
  );

module.exports = { porId, porMbid, porNomeSemMbid, criar, garantir, comObras };
