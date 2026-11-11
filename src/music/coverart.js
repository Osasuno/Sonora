"use strict";

const { TtlCache } = require("./cache");

/**
 * Cover Art Archive — capas das obras (secao 13 do escopo).
 *
 * O servico responde por MBID de release-group e devolve 307 para o arquivo real.
 * Guardamos no banco a URL do proprio Cover Art Archive, nao a do destino final:
 * ela e' estavel, enquanto o endereco do arquivo pode mudar.
 *
 * Obra sem capa e' situacao normal e prevista (secao 28): confirmamos antes de
 * gravar e, quando nao existe, o campo fica nulo e a interface mostra um espaco
 * com o titulo em vez de imagem quebrada.
 */

const BASE_URL = "https://coverartarchive.org";
const TIMEOUT_MS = 8_000;
const TTL_MS = 24 * 60 * 60 * 1000;

// 500px cobre bem tanto a grade quanto a pagina da obra.
const TAMANHO_PADRAO = 500;

const cache = new TtlCache({ maxEntries: 1500, defaultTtlMs: TTL_MS });

/** URL publica da capa da frente. Nao garante que ela exista. */
const urlDaCapa = (mbid, tamanho = TAMANHO_PADRAO) =>
  mbid ? `${BASE_URL}/release-group/${mbid}/front-${tamanho}` : null;

/**
 * Confirma se ha capa para o MBID. Uma falha de rede nao vira "sem capa":
 * nesse caso devolvemos a URL de todo jeito, e no maximo a imagem nao carrega.
 */
async function capaDisponivel(mbid) {
  if (!mbid) return false;

  const emCache = cache.get(`existe:${mbid}`);
  if (emCache !== undefined) return emCache;

  const controlador = new AbortController();
  const alarme = setTimeout(() => controlador.abort(), TIMEOUT_MS);

  try {
    const resposta = await fetch(urlDaCapa(mbid), {
      method: "HEAD",
      redirect: "follow",
      signal: controlador.signal,
      headers: { "User-Agent": "Sonora/1.0 (plataforma social de musica)" },
    });
    // 404 e' a resposta honesta de "esta obra nao tem capa cadastrada".
    return cache.set(`existe:${mbid}`, resposta.status !== 404);
  } catch {
    return true;
  } finally {
    clearTimeout(alarme);
  }
}

/** Devolve a URL quando existe capa, ou null quando a obra nao tem. */
async function capaOuNulo(mbid) {
  if (!mbid) return null;
  return (await capaDisponivel(mbid)) ? urlDaCapa(mbid) : null;
}

module.exports = { urlDaCapa, capaDisponivel, capaOuNulo, BASE_URL };
