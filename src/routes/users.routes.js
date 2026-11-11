"use strict";

const express = require("express");
const { z } = require("zod");

const auth = require("../auth");
const dados = require("../dados");
const {
  listens,
  lists: listsRepo,
  ratings,
  releases,
  reviews,
  users: usersRepo,
} = require("../repos");
const { writeLimiter } = require("../security");
const { asyncRoute, parseOrThrow, notFound } = require("./helpers");

const router = express.Router();

// Areas do perfil (§24).
const AREAS = [
  "historico",
  "ouvidas",
  "avaliacoes",
  "reviews",
  "favoritos",
  "quero-ouvir",
  "listas",
];

const UsernameSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2)
    .max(60)
    .regex(/^[a-zA-Z0-9._-]+$/, "nome de usuario invalido"),
});

const PerfilSchema = z.object({
  displayName: z.string().trim().min(1).max(80).optional(),
  bio: z.string().max(400).optional(),
});

const AreaSchema = z.object({ area: z.enum(AREAS).optional() });

const perfilPublico = (linha) => ({
  id: linha.id,
  username: linha.username,
  displayName: linha.display_name,
  bio: linha.bio,
  isAdmin: linha.is_admin,
  createdAt: linha.created_at,
});

router.get("/me", (req, res) => {
  if (!req.session?.user) return res.status(401).json({ erro: "Faca login para continuar." });
  return res.json({
    usuario: req.session.user,
    dadosProntos: dados.pronto(),
    demo: dados.emDemonstracao(),
  });
});

/** Edicao de perfil (§25): nome de exibicao e bio. */
router.patch(
  "/me",
  auth.requireUser,
  dados.exigir,
  writeLimiter,
  asyncRoute(async (req, res) => {
    const corpo = parseOrThrow(PerfilSchema, req.body);
    const atualizado = await usersRepo.updateProfile(req.session.user.id, corpo);

    req.session.user = { ...req.session.user, displayName: atualizado.display_name };
    res.json({ perfil: perfilPublico(atualizado) });
  })
);

// ─── Perfil musical (§24) ───────────────────────────────────────────────────

router.get(
  "/:username",
  auth.requireUser,
  dados.exigir,
  asyncRoute(async (req, res) => {
    const { username } = parseOrThrow(UsernameSchema, req.params);

    const alvo = await usersRepo.findByUsername(username);
    if (!alvo) throw notFound("Perfil nao encontrado.");

    const souEu = alvo.id === req.session.user.id;
    const [escutas, notas, totalReviews, contribuicoes, historico] = await Promise.all([
      listens.estatisticas(alvo.id),
      ratings.estatisticas(alvo.id),
      reviews.estatisticas(alvo.id),
      usersRepo.contribuicoes(alvo.id),
      listens.historico({ userId: alvo.id, limite: 10 }),
    ]);

    res.json({
      perfil: perfilPublico(alvo),
      // §24: obras diferentes ouvidas, total de escutas, avaliacoes, reviews e media.
      numeros: {
        obras_ouvidas: escutas.obras_ouvidas,
        total_escutas: escutas.total_escutas,
        avaliacoes: notas.total,
        reviews: totalReviews.total,
        nota_media: notas.media,
      },
      // §19: somente cadastro manual conta como contribuicao.
      contribuicoes,
      historico,
      souEu,
    });
  })
);

/** Areas do perfil, carregadas sob demanda. */
router.get(
  "/:username/area",
  auth.requireUser,
  dados.exigir,
  asyncRoute(async (req, res) => {
    const { username } = parseOrThrow(UsernameSchema, req.params);
    const { area = "historico" } = parseOrThrow(AreaSchema, req.query);

    const alvo = await usersRepo.findByUsername(username);
    if (!alvo) throw notFound("Perfil nao encontrado.");

    const souEu = alvo.id === req.session.user.id;
    // Lista privada nunca aparece para terceiros (§35, §67).
    const podeVerPrivadas = souEu || req.session.user.isAdmin;

    const carregar = {
      historico: () => listens.historico({ userId: alvo.id }),
      ouvidas: () => listens.obrasOuvidas({ userId: alvo.id }),
      avaliacoes: () => ratings.doUsuario({ userId: alvo.id }),
      reviews: () => reviews.doUsuario({ userId: alvo.id }),
      favoritos: () => releases.favoritosDe(alvo.id),
      "quero-ouvir": () => releases.queroOuvirDe(alvo.id),
      listas: () => listsRepo.doUsuario(alvo.id, { incluirPrivadas: podeVerPrivadas }),
    };

    res.json({ area, itens: await carregar[area]() });
  })
);

module.exports = router;
