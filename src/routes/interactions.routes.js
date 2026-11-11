"use strict";

const express = require("express");
const { z } = require("zod");

const auth = require("../auth");
const dados = require("../dados");
const interacoes = require("../services/interacoes");
const { listens } = require("../repos");
const { writeLimiter } = require("../security");
const { asyncRoute, parseOrThrow, badRequest, notFound } = require("./helpers");

const router = express.Router();

router.use(auth.requireUser, dados.exigir, writeLimiter);

/** Data de hoje no fuso local, em AAAA-MM-DD. */
function hojeLocal() {
  const agora = new Date();
  return new Date(agora.getTime() - agora.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

// Escala oficial (§29): 0,5 a 5, de meia em meia. Nenhum outro valor e' aceito.
const NotaSchema = z
  .number()
  .min(0.5, "a nota minima e 0,5")
  .max(5, "a nota maxima e 5")
  .refine((valor) => Number.isInteger(valor * 2), "use notas de meia em meia estrela");

const RefSchema = z.object({ ref: z.string().trim().min(1).max(60) });

const EscutaSchema = z.object({
  ref: z.string().trim().min(1).max(60),
  listenedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD")
    .optional(),
});

const AvaliacaoSchema = z.object({
  ref: z.string().trim().min(1).max(60),
  nota: NotaSchema,
});

const ReviewSchema = z.object({
  ref: z.string().trim().min(1).max(60),
  texto: z.string().trim().min(1, "escreva algo na review").max(5000),
});

const RegistroSchema = z.object({
  ref: z.string().trim().min(1).max(60),
  nota: NotaSchema.nullable().optional(),
  texto: z.string().trim().max(5000).optional(),
  listenedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "use o formato AAAA-MM-DD")
    .optional(),
});

const IdSchema = z.object({ id: z.coerce.number().int().positive() });

// ─── Escutas (§26, §30-33) ──────────────────────────────────────────────────

/**
 * Registra uma escuta. A resposta traz `perguntarQueroOuvir`: quando vem true,
 * a interface pergunta se a obra deve sair do Quero ouvir (§32). O servidor
 * nunca remove por conta propria.
 */
router.post(
  "/escutas",
  asyncRoute(async (req, res) => {
    const { ref, listenedOn } = parseOrThrow(EscutaSchema, req.body);
    const resultado = await interacoes.registrarEscuta(ref, req.session.user.id, {
      listenedOn: listenedOn || hojeLocal(),
    });
    res.status(201).json(resultado);
  })
);

router.delete(
  "/escutas/:id",
  asyncRoute(async (req, res) => {
    const { id } = parseOrThrow(IdSchema, req.params);
    const removida = await listens.remover(id, req.session.user.id);
    if (!removida) throw notFound("Escuta nao encontrada (ou nao e sua).");
    res.json({ ok: true });
  })
);

// ─── Avaliacoes (§29) ───────────────────────────────────────────────────────

/** Uma avaliacao atual por obra: PUT cria ou atualiza. */
router.put(
  "/avaliacoes",
  asyncRoute(async (req, res) => {
    const { ref, nota } = parseOrThrow(AvaliacaoSchema, req.body);
    res.json(await interacoes.avaliar(ref, req.session.user.id, nota));
  })
);

router.delete(
  "/avaliacoes/:ref",
  asyncRoute(async (req, res) => {
    const { ref } = parseOrThrow(RefSchema, req.params);
    res.json(await interacoes.removerAvaliacao(ref, req.session.user.id));
  })
);

// ─── Reviews (§30) ──────────────────────────────────────────────────────────

/** Uma review atual por obra: PUT cria ou atualiza. */
router.put(
  "/reviews",
  asyncRoute(async (req, res) => {
    const { ref, texto } = parseOrThrow(ReviewSchema, req.body);
    res.json(await interacoes.publicarReview(ref, req.session.user.id, texto));
  })
);

/** Excluir remove SOMENTE a review: escuta, nota e demais vinculos ficam. */
router.delete(
  "/reviews/:ref",
  asyncRoute(async (req, res) => {
    const { ref } = parseOrThrow(RefSchema, req.params);
    res.json(await interacoes.removerReview(ref, req.session.user.id));
  })
);

/**
 * Nota e review na mesma acao da interface. Existe para cumprir o §28: quando
 * as duas sao criadas juntas, registra-se apenas UMA escuta automatica.
 */
router.post(
  "/registro",
  asyncRoute(async (req, res) => {
    const corpo = parseOrThrow(RegistroSchema, req.body);
    const temNota = corpo.nota !== null && corpo.nota !== undefined;
    const temTexto = Boolean(corpo.texto?.trim());

    if (!temNota && !temTexto) throw badRequest("Informe uma nota, uma review, ou as duas.");

    res.json(
      await interacoes.avaliarEResenhar(corpo.ref, req.session.user.id, {
        nota: corpo.nota ?? null,
        texto: corpo.texto ?? null,
      })
    );
  })
);

// ─── Favoritos (§31) e Quero ouvir (§32) ────────────────────────────────────

const MarcaSchema = z.object({ ref: z.string().trim().min(1).max(60) });

router.post(
  "/favoritos",
  asyncRoute(async (req, res) => {
    const { ref } = parseOrThrow(MarcaSchema, req.body);
    res.status(201).json(await interacoes.favoritar(ref, req.session.user.id));
  })
);

router.delete(
  "/favoritos/:ref",
  asyncRoute(async (req, res) => {
    const { ref } = parseOrThrow(RefSchema, req.params);
    res.json(await interacoes.desfavoritar(ref, req.session.user.id));
  })
);

router.post(
  "/quero-ouvir",
  asyncRoute(async (req, res) => {
    const { ref } = parseOrThrow(MarcaSchema, req.body);
    res.status(201).json(await interacoes.adicionarQueroOuvir(ref, req.session.user.id));
  })
);

router.delete(
  "/quero-ouvir/:ref",
  asyncRoute(async (req, res) => {
    const { ref } = parseOrThrow(RefSchema, req.params);
    res.json(await interacoes.removerQueroOuvir(ref, req.session.user.id));
  })
);

router.get("/hoje", (_req, res) => res.json({ hoje: hojeLocal() }));

module.exports = router;
