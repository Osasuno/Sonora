"use strict";

const { TtlCache } = require("./cache");

/**
 * Cliente do MusicBrainz — a fonte externa de metadados do projeto (secao 13).
 *
 * Papel dela: ajudar a preencher o catalogo, respondendo "o que e' esta obra?".
 * Ela nao guarda nota, review, favorito nem historico — isso e' nosso.
 *
 * Duas restricoes reais do servico moldam este arquivo:
 *
 * 1. Limite de 1 requisicao por segundo por IP. Como saimos por um IP corporativo
 *    compartilhado, na pratica o servico responde 503 ("currently busy") com
 *    facilidade. Por isso toda chamada passa por uma FILA serializada com
 *    intervalo minimo, e um 503 vira nova tentativa com espera crescente.
 *
 * 2. Exige User-Agent identificando a aplicacao e um contato.
 *
 * Nada disso pode derrubar o app: se o MusicBrainz estiver fora, o catalogo
 * interno continua funcionando normalmente (secao 28).
 */

const BASE_URL = "https://musicbrainz.org/ws/2";
const TIMEOUT_MS = 12_000;

// O servico pede 1 req/s. Usamos folga para nao ficar na borda do limite.
const INTERVALO_MINIMO_MS = 1_150;
const TENTATIVAS = 3;

const TTL = {
  busca: 30 * 60 * 1000,
  detalhe: 24 * 60 * 60 * 1000,
  discografia: 6 * 60 * 60 * 1000,
};

const cache = new TtlCache({ maxEntries: 600 });

// Tipos que o projeto suporta (secao 12). O resto do MusicBrainz e' descartado.
const TIPOS_ACEITOS = { Album: "ALBUM", EP: "EP", Single: "SINGLE" };

class ErroCatalogoExterno extends Error {
  constructor(mensagem, status = 502) {
    super(mensagem);
    this.name = "ErroCatalogoExterno";
    this.status = status;
  }
}

function userAgent() {
  const contato = process.env.MUSICBRAINZ_CONTACT || "contato-nao-configurado";
  return `Sonora/1.0 (plataforma social de musica; ${contato})`;
}

// ─── Fila: uma requisicao por vez, com intervalo minimo entre elas ──────────

let ultimaChamada = 0;
let corrente = Promise.resolve();

const dormir = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Enfileira a chamada, garantindo o espacamento exigido pelo servico. */
function enfileirar(tarefa) {
  const resultado = corrente.then(async () => {
    const espera = INTERVALO_MINIMO_MS - (Date.now() - ultimaChamada);
    if (espera > 0) await dormir(espera);
    try {
      return await tarefa();
    } finally {
      ultimaChamada = Date.now();
    }
  });

  // A corrente nunca quebra: um erro em uma chamada nao trava as seguintes.
  corrente = resultado.then(
    () => undefined,
    () => undefined
  );
  return resultado;
}

async function buscarUmaVez(url) {
  const controlador = new AbortController();
  const alarme = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(url, {
      signal: controlador.signal,
      headers: { "User-Agent": userAgent(), accept: "application/json" },
    });
    return { status: resposta.status, corpo: resposta.ok ? await resposta.json() : null };
  } catch (err) {
    if (err.name === "AbortError") throw new ErroCatalogoExterno("O MusicBrainz demorou para responder", 504);
    throw new ErroCatalogoExterno("Nao foi possivel falar com o MusicBrainz", 502);
  } finally {
    clearTimeout(alarme);
  }
}

/** Monta a URL, enfileira e insiste quando o servico responde 503. */
async function pedir(caminho, parametros = {}) {
  const url = new URL(`${BASE_URL}${caminho}`);
  url.searchParams.set("fmt", "json");
  for (const [chave, valor] of Object.entries(parametros)) {
    if (valor !== undefined && valor !== null && valor !== "") url.searchParams.set(chave, String(valor));
  }

  // Vale insistir quando o servico estrangulou (503/429), estourou o tempo (504)
  // ou a rede oscilou (502). Nao vale insistir em 404 nem em erro de sintaxe.
  const RECUPERAVEIS = new Set([429, 502, 503, 504]);
  let ultimoErro = null;

  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa += 1) {
    if (tentativa > 1) await dormir(INTERVALO_MINIMO_MS * (tentativa - 1));

    let status = 0;
    try {
      const resposta = await enfileirar(() => buscarUmaVez(url));
      if (resposta.corpo) return resposta.corpo;
      status = resposta.status;
      ultimoErro = new ErroCatalogoExterno(`MusicBrainz respondeu ${status}`, status);
    } catch (err) {
      status = err.status || 502;
      ultimoErro = err;
    }

    if (status === 404) throw new ErroCatalogoExterno("Obra nao encontrada no MusicBrainz", 404);
    if (!RECUPERAVEIS.has(status)) throw ultimoErro;
  }

  throw new ErroCatalogoExterno(
    "O MusicBrainz nao respondeu agora. O catalogo interno continua disponivel.",
    503
  );
}

// ─── Normalizacao: da forma do MusicBrainz para a forma do projeto ──────────

/**
 * O MusicBrainz devolve "1997", "1997-05" ou "1997-05-21".
 *
 * Os tres sao aceitos e a precisao original e' preservada em `texto` (§17):
 * mostrar "1 de janeiro de 1997" para uma obra que so informa o ano seria
 * inventar informacao.
 */
function lerData(valor) {
  const texto = String(valor || "").trim();
  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(texto)) return { data: null, ano: null, texto: null };

  const ano = Number.parseInt(texto.slice(0, 4), 10);
  const completa = texto.length === 10 ? texto : null;
  return { data: completa, ano: Number.isFinite(ano) ? ano : null, texto };
}

const nomeDoArtista = (credito) =>
  (credito || []).map((parte) => parte.name + (parte.joinphrase || "")).join("").trim();

const primeiroArtista = (credito) => (credito || [])[0]?.artist || null;

/** Gêneros vêm em `genres` e, quando faltam, nas `tags` mais votadas. */
function lerGeneros(bruto) {
  const generos = (bruto.genres || []).map((g) => g.name);
  if (generos.length > 0) return generos.slice(0, 5);

  return (bruto.tags || [])
    .filter((t) => (t.count || 0) > 0)
    .sort((a, b) => b.count - a.count)
    .map((t) => t.name)
    .slice(0, 5);
}

/** Converte um release-group. Devolve null se o tipo nao e' suportado. */
function paraLancamento(bruto) {
  const tipo = TIPOS_ACEITOS[bruto["primary-type"]];
  if (!tipo) return null;

  const { data, ano, texto } = lerData(bruto["first-release-date"]);
  const artista = primeiroArtista(bruto["artist-credit"]);

  return {
    mbid: bruto.id,
    title: bruto.title,
    type: tipo,
    releaseDate: data,
    releaseYear: ano,
    releaseDateText: texto,
    genres: lerGeneros(bruto),
    desambiguacao: bruto.disambiguation || "",
    secundarios: bruto["secondary-types"] || [],
    artista: {
      mbid: artista?.id || null,
      name: nomeDoArtista(bruto["artist-credit"]) || artista?.name || "Artista desconhecido",
      sortName: artista?.["sort-name"] || null,
      country: artista?.country || null,
    },
  };
}

/**
 * Artista. Os campos extras (area, periodo de atividade, generos) sao os
 * "metadados uteis disponiveis" do §38 — aparecem quando a fonte os tem e
 * somem quando nao tem, sem inventar nada.
 */
const paraArtista = (bruto) => ({
  mbid: bruto.id,
  name: bruto.name,
  sortName: bruto["sort-name"] || null,
  country: bruto.country || null,
  desambiguacao: bruto.disambiguation || "",
  type: bruto.type || null,
  area: bruto.area?.name || null,
  lifeSpan: bruto["life-span"]
    ? { begin: bruto["life-span"].begin || null, end: bruto["life-span"].end || null }
    : null,
  genres: lerGeneros(bruto),
});

/** Escapa o termo para a sintaxe de busca do Lucene usada pelo MusicBrainz. */
const escapar = (termo) => termo.replace(/[+\-&|!(){}[\]^"~*?:\\/]/g, " ").trim();

// ─── Operacoes ─────────────────────────────────────────────────────────────

/** Busca lancamentos por titulo (e artista, quando informado). */
function buscarLancamentos(termo, { limite = 12, artista = "" } = {}) {
  const limpo = escapar(termo);
  if (!limpo) return Promise.resolve([]);

  const consulta = artista
    ? `releasegroup:"${limpo}" AND artist:"${escapar(artista)}"`
    : `releasegroup:"${limpo}"`;

  return cache.wrap(`rg:busca:${consulta}:${limite}`, TTL.busca, async () => {
    const corpo = await pedir("/release-group", { query: consulta, limit: limite });
    return (corpo["release-groups"] || []).map(paraLancamento).filter(Boolean);
  });
}

function buscarArtistas(termo, limite = 8) {
  const limpo = escapar(termo);
  if (!limpo) return Promise.resolve([]);

  return cache.wrap(`ar:busca:${limpo}:${limite}`, TTL.busca, async () => {
    const corpo = await pedir("/artist", { query: `artist:"${limpo}"`, limit: limite });
    return (corpo.artists || []).map(paraArtista);
  });
}

/** Detalhe de um lancamento, usado na hora de importar. */
function lancamentoPorMbid(mbid) {
  return cache.wrap(`rg:${mbid}`, TTL.detalhe, async () => {
    const corpo = await pedir(`/release-group/${mbid}`, { inc: "artists+genres+tags" });
    const convertido = paraLancamento(corpo);
    if (!convertido) throw new ErroCatalogoExterno("Tipo de lancamento nao suportado pelo projeto", 422);
    return convertido;
  });
}

/** Perfil do artista por MBID, usado na pagina de artista (§38). */
function artistaPorMbid(mbid) {
  return cache.wrap(`artist:${mbid}`, TTL.detalhe, async () =>
    paraArtista(await pedir(`/artist/${mbid}`, { inc: "genres+tags" }))
  );
}

/** Discografia de um artista, limitada aos tipos que o projeto aceita. */
function lancamentosDoArtista(mbid, limite = 40) {
  return cache.wrap(`ar:${mbid}:rg:${limite}`, TTL.discografia, async () => {
    const corpo = await pedir("/release-group", {
      artist: mbid,
      type: "album|ep|single",
      limit: limite,
    });
    return (corpo["release-groups"] || [])
      .map(paraLancamento)
      .filter(Boolean)
      .sort((a, b) => (b.releaseYear || 0) - (a.releaseYear || 0));
  });
}

module.exports = {
  ErroCatalogoExterno,
  buscarLancamentos,
  buscarArtistas,
  lancamentoPorMbid,
  artistaPorMbid,
  lancamentosDoArtista,
  TIPOS_ACEITOS,
};
