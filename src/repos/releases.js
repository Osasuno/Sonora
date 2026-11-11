"use strict";

const db = require("../db");

/**
 * Lancamentos persistidos no Sonora (§15, §49).
 *
 * Atencao ao papel desta tabela depois da especificacao oficial: ela NAO e'
 * mais a fonte da pesquisa (§12, §39). O catalogo normal vem do MusicBrainz;
 * aqui ficam apenas as obras com as quais alguem interagiu (§13) e as obras
 * cadastradas a mao (§16).
 *
 * Por isso as consultas daqui servem para: exploracao com filtros (§40-43),
 * agregados da comunidade (§29) e as areas do perfil (§24).
 */

const TIPOS = ["ALBUM", "EP", "SINGLE"];
const ORIGENS = ["API", "MANUAL"];

// Agregados por subconsulta em vez de GROUP BY: mantem a projecao legivel e,
// no volume do MVP, a diferenca de custo e' irrelevante.
const CARTAO = `
  r.id, r.mbid, r.title, r.type, r.release_date, r.release_year, r.release_date_text,
  r.cover_url, r.genres, r.origin, r.created_at,
  a.id AS artist_id, a.name AS artist_name, a.mbid AS artist_mbid,
  (SELECT count(*)::int FROM listens l  WHERE l.release_id  = r.id) AS escutas,
  (SELECT count(*)::int FROM reviews rv WHERE rv.release_id = r.id) AS total_reviews,
  (SELECT count(*)::int FROM ratings av WHERE av.release_id = r.id) AS total_notas,
  (SELECT round(avg(av.rating), 2)::float FROM ratings av WHERE av.release_id = r.id) AS nota_media,
  (SELECT av.rating::float FROM ratings av
    WHERE av.release_id = r.id AND av.user_id = $1) AS minha_nota`;

const BASE = `FROM releases r JOIN artists a ON a.id = r.artist_id`;

/**
 * Ordenacoes oficiais (§40-43). Note que "recentes" sao duas coisas
 * diferentes e nao devem ser tratadas como equivalentes (§43):
 *   lancamento  = data de lancamento da obra
 *   adicionados = data de entrada no catalogo do Sonora
 */
const ORDENACOES = {
  // Ordenar por `release_date` jogaria para o fim toda obra que informa apenas
  // o ano, porque nela a data completa e' nula — e 2024 apareceria depois de
  // 1991. O texto ISO ordena certo nas tres precisoes, porque e' zero-padded:
  // "2024" > "1991-11-04" lexicograficamente, como tem que ser.
  lancamento: "r.release_date_text DESC NULLS LAST",
  adicionados: "r.created_at DESC",
  antigos: "r.release_date_text ASC NULLS LAST",
  alfabetica: "lower(r.title) ASC",
  nota_comunidade: "nota_media DESC NULLS LAST, total_notas DESC",
  minha_nota: "minha_nota DESC NULLS LAST",
  popularidade: "escutas DESC, nota_media DESC NULLS LAST",
};

const viewer = (userId) => userId || 0;

// ─── Leitura ────────────────────────────────────────────────────────────────

const porId = (id, userId) =>
  db.one(
    `SELECT ${CARTAO}, r.created_by, u.username AS created_by_username
       ${BASE}
       LEFT JOIN users u ON u.id = r.created_by
      WHERE r.id = $2`,
    [viewer(userId), id]
  );

const porMbid = (mbid, userId) =>
  mbid
    ? db.one(
        `SELECT ${CARTAO}, r.created_by, u.username AS created_by_username
           ${BASE}
           LEFT JOIN users u ON u.id = r.created_by
          WHERE r.mbid = $2`,
        [viewer(userId), mbid]
      )
    : Promise.resolve(null);

/** Quais destes MBIDs ja estao persistidos: usado para enriquecer a busca. */
async function idsPorMbids(mbids) {
  const validos = (mbids || []).filter(Boolean);
  if (validos.length === 0) return new Map();

  const linhas = await db.rows(
    `SELECT r.id, r.mbid,
            (SELECT round(avg(av.rating), 2)::float FROM ratings av WHERE av.release_id = r.id) AS nota_media,
            (SELECT count(*)::int FROM listens l WHERE l.release_id = r.id) AS escutas
       FROM releases r WHERE r.mbid = ANY($1::uuid[])`,
    [validos]
  );
  return new Map(linhas.map((linha) => [linha.mbid, linha]));
}

/**
 * Duplicidade (§20). O MBID e' o critério principal; o titulo normalizado e'
 * a segunda verificacao, para obras sem identificador externo.
 */
const duplicataPorTitulo = ({ artistId, title, type }) =>
  db.one(
    `SELECT r.id, r.title, r.origin, a.name AS artist_name
       ${BASE}
      WHERE r.artist_id = $1 AND lower(btrim(r.title)) = lower(btrim($2)) AND r.type = $3`,
    [artistId, title, type]
  );

// ─── Escrita ────────────────────────────────────────────────────────────────

/**
 * Decompoe a data nas tres colunas do §17.
 *
 * `dataTexto` pode ser "1997", "1997-05" ou "1997-05-21". Guardamos o texto
 * original para nao inventar precisao na apresentacao, e derivamos o ano (que
 * filtra) e a data completa (que ordena) do que houver.
 */
function decomporData(dataTexto, anoExplicito) {
  const texto = dataTexto ? String(dataTexto).trim() : "";
  const valido = /^\d{4}(-\d{2}(-\d{2})?)?$/.test(texto);

  if (!valido) {
    return {
      texto: anoExplicito ? String(anoExplicito) : null,
      completa: null,
      ano: anoExplicito ?? null,
    };
  }

  return {
    texto,
    completa: texto.length === 10 ? texto : null,
    ano: anoExplicito ?? Number.parseInt(texto.slice(0, 4), 10),
  };
}

async function criar({
  mbid = null,
  title,
  artistId,
  type,
  releaseDate = null,
  releaseYear = null,
  coverUrl = null,
  genres = [],
  origin,
  createdBy = null,
}) {
  if (!TIPOS.includes(type)) throw new Error("tipo de lancamento invalido");
  if (!ORIGENS.includes(origin)) throw new Error("origem invalida");

  const data = decomporData(releaseDate, releaseYear);

  return db.one(
    `INSERT INTO releases
       (mbid, title, artist_id, type, release_date, release_year, release_date_text,
        cover_url, genres, origin, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [
      mbid,
      title.trim(),
      artistId,
      type,
      data.completa,
      data.ano,
      data.texto,
      coverUrl,
      genres,
      origin,
      createdBy,
    ]
  );
}

/** Edicao de obra manual pelo administrador (§45). */
const atualizarManual = (id, { title, type, releaseDate, releaseYear, coverUrl, genres }) => {
  const data = releaseDate || releaseYear ? decomporData(releaseDate, releaseYear) : null;

  return db.one(
    `UPDATE releases
        SET title             = COALESCE($2, title),
            type              = COALESCE($3, type),
            release_date      = CASE WHEN $4::bool THEN $5::date ELSE release_date END,
            release_year      = COALESCE($6::int, release_year),
            release_date_text = COALESCE($7, release_date_text),
            cover_url         = COALESCE($8, cover_url),
            genres            = COALESCE($9::text[], genres)
      WHERE id = $1 AND origin = 'MANUAL'
      RETURNING id`,
    [
      id,
      title ?? null,
      type ?? null,
      Boolean(data),
      data?.completa ?? null,
      data?.ano ?? null,
      data?.texto ?? null,
      coverUrl ?? null,
      genres ?? null,
    ]
  );
};

/** Remocao de obra manual pelo administrador (§45). */
async function removerManual(id) {
  const resultado = await db.query("DELETE FROM releases WHERE id = $1 AND origin = 'MANUAL'", [id]);
  return resultado.rowCount > 0;
}

// ─── Exploracao com filtros (§40-43) ────────────────────────────────────────

/**
 * Monta o WHERE a partir dos filtros. Tudo entra como bind — nada de
 * concatenacao de input em SQL.
 */
function montarFiltro(criterios, parametros) {
  const condicoes = [];
  const adicionar = (sql, valor) => {
    parametros.push(valor);
    condicoes.push(sql.replace("$?", `$${parametros.length}`));
  };

  if (criterios.termo) {
    parametros.push(criterios.termo);
    const i = parametros.length;
    condicoes.push(`(r.title ILIKE '%' || $${i} || '%' OR a.name ILIKE '%' || $${i} || '%')`);
  }
  if (criterios.tipo) adicionar("r.type = $?", criterios.tipo);
  if (criterios.artistId) adicionar("r.artist_id = $?", criterios.artistId);
  if (criterios.genero) adicionar("$? = ANY (r.genres)", criterios.genero);
  if (criterios.origem) adicionar("r.origin = $?", criterios.origem);
  if (criterios.anoDe !== null && criterios.anoDe !== undefined) {
    adicionar("r.release_year >= $?", criterios.anoDe);
  }
  if (criterios.anoAte !== null && criterios.anoAte !== undefined) {
    adicionar("r.release_year <= $?", criterios.anoAte);
  }
  // §41: as duas perspectivas de avaliacao.
  if (criterios.notaComunidadeMin) {
    adicionar(
      "(SELECT avg(av.rating) FROM ratings av WHERE av.release_id = r.id) >= $?",
      criterios.notaComunidadeMin
    );
  }
  if (criterios.minhaNotaMin) {
    parametros.push(viewer(criterios.userId));
    const usuario = parametros.length;
    parametros.push(criterios.minhaNotaMin);
    condicoes.push(
      `(SELECT av.rating FROM ratings av WHERE av.release_id = r.id AND av.user_id = $${usuario}) >= $${parametros.length}`
    );
  }

  return condicoes.length > 0 ? `WHERE ${condicoes.join(" AND ")}` : "";
}

function explorar(criterios = {}) {
  const { ordem = "adicionados", limite = 36, deslocamento = 0, userId } = criterios;
  const parametros = [viewer(userId)];
  const where = montarFiltro(criterios, parametros);
  const ordenacao = ORDENACOES[ordem] || ORDENACOES.adicionados;

  parametros.push(limite, deslocamento);
  return db.rows(
    `SELECT ${CARTAO} ${BASE} ${where}
      ORDER BY ${ordenacao}
      LIMIT $${parametros.length - 1} OFFSET $${parametros.length}`,
    parametros
  );
}

async function contar(criterios = {}) {
  // Sem a projecao CARTAO nada referencia o usuario em $1. Entra so o que o
  // filtro usar: o Postgres recusa bind com parametro sobrando.
  const parametros = [];
  const where = montarFiltro(criterios, parametros);
  const linha = await db.one(`SELECT count(*)::int AS total ${BASE} ${where}`, parametros);
  return linha?.total || 0;
}

/** Opcoes de filtro tiradas do proprio catalogo persistido. */
const generosDisponiveis = () =>
  db.rows(
    `SELECT genero, count(*)::int AS total
       FROM releases r, unnest(r.genres) AS genero
      GROUP BY genero ORDER BY total DESC, genero LIMIT 60`
  );

const faixaDeAnos = () =>
  db.one(
    "SELECT min(release_year)::int AS menor, max(release_year)::int AS maior FROM releases WHERE release_year IS NOT NULL"
  );

const contagemPorTipo = () =>
  db.rows("SELECT type, count(*)::int AS total FROM releases GROUP BY type ORDER BY type");

const contagemPorOrigem = () =>
  db.rows("SELECT origin, count(*)::int AS total FROM releases GROUP BY origin ORDER BY origin");

/** Obras persistidas de um artista (complementa a discografia da API). */
const doArtista = (artistId, userId) =>
  db.rows(
    `SELECT ${CARTAO} ${BASE} WHERE r.artist_id = $2
      ORDER BY ${ORDENACOES.lancamento}`,
    [viewer(userId), artistId]
  );

/** Obras manuais, para a administracao de catalogo (§45). */
const manuais = (userId) =>
  db.rows(
    `SELECT ${CARTAO}, r.created_by, u.username AS created_by_username
       ${BASE}
       LEFT JOIN users u ON u.id = r.created_by
      WHERE r.origin = 'MANUAL'
      ORDER BY r.created_at DESC`,
    [viewer(userId)]
  );

// ─── Favoritos (§31) e Quero ouvir (§32) ────────────────────────────────────

const favoritosDe = (userId) =>
  db.rows(
    `SELECT ${CARTAO}, f.created_at AS marcado_em
       ${BASE}
       JOIN favorites f ON f.release_id = r.id
      WHERE f.user_id = $1
      ORDER BY f.created_at DESC`,
    [viewer(userId)]
  );

const favoritar = (userId, releaseId) =>
  db.query(
    "INSERT INTO favorites (user_id, release_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [userId, releaseId]
  );

const desfavoritar = (userId, releaseId) =>
  db.query("DELETE FROM favorites WHERE user_id = $1 AND release_id = $2", [userId, releaseId]);

const queroOuvirDe = (userId) =>
  db.rows(
    `SELECT ${CARTAO}, w.created_at AS marcado_em
       ${BASE}
       JOIN watchlist w ON w.release_id = r.id
      WHERE w.user_id = $1
      ORDER BY w.created_at DESC`,
    [viewer(userId)]
  );

const adicionarQueroOuvir = (userId, releaseId) =>
  db.query(
    "INSERT INTO watchlist (user_id, release_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
    [userId, releaseId]
  );

const removerQueroOuvir = (userId, releaseId) =>
  db.query("DELETE FROM watchlist WHERE user_id = $1 AND release_id = $2", [userId, releaseId]);

const estaNoQueroOuvir = async (userId, releaseId) => {
  const linha = await db.one(
    "SELECT 1 AS existe FROM watchlist WHERE user_id = $1 AND release_id = $2",
    [userId, releaseId]
  );
  return Boolean(linha);
};

/** Marcas do usuario sobre a obra, para a pagina do lancamento (§37). */
async function marcasDoUsuario(userId, releaseId) {
  const linha = await db.one(
    `SELECT EXISTS (SELECT 1 FROM favorites WHERE user_id = $1 AND release_id = $2) AS favorito,
            EXISTS (SELECT 1 FROM watchlist WHERE user_id = $1 AND release_id = $2) AS quero_ouvir`,
    [userId, releaseId]
  );
  return linha || { favorito: false, quero_ouvir: false };
}

module.exports = {
  TIPOS,
  ORIGENS,
  ORDENACOES,
  porId,
  porMbid,
  idsPorMbids,
  duplicataPorTitulo,
  criar,
  atualizarManual,
  removerManual,
  explorar,
  contar,
  generosDisponiveis,
  faixaDeAnos,
  contagemPorTipo,
  contagemPorOrigem,
  doArtista,
  manuais,
  favoritosDe,
  favoritar,
  desfavoritar,
  queroOuvirDe,
  adicionarQueroOuvir,
  removerQueroOuvir,
  estaNoQueroOuvir,
  marcasDoUsuario,
};
