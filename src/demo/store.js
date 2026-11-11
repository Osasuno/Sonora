"use strict";

/**
 * Repositorios em memoria do modo demonstracao.
 *
 * Espelham funcao por funcao os repositorios de Postgres em src/repos/ —
 * mesmos nomes, mesmo formato de linha (snake_case, datas como Date) — para as
 * rotas e a interface nao perceberem diferenca. O comportamento oficial e' o
 * SQL; este arquivo existe apenas para o app ser navegavel sem banco e nao faz
 * parte da versao alvo (§61).
 *
 * Modelo igual ao do schema oficial: escuta, avaliacao e review sao tres
 * tabelas independentes (§27).
 */

const TIPOS = ["ALBUM", "EP", "SINGLE"];
const ORIGENS = ["API", "MANUAL"];
const VISIBILIDADES = ["PUBLIC", "PRIVATE"];

const ESCALA_MINIMA = 0.5;
const ESCALA_MAXIMA = 5;

const t = {
  users: [],
  artists: [],
  releases: [],
  listens: [],
  ratings: [],
  reviews: [],
  favorites: [],
  watchlist: [],
  lists: [],
  listItems: [],
};

const seq = { users: 0, artists: 0, releases: 0, listens: 0, reviews: 0, lists: 0 };
const proximoId = (nome) => {
  seq[nome] += 1;
  return seq[nome];
};

let resolverPronto;
const pronto = new Promise((resolve) => {
  resolverPronto = resolve;
});
const marcarPronto = () => resolverPronto();
const aguardar = () => pronto;

// ─── Utilitarios ────────────────────────────────────────────────────────────

/** Converte "AAAA-MM-DD" na meia-noite local, igual ao driver do Postgres. */
function paraDataLocal(valor) {
  if (!valor) return null;
  if (valor instanceof Date) return valor;
  const [ano, mes, dia] = String(valor).slice(0, 10).split("-").map(Number);
  return Number.isFinite(ano) ? new Date(ano, (mes || 1) - 1, dia || 1) : null;
}

/** Mesma decomposicao em tres campos do repositorio real (§17). */
function decomporData(dataTexto, anoExplicito) {
  const texto = dataTexto ? String(dataTexto).trim() : "";
  if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(texto)) {
    return {
      texto: anoExplicito ? String(anoExplicito) : null,
      completa: null,
      ano: anoExplicito ?? null,
    };
  }
  return {
    texto,
    completa: texto.length === 10 ? paraDataLocal(texto) : null,
    ano: anoExplicito ?? Number.parseInt(texto.slice(0, 4), 10),
  };
}

const hojeLocal = () => {
  const agora = new Date();
  return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
};

const media = (numeros) =>
  numeros.length === 0
    ? null
    : Math.round((numeros.reduce((a, b) => a + b, 0) / numeros.length) * 100) / 100;

const igual = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
const contem = (texto, parte) =>
  String(texto || "").toLowerCase().includes(String(parte).toLowerCase());

const num = (valor) => Number(valor);

const usuarioPorId = (id) => t.users.find((x) => x.id === num(id)) || null;
const artistaPorId = (id) => t.artists.find((x) => x.id === num(id)) || null;
const lancamentoPorId = (id) => t.releases.find((x) => x.id === num(id)) || null;

const escutasDaObra = (id) => t.listens.filter((x) => x.release_id === num(id));
const notasDaObra = (id) => t.ratings.filter((x) => x.release_id === num(id));
const reviewsDaObra = (id) => t.reviews.filter((x) => x.release_id === num(id));

const minhaNotaPara = (userId, releaseId) =>
  t.ratings.find((x) => x.user_id === num(userId) && x.release_id === num(releaseId))?.rating ?? null;

/**
 * Projecao de cartao: equivalente a constante CARTAO do repositorio real,
 * incluindo os agregados da comunidade e a nota de quem esta olhando.
 */
function cartao(lancamento, userId) {
  if (!lancamento) return {};
  const artista = artistaPorId(lancamento.artist_id) || {};
  const notas = notasDaObra(lancamento.id).map((x) => x.rating);

  return {
    id: lancamento.id,
    mbid: lancamento.mbid,
    title: lancamento.title,
    type: lancamento.type,
    release_date: lancamento.release_date,
    release_year: lancamento.release_year,
    release_date_text: lancamento.release_date_text,
    cover_url: lancamento.cover_url,
    genres: lancamento.genres,
    origin: lancamento.origin,
    created_at: lancamento.created_at,
    artist_id: artista.id ?? null,
    artist_name: artista.name ?? "Artista desconhecido",
    artist_mbid: artista.mbid ?? null,
    escutas: escutasDaObra(lancamento.id).length,
    total_reviews: reviewsDaObra(lancamento.id).length,
    total_notas: notas.length,
    nota_media: media(notas),
    minha_nota: userId ? minhaNotaPara(userId, lancamento.id) : null,
  };
}

/** Campos de obra usados nas listagens de escuta/nota/review. */
const resumoDaObra = (releaseId) => {
  const lancamento = lancamentoPorId(releaseId) || {};
  const artista = artistaPorId(lancamento.artist_id) || {};
  return {
    release_id: lancamento.id ?? null,
    title: lancamento.title,
    type: lancamento.type,
    release_year: lancamento.release_year,
    cover_url: lancamento.cover_url,
    origin: lancamento.origin,
    artist_id: artista.id ?? null,
    artist_name: artista.name ?? "",
  };
};

const autorDa = (userId) => {
  const autor = usuarioPorId(userId) || {};
  return { user_id: autor.id ?? null, username: autor.username, display_name: autor.display_name };
};

const maisRecente = (a, b) => b.created_at - a.created_at;

// ─── users ──────────────────────────────────────────────────────────────────

const users = {
  async findByUsername(username) {
    return t.users.find((x) => igual(x.username, username)) || null;
  },

  async findByEmail(email) {
    return email ? t.users.find((x) => igual(x.email, email)) || null : null;
  },

  async findById(id) {
    return usuarioPorId(id);
  },

  async listAll() {
    return [...t.users].sort((a, b) => a.display_name.localeCompare(b.display_name, "pt-BR"));
  },

  async create({ username, email = null, displayName, passwordHash, isAdmin = false }) {
    const linha = {
      id: proximoId("users"),
      username,
      email,
      display_name: displayName || username,
      password_hash: passwordHash,
      is_admin: Boolean(isAdmin),
      bio: "",
      created_at: new Date(),
    };
    t.users.push(linha);
    return linha;
  },

  async updateProfile(id, { displayName, bio }) {
    const linha = usuarioPorId(id);
    if (!linha) return null;
    if (displayName !== undefined && displayName !== null) linha.display_name = displayName;
    if (bio !== undefined && bio !== null) linha.bio = bio;
    return linha;
  },

  async setPassword(id, passwordHash) {
    const linha = usuarioPorId(id);
    if (linha) linha.password_hash = passwordHash;
  },

  async setAdmin(id, isAdmin) {
    const linha = usuarioPorId(id);
    if (linha) linha.is_admin = Boolean(isAdmin);
  },

  async remove(id) {
    const alvo = num(id);
    t.users = t.users.filter((x) => x.id !== alvo);
    t.listens = t.listens.filter((x) => x.user_id !== alvo);
    t.ratings = t.ratings.filter((x) => x.user_id !== alvo);
    t.reviews = t.reviews.filter((x) => x.user_id !== alvo);
    t.favorites = t.favorites.filter((x) => x.user_id !== alvo);
    t.watchlist = t.watchlist.filter((x) => x.user_id !== alvo);

    const removidas = t.lists.filter((x) => x.user_id === alvo).map((x) => x.id);
    t.lists = t.lists.filter((x) => x.user_id !== alvo);
    t.listItems = t.listItems.filter((x) => !removidas.includes(x.list_id));
  },

  /** Somente cadastro manual conta como contribuicao (§19). */
  async contribuicoes(userId) {
    return {
      manuais: t.releases.filter((x) => x.created_by === num(userId) && x.origin === "MANUAL")
        .length,
    };
  },
};

// ─── artists ────────────────────────────────────────────────────────────────

const artists = {
  async porId(id) {
    return artistaPorId(id);
  },

  async porMbid(mbid) {
    return mbid ? t.artists.find((x) => x.mbid === mbid) || null : null;
  },

  async porNomeSemMbid(name) {
    return t.artists.find((x) => !x.mbid && igual(x.name, name)) || null;
  },

  async criar({ mbid = null, name, sortName = null, origin, createdBy = null }) {
    const linha = {
      id: proximoId("artists"),
      mbid: mbid || null,
      name: name.trim(),
      sort_name: sortName || null,
      origin,
      created_by: createdBy,
      created_at: new Date(),
    };
    t.artists.push(linha);
    return linha;
  },

  async garantir({ mbid = null, name, sortName = null, origin, createdBy = null }) {
    if (mbid) {
      const existente = await artists.porMbid(mbid);
      if (existente) return existente;
      return artists.criar({ mbid, name, sortName, origin, createdBy });
    }
    const porNome = await artists.porNomeSemMbid(name);
    if (porNome) return porNome;
    return artists.criar({ name, sortName, origin, createdBy });
  },

  async comObras() {
    return t.artists
      .map((a) => ({
        id: a.id,
        name: a.name,
        mbid: a.mbid,
        origin: a.origin,
        total_lancamentos: t.releases.filter((r) => r.artist_id === a.id).length,
      }))
      .filter((a) => a.total_lancamentos > 0)
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  },
};

// ─── releases ───────────────────────────────────────────────────────────────

/**
 * Mesmas ordenacoes do SQL (§40-43). Note os dois "recentes" distintos.
 *
 * A data vai comparada como texto ISO pelo mesmo motivo do repositorio real:
 * comparar `release_date` jogaria para o fim toda obra que informa apenas o ano.
 */
function porDataTexto(a, b, crescente = false) {
  const x = a.release_date_text || "";
  const y = b.release_date_text || "";
  // Sem data vai para o fim nas duas direcoes, como o NULLS LAST do SQL.
  if (!x && !y) return 0;
  if (!x) return 1;
  if (!y) return -1;
  return crescente ? x.localeCompare(y) : y.localeCompare(x);
}

const ORDENACOES = {
  lancamento: (a, b) => porDataTexto(a, b),
  adicionados: (a, b) => b.created_at - a.created_at,
  antigos: (a, b) => porDataTexto(a, b, true),
  alfabetica: (a, b) => a.title.localeCompare(b.title, "pt-BR"),
  nota_comunidade: (a, b) => (b.nota_media ?? -1) - (a.nota_media ?? -1) || b.total_notas - a.total_notas,
  minha_nota: (a, b) => (b.minha_nota ?? -1) - (a.minha_nota ?? -1),
  popularidade: (a, b) => b.escutas - a.escutas || (b.nota_media ?? -1) - (a.nota_media ?? -1),
};

/** Aplica os filtros oficiais sobre os cartoes ja projetados. */
function filtrar(criterios, userId) {
  const {
    termo = "",
    tipo = "",
    artistId = null,
    genero = "",
    origem = "",
    anoDe = null,
    anoAte = null,
    notaComunidadeMin = null,
    minhaNotaMin = null,
  } = criterios;

  return t.releases
    .map((linha) => cartao(linha, userId))
    .filter((obra) => {
      if (termo && !contem(obra.title, termo) && !contem(obra.artist_name, termo)) return false;
      if (tipo && obra.type !== tipo) return false;
      if (artistId && obra.artist_id !== num(artistId)) return false;
      if (genero && !obra.genres.includes(genero)) return false;
      if (origem && obra.origin !== origem) return false;
      if (anoDe !== null && anoDe !== undefined && (obra.release_year || 0) < anoDe) return false;
      if (anoAte !== null && anoAte !== undefined && (obra.release_year || 9999) > anoAte) {
        return false;
      }
      if (notaComunidadeMin && (obra.nota_media ?? -1) < notaComunidadeMin) return false;
      if (minhaNotaMin && (obra.minha_nota ?? -1) < minhaNotaMin) return false;
      return true;
    });
}

const releases = {
  TIPOS,
  ORIGENS,
  ORDENACOES,

  async porId(id, userId) {
    const linha = lancamentoPorId(id);
    if (!linha) return null;
    const autor = usuarioPorId(linha.created_by);
    return {
      ...cartao(linha, userId),
      created_by: linha.created_by,
      created_by_username: autor?.username || null,
    };
  },

  async porMbid(mbid, userId) {
    const linha = mbid ? t.releases.find((x) => x.mbid === mbid) : null;
    return linha ? releases.porId(linha.id, userId) : null;
  },

  async idsPorMbids(mbids) {
    const validos = new Set((mbids || []).filter(Boolean));
    const mapa = new Map();
    for (const linha of t.releases) {
      if (!linha.mbid || !validos.has(linha.mbid)) continue;
      mapa.set(linha.mbid, {
        id: linha.id,
        mbid: linha.mbid,
        nota_media: media(notasDaObra(linha.id).map((x) => x.rating)),
        escutas: escutasDaObra(linha.id).length,
      });
    }
    return mapa;
  },

  async duplicataPorTitulo({ artistId, title, type }) {
    const linha = t.releases.find(
      (x) => x.artist_id === num(artistId) && igual(x.title, title) && x.type === type
    );
    if (!linha) return null;
    return {
      id: linha.id,
      title: linha.title,
      origin: linha.origin,
      artist_name: artistaPorId(linha.artist_id)?.name || "",
    };
  },

  async criar({
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
    const linha = {
      id: proximoId("releases"),
      mbid: mbid || null,
      title: title.trim(),
      artist_id: num(artistId),
      type,
      release_date: data.completa,
      release_year: data.ano,
      release_date_text: data.texto,
      cover_url: coverUrl,
      genres: Array.isArray(genres) ? genres : [],
      origin,
      created_by: createdBy,
      created_at: new Date(),
    };
    t.releases.push(linha);
    return { id: linha.id };
  },

  /** Edicao restrita a obras manuais (§45). */
  async atualizarManual(id, { title, type, releaseDate, releaseYear, coverUrl, genres }) {
    const linha = lancamentoPorId(id);
    if (!linha || linha.origin !== "MANUAL") return null;

    if (title) linha.title = title.trim();
    if (type && TIPOS.includes(type)) linha.type = type;
    if (releaseDate || releaseYear) {
      const data = decomporData(releaseDate, releaseYear);
      linha.release_date = data.completa;
      linha.release_year = data.ano;
      linha.release_date_text = data.texto;
    }
    if (coverUrl) linha.cover_url = coverUrl;
    if (Array.isArray(genres)) linha.genres = genres;
    return { id: linha.id };
  },

  async removerManual(id) {
    const alvo = num(id);
    const linha = lancamentoPorId(alvo);
    if (!linha || linha.origin !== "MANUAL") return false;

    t.releases = t.releases.filter((x) => x.id !== alvo);
    t.listens = t.listens.filter((x) => x.release_id !== alvo);
    t.ratings = t.ratings.filter((x) => x.release_id !== alvo);
    t.reviews = t.reviews.filter((x) => x.release_id !== alvo);
    t.favorites = t.favorites.filter((x) => x.release_id !== alvo);
    t.watchlist = t.watchlist.filter((x) => x.release_id !== alvo);
    t.listItems = t.listItems.filter((x) => x.release_id !== alvo);
    return true;
  },

  async explorar(criterios = {}) {
    const { ordem = "adicionados", limite = 36, deslocamento = 0, userId } = criterios;
    const ordenar = ORDENACOES[ordem] || ORDENACOES.adicionados;
    return filtrar(criterios, userId)
      .sort(ordenar)
      .slice(deslocamento, deslocamento + limite);
  },

  async contar(criterios = {}) {
    return filtrar(criterios, criterios.userId).length;
  },

  async generosDisponiveis() {
    const contagem = new Map();
    for (const linha of t.releases) {
      for (const genero of linha.genres) contagem.set(genero, (contagem.get(genero) || 0) + 1);
    }
    return [...contagem.entries()]
      .map(([genero, total]) => ({ genero, total }))
      .sort((a, b) => b.total - a.total || a.genero.localeCompare(b.genero))
      .slice(0, 60);
  },

  async faixaDeAnos() {
    const anos = t.releases.map((x) => x.release_year).filter(Boolean);
    if (anos.length === 0) return { menor: null, maior: null };
    return { menor: Math.min(...anos), maior: Math.max(...anos) };
  },

  async contagemPorTipo() {
    return TIPOS.map((tipo) => ({
      type: tipo,
      total: t.releases.filter((x) => x.type === tipo).length,
    })).filter((x) => x.total > 0);
  },

  async contagemPorOrigem() {
    return ORIGENS.map((origem) => ({
      origin: origem,
      total: t.releases.filter((x) => x.origin === origem).length,
    })).filter((x) => x.total > 0);
  },

  async doArtista(artistId, userId) {
    return t.releases
      .filter((x) => x.artist_id === num(artistId))
      .map((linha) => cartao(linha, userId))
      .sort(ORDENACOES.lancamento);
  },

  async manuais(userId) {
    return t.releases
      .filter((x) => x.origin === "MANUAL")
      .sort(maisRecente)
      .map((linha) => ({
        ...cartao(linha, userId),
        created_by: linha.created_by,
        created_by_username: usuarioPorId(linha.created_by)?.username || null,
      }));
  },

  // ─── Favoritos (§31) e Quero ouvir (§32) ──────────────────────────────────

  async favoritosDe(userId) {
    return t.favorites
      .filter((f) => f.user_id === num(userId))
      .sort(maisRecente)
      .map((f) => ({
        ...cartao(lancamentoPorId(f.release_id), userId),
        marcado_em: f.created_at,
      }));
  },

  async favoritar(userId, releaseId) {
    if (!t.favorites.some((f) => f.user_id === num(userId) && f.release_id === num(releaseId))) {
      t.favorites.push({ user_id: num(userId), release_id: num(releaseId), created_at: new Date() });
    }
  },

  async desfavoritar(userId, releaseId) {
    t.favorites = t.favorites.filter(
      (f) => !(f.user_id === num(userId) && f.release_id === num(releaseId))
    );
  },

  async queroOuvirDe(userId) {
    return t.watchlist
      .filter((w) => w.user_id === num(userId))
      .sort(maisRecente)
      .map((w) => ({
        ...cartao(lancamentoPorId(w.release_id), userId),
        marcado_em: w.created_at,
      }));
  },

  async adicionarQueroOuvir(userId, releaseId) {
    if (!t.watchlist.some((w) => w.user_id === num(userId) && w.release_id === num(releaseId))) {
      t.watchlist.push({ user_id: num(userId), release_id: num(releaseId), created_at: new Date() });
    }
  },

  async removerQueroOuvir(userId, releaseId) {
    t.watchlist = t.watchlist.filter(
      (w) => !(w.user_id === num(userId) && w.release_id === num(releaseId))
    );
  },

  async estaNoQueroOuvir(userId, releaseId) {
    return t.watchlist.some((w) => w.user_id === num(userId) && w.release_id === num(releaseId));
  },

  async marcasDoUsuario(userId, releaseId) {
    return {
      favorito: t.favorites.some(
        (f) => f.user_id === num(userId) && f.release_id === num(releaseId)
      ),
      quero_ouvir: t.watchlist.some(
        (w) => w.user_id === num(userId) && w.release_id === num(releaseId)
      ),
    };
  },
};

// ─── listens (§26) ──────────────────────────────────────────────────────────

const listens = {
  async criar(userId, releaseId, listenedOn = null) {
    const linha = {
      id: proximoId("listens"),
      user_id: num(userId),
      release_id: num(releaseId),
      listened_on: paraDataLocal(listenedOn) || hojeLocal(),
      created_at: new Date(),
    };
    t.listens.push(linha);
    return { id: linha.id, listened_on: linha.listened_on };
  },

  async remover(listenId, userId) {
    const antes = t.listens.length;
    t.listens = t.listens.filter(
      (l) => !(l.id === num(listenId) && l.user_id === num(userId))
    );
    return t.listens.length < antes;
  },

  async porId(listenId) {
    const linha = t.listens.find((l) => l.id === num(listenId));
    if (!linha) return null;
    return {
      id: linha.id,
      listened_on: linha.listened_on,
      created_at: linha.created_at,
      ...autorDa(linha.user_id),
      ...resumoDaObra(linha.release_id),
      id_obra: linha.release_id,
    };
  },

  async historico({ userId, limite = 100 }) {
    return t.listens
      .filter((l) => l.user_id === num(userId))
      .sort((a, b) => b.listened_on - a.listened_on || b.created_at - a.created_at)
      .slice(0, limite)
      .map((linha) => ({
        id: linha.id,
        listened_on: linha.listened_on,
        created_at: linha.created_at,
        ...autorDa(linha.user_id),
        ...resumoDaObra(linha.release_id),
      }));
  },

  async doUsuarioParaObra(userId, releaseId) {
    return t.listens
      .filter((l) => l.user_id === num(userId) && l.release_id === num(releaseId))
      .sort((a, b) => b.listened_on - a.listened_on || b.created_at - a.created_at)
      .map((l) => ({ id: l.id, listened_on: l.listened_on, created_at: l.created_at }));
  },

  async obrasOuvidas({ userId, limite = 100 }) {
    const porObra = new Map();

    for (const escuta of t.listens.filter((l) => l.user_id === num(userId))) {
      const atual = porObra.get(escuta.release_id);
      if (atual) {
        atual.escutas += 1;
        if (escuta.listened_on > atual.ultima_escuta) atual.ultima_escuta = escuta.listened_on;
        continue;
      }
      porObra.set(escuta.release_id, { escutas: 1, ultima_escuta: escuta.listened_on });
    }

    return [...porObra.entries()]
      .map(([releaseId, resumo]) => {
        const lancamento = lancamentoPorId(releaseId) || {};
        const artista = artistaPorId(lancamento.artist_id) || {};
        return {
          id: lancamento.id,
          title: lancamento.title,
          type: lancamento.type,
          release_year: lancamento.release_year,
          cover_url: lancamento.cover_url,
          origin: lancamento.origin,
          artist_id: artista.id ?? null,
          artist_name: artista.name ?? "",
          escutas: resumo.escutas,
          ultima_escuta: resumo.ultima_escuta,
          minha_nota: minhaNotaPara(userId, releaseId),
        };
      })
      .sort((a, b) => b.ultima_escuta - a.ultima_escuta)
      .slice(0, limite);
  },

  /** Popularidade no Sonora e' quantidade de escutas (§42). */
  async totalDaObra(releaseId) {
    const minhas = escutasDaObra(releaseId);
    return { escutas: minhas.length, ouvintes: new Set(minhas.map((l) => l.user_id)).size };
  },

  async estatisticas(userId) {
    const minhas = t.listens.filter((l) => l.user_id === num(userId));
    return {
      total_escutas: minhas.length,
      obras_ouvidas: new Set(minhas.map((l) => l.release_id)).size,
    };
  },
};

// ─── ratings (§29) ──────────────────────────────────────────────────────────

function escalaValida(nota) {
  const valor = Number(nota);
  return (
    Number.isFinite(valor) &&
    valor >= ESCALA_MINIMA &&
    valor <= ESCALA_MAXIMA &&
    Number.isInteger(valor * 2)
  );
}

const ratings = {
  ESCALA_MINIMA,
  ESCALA_MAXIMA,
  escalaValida,

  async salvar(userId, releaseId, nota) {
    if (!escalaValida(nota)) throw new Error("nota fora da escala oficial");

    const existente = t.ratings.find(
      (x) => x.user_id === num(userId) && x.release_id === num(releaseId)
    );
    if (existente) {
      existente.rating = Number(nota);
      existente.updated_at = new Date();
      return { rating: existente.rating, criada: false };
    }

    const agora = new Date();
    t.ratings.push({
      user_id: num(userId),
      release_id: num(releaseId),
      rating: Number(nota),
      created_at: agora,
      updated_at: agora,
    });
    return { rating: Number(nota), criada: true };
  },

  async remover(userId, releaseId) {
    const antes = t.ratings.length;
    t.ratings = t.ratings.filter(
      (x) => !(x.user_id === num(userId) && x.release_id === num(releaseId))
    );
    return t.ratings.length < antes;
  },

  async doUsuarioParaObra(userId, releaseId) {
    const linha = t.ratings.find(
      (x) => x.user_id === num(userId) && x.release_id === num(releaseId)
    );
    return linha
      ? { rating: linha.rating, created_at: linha.created_at, updated_at: linha.updated_at }
      : null;
  },

  async daComunidade(releaseId) {
    const notas = notasDaObra(releaseId).map((x) => x.rating);
    return { media: media(notas), total: notas.length };
  },

  async histograma(releaseId) {
    const contagem = new Map();
    for (const linha of notasDaObra(releaseId)) {
      contagem.set(linha.rating, (contagem.get(linha.rating) || 0) + 1);
    }
    return [...contagem.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([nota, quantidade]) => ({ nota, quantidade }));
  },

  async doUsuario({ userId, limite = 100 }) {
    return t.ratings
      .filter((x) => x.user_id === num(userId))
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, limite)
      .map((linha) => ({
        rating: linha.rating,
        updated_at: linha.updated_at,
        ...resumoDaObra(linha.release_id),
      }));
  },

  async estatisticas(userId) {
    const notas = t.ratings.filter((x) => x.user_id === num(userId)).map((x) => x.rating);
    return { total: notas.length, media: media(notas) };
  },
};

// ─── reviews (§30) ──────────────────────────────────────────────────────────

const projetarReview = (linha) => ({
  id: linha.id,
  review: linha.review,
  created_at: linha.created_at,
  updated_at: linha.updated_at,
  ...autorDa(linha.user_id),
  ...resumoDaObra(linha.release_id),
  rating: minhaNotaPara(linha.user_id, linha.release_id),
});

const reviews = {
  async salvar(userId, releaseId, texto) {
    const existente = t.reviews.find(
      (x) => x.user_id === num(userId) && x.release_id === num(releaseId)
    );
    if (existente) {
      existente.review = texto;
      existente.updated_at = new Date();
      return { id: existente.id, criada: false };
    }

    const agora = new Date();
    const linha = {
      id: proximoId("reviews"),
      user_id: num(userId),
      release_id: num(releaseId),
      review: texto,
      created_at: agora,
      updated_at: agora,
    };
    t.reviews.push(linha);
    return { id: linha.id, criada: true };
  },

  /** Remove SOMENTE a review: escuta, nota e vinculos continuam (§30, §55). */
  async remover(userId, releaseId) {
    const antes = t.reviews.length;
    t.reviews = t.reviews.filter(
      (x) => !(x.user_id === num(userId) && x.release_id === num(releaseId))
    );
    return t.reviews.length < antes;
  },

  async removerPorId(reviewId) {
    const antes = t.reviews.length;
    t.reviews = t.reviews.filter((x) => x.id !== num(reviewId));
    return t.reviews.length < antes;
  },

  async doUsuarioParaObra(userId, releaseId) {
    const linha = t.reviews.find(
      (x) => x.user_id === num(userId) && x.release_id === num(releaseId)
    );
    return linha
      ? {
          id: linha.id,
          review: linha.review,
          created_at: linha.created_at,
          updated_at: linha.updated_at,
        }
      : null;
  },

  async daObra({ releaseId, limite = 40 }) {
    return reviewsDaObra(releaseId).sort(maisRecente).slice(0, limite).map(projetarReview);
  },

  async doUsuario({ userId, limite = 100 }) {
    return t.reviews
      .filter((x) => x.user_id === num(userId))
      .sort(maisRecente)
      .slice(0, limite)
      .map(projetarReview);
  },

  async recentes(limite = 60) {
    return [...t.reviews].sort(maisRecente).slice(0, limite).map(projetarReview);
  },

  async estatisticas(userId) {
    return { total: t.reviews.filter((x) => x.user_id === num(userId)).length };
  },

  async totalDaObra(releaseId) {
    return reviewsDaObra(releaseId).length;
  },
};

// ─── lists (§34-36) ─────────────────────────────────────────────────────────

const projetarLista = (lista) => ({
  id: lista.id,
  title: lista.title,
  description: lista.description,
  visibility: lista.visibility,
  created_at: lista.created_at,
  updated_at: lista.updated_at,
  ...autorDa(lista.user_id),
  total_itens: t.listItems.filter((i) => i.list_id === lista.id).length,
});

const lists = {
  VISIBILIDADES,

  async criar({ userId, title, description = "", visibility = "PUBLIC" }) {
    const agora = new Date();
    const linha = {
      id: proximoId("lists"),
      user_id: num(userId),
      title: title.trim(),
      description: description || "",
      visibility: VISIBILIDADES.includes(visibility) ? visibility : "PUBLIC",
      created_at: agora,
      updated_at: agora,
    };
    t.lists.push(linha);
    return { id: linha.id };
  },

  async atualizar(listId, userId, { title, description = "", visibility = "PUBLIC" }) {
    const linha = t.lists.find((l) => l.id === num(listId) && l.user_id === num(userId));
    if (!linha) return null;

    linha.title = title.trim();
    linha.description = description || "";
    linha.visibility = VISIBILIDADES.includes(visibility) ? visibility : "PUBLIC";
    linha.updated_at = new Date();
    return { id: linha.id };
  },

  async remover(listId, userId) {
    const alvo = num(listId);
    const antes = t.lists.length;
    t.lists = t.lists.filter((l) => !(l.id === alvo && l.user_id === num(userId)));
    const removeu = t.lists.length < antes;
    if (removeu) t.listItems = t.listItems.filter((i) => i.list_id !== alvo);
    return removeu;
  },

  async removerPorId(listId) {
    const alvo = num(listId);
    const antes = t.lists.length;
    t.lists = t.lists.filter((l) => l.id !== alvo);
    const removeu = t.lists.length < antes;
    if (removeu) t.listItems = t.listItems.filter((i) => i.list_id !== alvo);
    return removeu;
  },

  async porId(listId) {
    const linha = t.lists.find((l) => l.id === num(listId));
    return linha ? projetarLista(linha) : null;
  },

  async doUsuario(userId, { incluirPrivadas = false } = {}) {
    return t.lists
      .filter((l) => l.user_id === num(userId) && (incluirPrivadas || l.visibility === "PUBLIC"))
      .sort((a, b) => b.updated_at - a.updated_at)
      .map(projetarLista);
  },

  async publicas(limite = 40) {
    return t.lists
      .filter((l) => l.visibility === "PUBLIC")
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, limite)
      .map(projetarLista);
  },

  async todas(limite = 80) {
    return [...t.lists]
      .sort((a, b) => b.updated_at - a.updated_at)
      .slice(0, limite)
      .map(projetarLista);
  },

  async itens(listId, userId) {
    return t.listItems
      .filter((i) => i.list_id === num(listId))
      .sort((a, b) => a.position - b.position)
      .map((item) => {
        const lancamento = lancamentoPorId(item.release_id) || {};
        const artista = artistaPorId(lancamento.artist_id) || {};
        return {
          position: item.position,
          comment: item.comment,
          id: lancamento.id,
          mbid: lancamento.mbid,
          title: lancamento.title,
          type: lancamento.type,
          release_year: lancamento.release_year,
          cover_url: lancamento.cover_url,
          origin: lancamento.origin,
          artist_id: artista.id ?? null,
          artist_name: artista.name ?? "",
          nota_media: media(notasDaObra(item.release_id).map((x) => x.rating)),
          minha_nota: userId ? minhaNotaPara(userId, item.release_id) : null,
        };
      });
  },

  async capas(listId, limite = 4) {
    return t.listItems
      .filter((i) => i.list_id === num(listId))
      .sort((a, b) => a.position - b.position)
      .map((i) => lancamentoPorId(i.release_id)?.cover_url)
      .filter(Boolean)
      .slice(0, limite)
      .map((cover_url) => ({ cover_url }));
  },

  async substituirItens(listId, entradas) {
    const alvo = num(listId);
    t.listItems = t.listItems.filter((i) => i.list_id !== alvo);

    const vistos = new Set();
    let posicao = 0;
    for (const item of entradas) {
      const releaseId = num(item.releaseId);
      if (vistos.has(releaseId)) continue;
      vistos.add(releaseId);

      posicao += 1;
      t.listItems.push({
        list_id: alvo,
        release_id: releaseId,
        position: posicao,
        comment: item.comment || "",
      });
    }

    const lista = t.lists.find((l) => l.id === alvo);
    if (lista) lista.updated_at = new Date();
    return posicao;
  },

  async adicionarItem(listId, releaseId, comment = "") {
    const alvo = num(listId);
    const obra = num(releaseId);
    const jaEsta = t.listItems.some((i) => i.list_id === alvo && i.release_id === obra);

    if (!jaEsta) {
      const maior = t.listItems
        .filter((i) => i.list_id === alvo)
        .reduce((max, i) => Math.max(max, i.position), 0);
      t.listItems.push({ list_id: alvo, release_id: obra, position: maior + 1, comment });
    }

    const lista = t.lists.find((l) => l.id === alvo);
    if (lista) lista.updated_at = new Date();
  },
};

module.exports = {
  users,
  artists,
  releases,
  listens,
  ratings,
  reviews,
  lists,
  tabelas: t,
  aguardar,
  marcarPronto,
};
