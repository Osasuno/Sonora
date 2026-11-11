"use strict";

const mb = require("../music/musicbrainz");
const caa = require("../music/coverart");
const { artists, releases } = require("../repos");

/**
 * Servico de catalogo — implementa o modelo hibrido do §13.
 *
 * A inversao que a especificacao exige (§12, §66-A): o MusicBrainz e' a fonte
 * NORMAL da pesquisa. O banco local nao e' consultado primeiro; ele guarda
 * apenas as obras com as quais alguem interagiu e as cadastradas a mao.
 *
 *   pesquisa      -> MusicBrainz (banco so complementa com nota e popularidade)
 *   visualizacao  -> pode vir so da API, sem persistir nada (§13)
 *   persistencia  -> somente quando ha interacao do usuario (§13, §15)
 */

const ORIGEM_API = "API";
const ORIGEM_MANUAL = "MANUAL";

class ErroCatalogo extends Error {
  constructor(mensagem, status = 400, codigo = null) {
    super(mensagem);
    this.name = "ErroCatalogo";
    this.status = status;
    this.codigo = codigo;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ehMbid = (valor) => UUID.test(String(valor || ""));
const ehIdLocal = (valor) => /^\d+$/.test(String(valor || ""));

/** Normaliza titulo para comparacao de duplicidade (§20). */
const normalizar = (texto) =>
  String(texto || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

// ─── Pesquisa (§39) ─────────────────────────────────────────────────────────

/**
 * Pesquisa lancamentos no MusicBrainz e complementa com os dados do Sonora.
 *
 * O banco entra apenas para dizer "esta obra ja existe aqui, com esta nota e
 * esta popularidade" — nunca como fonte dos resultados.
 */
async function pesquisarLancamentos(termo, { artista = "", limite = 24 } = {}) {
  const achados = await mb.buscarLancamentos(termo, { artista, limite });
  const locais = await releases.idsPorMbids(achados.map((item) => item.mbid));

  return achados.map((item) => {
    const local = locais.get(item.mbid);
    return {
      ...item,
      ref: item.mbid,
      origin: ORIGEM_API,
      coverUrl: caa.urlDaCapa(item.mbid),
      noSonora: Boolean(local),
      id: local?.id || null,
      notaMedia: local?.nota_media ?? null,
      escutas: local?.escutas ?? 0,
    };
  });
}

const pesquisarArtistas = (termo, limite = 12) => mb.buscarArtistas(termo, limite);

// ─── Visualizacao (§13, §37) ────────────────────────────────────────────────

/**
 * Resolve uma obra a partir da referencia usada na interface.
 *
 * `ref` pode ser um id local (obra ja persistida, inclusive manual) ou um MBID
 * (obra que talvez exista apenas na API). Abrir a pagina NAO persiste nada.
 */
async function obterLancamento(ref, userId) {
  if (ehIdLocal(ref)) {
    const local = await releases.porId(Number(ref), userId);
    if (!local) throw new ErroCatalogo("Lancamento nao encontrado.", 404);
    return { lancamento: local, persistido: true };
  }

  if (!ehMbid(ref)) throw new ErroCatalogo("Referencia de lancamento invalida.", 400);

  const jaLocal = await releases.porMbid(ref, userId);
  if (jaLocal) return { lancamento: jaLocal, persistido: true };

  // So existe na API: monta a mesma forma de apresentacao (§15, RNF17).
  const externo = await mb.lancamentoPorMbid(ref);
  const capa = caa.urlDaCapa(ref);

  return {
    lancamento: {
      id: null,
      mbid: externo.mbid,
      title: externo.title,
      type: externo.type,
      release_date: externo.releaseDate,
      release_year: externo.releaseYear,
      release_date_text: externo.releaseDateText,
      cover_url: capa,
      genres: externo.genres,
      origin: ORIGEM_API,
      created_at: null,
      artist_id: null,
      artist_mbid: externo.artista.mbid,
      artist_name: externo.artista.name,
      escutas: 0,
      total_reviews: 0,
      total_notas: 0,
      nota_media: null,
      minha_nota: null,
    },
    persistido: false,
  };
}

// ─── Persistencia sob interacao (§13, §15) ──────────────────────────────────

/**
 * Garante que a obra existe no banco e devolve o id local.
 *
 * Chamado apenas quando ha interacao persistente: escuta, avaliacao, review,
 * favorito, quero ouvir ou inclusao em lista. Visualizar nao chama isto.
 */
async function garantirPersistido(ref, userId) {
  if (ehIdLocal(ref)) {
    const local = await releases.porId(Number(ref), userId);
    if (!local) throw new ErroCatalogo("Lancamento nao encontrado.", 404);
    return local.id;
  }

  if (!ehMbid(ref)) throw new ErroCatalogo("Referencia de lancamento invalida.", 400);

  const jaLocal = await releases.porMbid(ref, userId);
  if (jaLocal) return jaLocal.id;

  const externo = await mb.lancamentoPorMbid(ref);

  const artista = await artists.garantir({
    mbid: externo.artista.mbid,
    name: externo.artista.name,
    sortName: externo.artista.sortName,
    origin: ORIGEM_API,
    createdBy: userId,
  });

  const capa = await caa.capaOuNulo(ref);

  const { id } = await releases.criar({
    mbid: externo.mbid,
    title: externo.title,
    artistId: artista.id,
    // Guarda a precisao original da data, nao a data completa inventada (§17).
    releaseDate: externo.releaseDateText || externo.releaseDate,
    releaseYear: externo.releaseYear,
    type: externo.type,
    coverUrl: capa,
    genres: externo.genres,
    origin: ORIGEM_API,
    createdBy: userId,
  });

  return id;
}

/**
 * Resolve o id local SEM criar nada. Devolve null quando a obra ainda nao esta
 * persistida.
 *
 * Serve para desfazer: remover nota, review, favorito ou quero ouvir de uma
 * obra que nunca foi persistida nao tem o que remover — e persistir nesse
 * momento criaria registro a partir de uma acao de remocao, contrariando o §13.
 */
async function resolverSePersistido(ref, userId) {
  if (ehIdLocal(ref)) {
    const local = await releases.porId(Number(ref), userId);
    return local?.id || null;
  }
  if (!ehMbid(ref)) throw new ErroCatalogo("Referencia de lancamento invalida.", 400);

  const jaLocal = await releases.porMbid(ref, userId);
  return jaLocal?.id || null;
}

// ─── Pagina de artista (§38) ────────────────────────────────────────────────

/**
 * Artista a partir da API, com a discografia dela. O banco complementa
 * marcando o que ja existe no Sonora, mas nao limita a lista.
 */
async function obterArtista(ref, userId) {
  if (ehIdLocal(ref)) {
    const local = await artists.porId(Number(ref));
    if (!local) throw new ErroCatalogo("Artista nao encontrado.", 404);
    if (!local.mbid) {
      // Artista de cadastro manual: nao existe na API, mostramos o que temos.
      return {
        artista: { ...local, mbid: null, somenteLocal: true },
        lancamentos: await releases.doArtista(local.id, userId),
      };
    }
    return obterArtistaPorMbid(local.mbid, userId);
  }

  if (!ehMbid(ref)) throw new ErroCatalogo("Referencia de artista invalida.", 400);
  return obterArtistaPorMbid(ref, userId);
}

async function obterArtistaPorMbid(mbid, userId) {
  const [perfil, discografia] = await Promise.all([
    mb.artistaPorMbid(mbid),
    mb.lancamentosDoArtista(mbid, 60),
  ]);

  const locais = await releases.idsPorMbids(discografia.map((item) => item.mbid));

  return {
    artista: { ...perfil, somenteLocal: false },
    lancamentos: discografia.map((item) => {
      const local = locais.get(item.mbid);
      return {
        ref: item.mbid,
        mbid: item.mbid,
        id: local?.id || null,
        title: item.title,
        type: item.type,
        release_year: item.releaseYear,
        release_date: item.releaseDate,
        release_date_text: item.releaseDateText,
        cover_url: caa.urlDaCapa(item.mbid),
        genres: item.genres,
        origin: ORIGEM_API,
        artist_name: perfil.name,
        artist_mbid: mbid,
        nota_media: local?.nota_media ?? null,
        escutas: local?.escutas ?? 0,
        noSonora: Boolean(local),
      };
    }),
  };
}

// ─── Cadastro manual como fallback controlado (§16, §52) ────────────────────

/**
 * Decide se o cadastro manual pode ser liberado.
 *
 * A especificacao separa dois casos que parecem iguais (§16):
 *   "a API respondeu e nao encontrou"  -> libera o cadastro
 *   "a API esta fora do ar"            -> NAO libera
 *
 * A diferenca importa porque uma indisponibilidade temporaria liberando
 * cadastro manual produziria duplicatas no catalogo. A verificacao acontece
 * aqui, no servidor — nao se confia no que o navegador afirma ter buscado.
 */
async function avaliarCadastroManual({ title, artistName }) {
  let candidatos;
  try {
    candidatos = await mb.buscarLancamentos(title, { artista: artistName, limite: 15 });
  } catch (erro) {
    throw new ErroCatalogo(
      "A fonte externa esta temporariamente indisponivel. Tente novamente em instantes antes de cadastrar a obra a mao.",
      503,
      "FONTE_INDISPONIVEL"
    );
  }

  const alvo = normalizar(title);
  const correspondente = candidatos.find((item) => normalizar(item.title) === alvo);

  if (correspondente) {
    return {
      liberado: false,
      motivo: "ENCONTRADA_NA_API",
      correspondente: {
        ref: correspondente.mbid,
        mbid: correspondente.mbid,
        title: correspondente.title,
        type: correspondente.type,
        releaseYear: correspondente.releaseYear,
        artistName: correspondente.artista.name,
        coverUrl: caa.urlDaCapa(correspondente.mbid),
      },
    };
  }

  return { liberado: true, motivo: "NAO_ENCONTRADA", consultados: candidatos.length };
}

/**
 * Cadastra uma obra a mao. Campos obrigatorios conforme §17: titulo, artista,
 * tipo, data de lancamento e capa. Pais nao e' exigido.
 */
async function cadastrarManual(dados, { userId }) {
  const title = String(dados.title || "").trim();
  const artistName = String(dados.artistName || "").trim();

  if (!title) throw new ErroCatalogo("Informe o titulo do lancamento.");
  if (!artistName) throw new ErroCatalogo("Informe o artista.");
  if (!releases.TIPOS.includes(dados.type)) throw new ErroCatalogo("Escolha album, EP ou single.");
  // §17: data obrigatoria, mas na precisao que se tem — ano, ano/mes ou dia.
  if (!dados.releaseDate) {
    throw new ErroCatalogo("Informe a data de lancamento (ano, ano/mes ou data completa).");
  }
  if (!dados.coverUrl) throw new ErroCatalogo("Informe o endereco da capa.");

  // Porta de entrada: a API precisa ter respondido e nao encontrado (§16).
  const avaliacao = await avaliarCadastroManual({ title, artistName });
  if (!avaliacao.liberado) {
    throw new ErroCatalogo(
      `"${avaliacao.correspondente.title}" existe no catalogo externo. Use o resultado da pesquisa em vez de cadastrar a mao.`,
      409,
      "ENCONTRADA_NA_API"
    );
  }

  const artista = await artists.garantir({
    name: artistName,
    origin: ORIGEM_MANUAL,
    createdBy: userId,
  });

  // Duplicidade (§20, §29): bloquear, nao avisar e deixar passar.
  const duplicata = await releases.duplicataPorTitulo({
    artistId: artista.id,
    title,
    type: dados.type,
  });
  if (duplicata) {
    throw new ErroCatalogo(
      `"${duplicata.title}" de ${duplicata.artist_name} ja esta no catalogo do Sonora.`,
      409,
      "DUPLICADA"
    );
  }

  const { id } = await releases.criar({
    title,
    artistId: artista.id,
    type: dados.type,
    releaseDate: dados.releaseDate,
    coverUrl: dados.coverUrl,
    genres: Array.isArray(dados.genres) ? dados.genres : [],
    origin: ORIGEM_MANUAL,
    createdBy: userId,
  });

  return releases.porId(id, userId);
}

module.exports = {
  ErroCatalogo,
  ORIGEM_API,
  ORIGEM_MANUAL,
  ehMbid,
  ehIdLocal,
  normalizar,
  pesquisarLancamentos,
  pesquisarArtistas,
  obterLancamento,
  garantirPersistido,
  resolverSePersistido,
  obterArtista,
  avaliarCadastroManual,
  cadastrarManual,
};
