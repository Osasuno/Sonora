"use strict";

const express = require("express");
const { z } = require("zod");

const auth = require("../auth");
const dados = require("../dados");
const catalogo = require("../services/catalogo");
const { lists: listsRepo } = require("../repos");
const { writeLimiter } = require("../security");
const { asyncRoute, parseOrThrow, notFound, forbidden, badRequest } = require("./helpers");

const router = express.Router();

router.use(auth.requireUser, dados.exigir);

const VisibilidadeSchema = z.enum(["PUBLIC", "PRIVATE"]);

const ItemSchema = z.object({
  ref: z.string().trim().min(1).max(60),
  comment: z.string().max(300).optional(),
});

const ListaSchema = z.object({
  title: z.string().trim().min(1, "de um titulo a lista").max(120),
  description: z.string().max(1500).optional(),
  // §35: nova lista nasce PUBLICA.
  visibility: VisibilidadeSchema.optional(),
  items: z.array(ItemSchema).max(100).optional(),
});

const IdSchema = z.object({ id: z.coerce.number().int().positive() });

/**
 * Converte referencias (MBID ou id local) em ids locais, persistindo as obras
 * que ainda nao estao no banco: entrar numa lista e' interacao (§13).
 */
async function resolverItens(itens = [], userId) {
  const resolvidos = [];
  for (const item of itens) {
    try {
      const releaseId = await catalogo.garantirPersistido(item.ref, userId);
      resolvidos.push({ releaseId, comment: item.comment || "" });
    } catch {
      // Obra que nao existe mais na fonte nem no banco e' simplesmente ignorada.
    }
  }
  return resolvidos;
}

const cartao = (linha, capas) => ({
  id: linha.id,
  title: linha.title,
  description: linha.description,
  visibility: linha.visibility,
  totalItens: linha.total_itens,
  updatedAt: linha.updated_at,
  autor: { id: linha.user_id, username: linha.username, displayName: linha.display_name },
  capas,
});

async function comCapas(linhas) {
  return Promise.all(
    linhas.map(async (linha) => {
      const capas = await listsRepo.capas(linha.id);
      return cartao(linha, capas.map((c) => c.cover_url));
    })
  );
}

/** Exploracao de listas publicas da comunidade (§36). */
router.get(
  "/",
  asyncRoute(async (_req, res) => {
    res.json({ listas: await comCapas(await listsRepo.publicas(40)) });
  })
);

router.post(
  "/",
  writeLimiter,
  asyncRoute(async (req, res) => {
    const corpo = parseOrThrow(ListaSchema, req.body);
    const eu = req.session.user.id;

    const criada = await listsRepo.criar({
      userId: eu,
      title: corpo.title,
      description: corpo.description,
      visibility: corpo.visibility || "PUBLIC",
    });

    const itens = await resolverItens(corpo.items, eu);
    if (itens.length > 0) await listsRepo.substituirItens(criada.id, itens);

    res.status(201).json({ id: criada.id });
  })
);

/**
 * Minhas listas, para o seletor "adicionar a lista" da pagina da obra (§37).
 * Fica ANTES de /:id de proposito: senao o Express casaria "minhas" como id.
 */
router.get(
  "/minhas/todas",
  asyncRoute(async (req, res) => {
    const minhas = await listsRepo.doUsuario(req.session.user.id, { incluirPrivadas: true });
    res.json({ listas: await comCapas(minhas) });
  })
);

router.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const { id } = parseOrThrow(IdSchema, req.params);

    const lista = await listsRepo.porId(id);
    if (!lista) throw notFound("Lista nao encontrada.");

    const eu = req.session.user;
    const souODono = lista.user_id === eu.id;

    // Lista privada: so o dono ve. Admin ve apenas no contexto de moderacao.
    if (lista.visibility === "PRIVATE" && !souODono && !eu.isAdmin) {
      throw notFound("Lista nao encontrada.");
    }

    res.json({
      lista: cartao(lista, []),
      itens: await listsRepo.itens(id, eu.id),
      souODono,
    });
  })
);

router.patch(
  "/:id",
  writeLimiter,
  asyncRoute(async (req, res) => {
    const { id } = parseOrThrow(IdSchema, req.params);
    const corpo = parseOrThrow(ListaSchema, req.body);
    const eu = req.session.user.id;

    const existente = await listsRepo.porId(id);
    if (!existente) throw notFound("Lista nao encontrada.");
    if (existente.user_id !== eu) throw forbidden("Essa lista nao e sua.");

    const atualizada = await listsRepo.atualizar(id, eu, {
      title: corpo.title,
      description: corpo.description,
      visibility: corpo.visibility || existente.visibility,
    });
    if (!atualizada) throw badRequest("Nao foi possivel atualizar a lista.");

    if (Array.isArray(corpo.items)) {
      await listsRepo.substituirItens(id, await resolverItens(corpo.items, eu));
    }
    res.json({ id });
  })
);

router.delete(
  "/:id",
  writeLimiter,
  asyncRoute(async (req, res) => {
    const { id } = parseOrThrow(IdSchema, req.params);
    const removida = await listsRepo.remover(id, req.session.user.id);
    if (!removida) throw notFound("Lista nao encontrada (ou nao e sua).");
    res.json({ ok: true });
  })
);

/** Adiciona uma obra a uma lista existente, direto da pagina do lancamento. */
router.post(
  "/:id/itens",
  writeLimiter,
  asyncRoute(async (req, res) => {
    const { id } = parseOrThrow(IdSchema, req.params);
    const item = parseOrThrow(ItemSchema, req.body);
    const eu = req.session.user.id;

    const lista = await listsRepo.porId(id);
    if (!lista) throw notFound("Lista nao encontrada.");
    if (lista.user_id !== eu) throw forbidden("Essa lista nao e sua.");

    const releaseId = await catalogo.garantirPersistido(item.ref, eu);
    await listsRepo.adicionarItem(id, releaseId, item.comment || "");

    res.status(201).json({ ok: true });
  })
);

module.exports = router;
