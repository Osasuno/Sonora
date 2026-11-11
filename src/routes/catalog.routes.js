"use strict";

const express = require("express");
const { z } = require("zod");

const auth = require("../auth");
const dados = require("../dados");
const catalogo = require("../services/catalogo");
const { artists, listens, ratings, releases, reviews } = require("../repos");
const { searchLimiter, writeLimiter } = require("../security");
const { asyncRoute, parseOrThrow, notFound } = require("./helpers");

const router = express.Router();

const POR_PAGINA = 36;
const ANO_MINIMO = 1860;
const ANO_MAXIMO = 2200;

router.use(auth.requireUser);

const TipoSchema = z.enum(["ALBUM", "EP", "SINGLE"]);
const NotaSchema = z.coerce.number().min(0.5).max(5);

const PesquisaSchema = z.object({
  q: z.string().trim().min(2, "escreva pelo menos duas letras").max(120),
  artista: z.string().trim().max(120).optional(),
});

const ExplorarSchema = z.object({
  q: z.string().trim().max(120).optional(),
  tipo: z.union([TipoSchema, z.literal("")]).optional(),
  artistId: z.coerce.number().int().positive().optional(),
  genero: z.string().trim().max(60).optional(),
  origem: z.union([z.enum(["API", "MANUAL"]), z.literal("")]).optional(),
  anoDe: z.coerce.number().int().min(ANO_MINIMO).max(ANO_MAXIMO).optional(),
  anoAte: z.coerce.number().int().min(ANO_MINIMO).max(ANO_MAXIMO).optional(),
  notaComunidadeMin: NotaSchema.optional(),
  minhaNotaMin: NotaSchema.optional(),
  ordem: z
    .enum([
      "lancamento",
      "adicionados",
      "antigos",
      "alfabetica",
      "nota_comunidade",
      "minha_nota",
      "popularidade",
    ])
    .optional(),
  pagina: z.coerce.number().int().min(1).max(200).optional(),
});

const RefSchema = z.object({ ref: z.string().trim().min(1).max(60) });

// §17: a data entra na precisao disponivel — ano, ano/mes ou data completa.
const DataSchema = z
  .string()
  .trim()
  .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "use AAAA, AAAA-MM ou AAAA-MM-DD")
  .refine((valor) => {
    const ano = Number.parseInt(valor.slice(0, 4), 10);
    return ano >= ANO_MINIMO && ano <= ANO_MAXIMO;
  }, `ano fora da faixa (${ANO_MINIMO}-${ANO_MAXIMO})`);

const ManualSchema = z.object({
  title: z.string().trim().min(1, "informe o titulo").max(200),
  artistName: z.string().trim().min(1, "informe o artista").max(200),
  type: TipoSchema,
  releaseDate: DataSchema,
  // §17: a capa e' obrigatoria e entra como URL; upload esta fora do escopo.
  coverUrl: z.string().url("endereco de capa invalido").max(500),
  // §17: genero e' opcional de proposito — a propria fonte externa nem sempre
  // tem genero, entao exigir aqui impediria cadastros legitimos.
  genres: z.array(z.string().trim().min(1).max(40)).max(8).optional(),
});

const VerificarManualSchema = z.object({
  title: z.string().trim().min(1).max(200),
  artistName: z.string().trim().min(1).max(200),
});

// ─── Pesquisa: a fonte normal e' o MusicBrainz (§12, §39) ───────────────────

router.get(
  "/pesquisa",
  searchLimiter,
  dados.exigir,
  asyncRoute(async (req, res) => {
    const { q, artista } = parseOrThrow(PesquisaSchema, req.query);
    try {
      const resultados = await catalogo.pesquisarLancamentos(q, { artista: artista || "" });
      res.json({ termo: q, resultados, fonte: "musicbrainz" });
    } catch (erro) {
      // Resiliencia (RNF05): falha da fonte externa e' tratada, nao derruba a tela.
      res.status(503).json({
        termo: q,
        resultados: [],
        fonte: "musicbrainz",
        indisponivel: true,
        erro: erro.message,
      });
    }
  })
);

router.get(
  "/pesquisa/artistas",
  searchLimiter,
  dados.exigir,
  asyncRoute(async (req, res) => {
    const { q } = parseOrThrow(PesquisaSchema, req.query);
    try {
      res.json({ termo: q, artistas: await catalogo.pesquisarArtistas(q) });
    } catch (erro) {
      res.status(503).json({ termo: q, artistas: [], indisponivel: true, erro: erro.message });
    }
  })
);

// ─── Exploracao do que ja esta no Sonora, com filtros (§40-43) ──────────────

router.get(
  "/explorar",
  dados.exigir,
  asyncRoute(async (req, res) => {
    const filtro = parseOrThrow(ExplorarSchema, req.query);
    const pagina = filtro.pagina || 1;

    const criterios = {
      userId: req.session.user.id,
      termo: filtro.q || "",
      tipo: filtro.tipo || "",
      artistId: filtro.artistId || null,
      genero: filtro.genero || "",
      origem: filtro.origem || "",
      anoDe: filtro.anoDe ?? null,
      anoAte: filtro.anoAte ?? null,
      notaComunidadeMin: filtro.notaComunidadeMin ?? null,
      minhaNotaMin: filtro.minhaNotaMin ?? null,
      ordem: filtro.ordem || "adicionados",
    };

    const [lancamentos, total] = await Promise.all([
      releases.explorar({ ...criterios, limite: POR_PAGINA, deslocamento: (pagina - 1) * POR_PAGINA }),
      releases.contar(criterios),
    ]);

    res.json({
      lancamentos,
      total,
      pagina,
      porPagina: POR_PAGINA,
      paginas: Math.max(1, Math.ceil(total / POR_PAGINA)),
      criterios,
    });
  })
);

router.get(
  "/facetas",
  dados.exigir,
  asyncRoute(async (_req, res) => {
    const [generos, anos, tipos, origens, artistas] = await Promise.all([
      releases.generosDisponiveis(),
      releases.faixaDeAnos(),
      releases.contagemPorTipo(),
      releases.contagemPorOrigem(),
      artists.comObras(),
    ]);
    res.json({ generos, anos: anos || { menor: null, maior: null }, tipos, origens, artistas });
  })
);

// ─── Pagina do lancamento (§37) ─────────────────────────────────────────────

/**
 * `ref` aceita id local ou MBID. Abrir a pagina NAO persiste a obra (§13):
 * quando ela existe apenas na API, os agregados vem zerados e as marcas
 * pessoais vazias, porque de fato ainda nao ha nada registrado.
 */
router.get(
  "/lancamentos/:ref",
  dados.exigir,
  asyncRoute(async (req, res) => {
    const { ref } = parseOrThrow(RefSchema, req.params);
    const eu = req.session.user.id;

    const { lancamento, persistido } = await catalogo.obterLancamento(ref, eu);

    if (!persistido) {
      return res.json({
        lancamento,
        persistido: false,
        comunidade: { media: null, total: 0, histograma: [], escutas: 0, ouvintes: 0, reviews: 0 },
        reviews: [],
        voce: { nota: null, review: null, escutas: [], favorito: false, quero_ouvir: false },
      });
    }

    const id = lancamento.id;
    const [notaComunidade, histograma, popularidade, totalReviews, lista, minhaNota, minhaReview, minhasEscutas, marcas] =
      await Promise.all([
        ratings.daComunidade(id),
        ratings.histograma(id),
        listens.totalDaObra(id),
        reviews.totalDaObra(id),
        reviews.daObra({ releaseId: id }),
        ratings.doUsuarioParaObra(eu, id),
        reviews.doUsuarioParaObra(eu, id),
        listens.doUsuarioParaObra(eu, id),
        releases.marcasDoUsuario(eu, id),
      ]);

    return res.json({
      lancamento,
      persistido: true,
      comunidade: {
        media: notaComunidade.media,
        total: notaComunidade.total,
        histograma,
        escutas: popularidade.escutas,
        ouvintes: popularidade.ouvintes,
        reviews: totalReviews,
      },
      reviews: lista,
      voce: {
        nota: minhaNota?.rating ?? null,
        review: minhaReview || null,
        escutas: minhasEscutas,
        favorito: marcas.favorito,
        quero_ouvir: marcas.quero_ouvir,
      },
    });
  })
);

// ─── Pagina do artista: principalmente API (§38) ────────────────────────────

router.get(
  "/artistas/:ref",
  dados.exigir,
  asyncRoute(async (req, res) => {
    const { ref } = parseOrThrow(RefSchema, req.params);
    try {
      res.json(await catalogo.obterArtista(ref, req.session.user.id));
    } catch (erro) {
      if (erro.status === 404) throw notFound("Artista nao encontrado.");
      res.status(503).json({ indisponivel: true, erro: erro.message });
    }
  })
);

// ─── Cadastro manual: fallback controlado (§16, §17, §52) ───────────────────

/**
 * Diz se o cadastro manual pode ser liberado. A interface usa isto para decidir
 * se mostra o formulario, se aponta a obra que ja existe na API, ou se avisa
 * que a fonte externa esta fora do ar.
 */
router.post(
  "/manual/verificar",
  searchLimiter,
  dados.exigir,
  asyncRoute(async (req, res) => {
    const corpo = parseOrThrow(VerificarManualSchema, req.body);
    try {
      res.json(await catalogo.avaliarCadastroManual(corpo));
    } catch (erro) {
      res.status(erro.status || 503).json({
        liberado: false,
        motivo: erro.codigo || "FONTE_INDISPONIVEL",
        erro: erro.message,
      });
    }
  })
);

router.post(
  "/manual",
  writeLimiter,
  dados.exigir,
  asyncRoute(async (req, res) => {
    const corpo = parseOrThrow(ManualSchema, req.body);
    const criada = await catalogo.cadastrarManual(corpo, { userId: req.session.user.id });
    res.status(201).json({ lancamento: criada });
  })
);

module.exports = router;
