"use strict";

const express = require("express");
const { z } = require("zod");

const auth = require("../auth");
const dados = require("../dados");
const { users: usersRepo, releases, reviews, lists } = require("../repos");
const { writeLimiter } = require("../security");
const { asyncRoute, parseOrThrow, conflict, notFound, badRequest } = require("./helpers");

/**
 * Area administrativa (§45). Tres frentes, e so estas tres:
 *
 *   1. usuarios        — ver, criar, redefinir senha, conceder/remover admin, excluir
 *   2. obras manuais   — editar e remover o que foi cadastrado a mao
 *   3. moderacao       — excluir reviews e listas de qualquer pessoa
 *
 * Dados vindos do MusicBrainz nao sao editaveis aqui: a especificacao diz
 * explicitamente que isso nao e' requisito (§45). Por isso as rotas de catalogo
 * abaixo recusam qualquer obra de origem API.
 *
 * Nada de denuncias, fila, apelacao, reputacao, strikes ou banimento — §45
 * lista tudo isso como fora desta versao.
 */

const router = express.Router();

// Toda esta area exige login E perfil de administrador (RF89).
router.use(auth.requireUser, auth.requireAdmin, dados.exigir);

const IdParamSchema = z.object({ id: z.coerce.number().int().positive() });

// ─── 1. Usuarios (RF90-RF93) ────────────────────────────────────────────────

const NewUserSchema = z.object({
  username: z
    .string()
    .trim()
    .min(2, "minimo de 2 caracteres")
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "use apenas letras, numeros, ponto, hifen ou underline"),
  displayName: z.string().trim().min(1).max(80).optional(),
  password: z.string().min(8, "minimo de 8 caracteres").max(200),
  isAdmin: z.boolean().optional(),
});

const ResetSchema = z.object({ password: z.string().min(8, "minimo de 8 caracteres").max(200) });

const RoleSchema = z.object({ isAdmin: z.boolean() });

const publicUser = (row) => ({
  id: row.id,
  username: row.username,
  displayName: row.display_name,
  isAdmin: row.is_admin,
  createdAt: row.created_at,
});

router.get(
  "/users",
  asyncRoute(async (_req, res) => {
    const lista = await usersRepo.listAll();
    res.json({ usuarios: lista.map(publicUser) });
  })
);

/**
 * Criacao de conta por um administrador. Existe em paralelo ao autocadastro
 * publico de /api/auth/cadastro (§21) — serve para a curadoria inicial e para
 * criar contas de teste sem passar pela tela de cadastro.
 */
router.post(
  "/users",
  writeLimiter,
  asyncRoute(async (req, res) => {
    const data = parseOrThrow(NewUserSchema, req.body);

    if (await usersRepo.findByUsername(data.username)) {
      throw conflict("Ja existe alguem com esse nome de usuario.");
    }

    const created = await usersRepo.create({
      username: data.username,
      // A coluna e' obrigatoria e o formulario do admin nao pede e-mail. Mesmo
      // criterio do admin inicial: placeholder .invalid, que nunca resolve.
      email: `${data.username}@sonora.invalid`,
      displayName: data.displayName || data.username,
      passwordHash: await auth.hashPassword(data.password),
      isAdmin: Boolean(data.isAdmin),
    });
    return res.status(201).json({ usuario: publicUser(created) });
  })
);

router.post(
  "/users/:id/password",
  writeLimiter,
  asyncRoute(async (req, res) => {
    const { id } = parseOrThrow(IdParamSchema, req.params);
    const { password } = parseOrThrow(ResetSchema, req.body);

    const alvo = await usersRepo.findById(id);
    if (!alvo) throw notFound("Usuario nao encontrado.");

    await usersRepo.setPassword(id, await auth.hashPassword(password));
    return res.json({ ok: true });
  })
);

router.post(
  "/users/:id/role",
  writeLimiter,
  asyncRoute(async (req, res) => {
    const { id } = parseOrThrow(IdParamSchema, req.params);
    const { isAdmin } = parseOrThrow(RoleSchema, req.body);

    // Trava simples contra ficar sem nenhum administrador por descuido.
    if (id === req.session.user.id && !isAdmin) {
      throw badRequest("Voce nao pode remover o seu proprio acesso de administrador.");
    }
    const alvo = await usersRepo.findById(id);
    if (!alvo) throw notFound("Usuario nao encontrado.");

    await usersRepo.setAdmin(id, isAdmin);
    return res.json({ ok: true });
  })
);

router.delete(
  "/users/:id",
  writeLimiter,
  asyncRoute(async (req, res) => {
    const { id } = parseOrThrow(IdParamSchema, req.params);
    if (id === req.session.user.id) throw badRequest("Voce nao pode remover a sua propria conta.");

    const alvo = await usersRepo.findById(id);
    if (!alvo) throw notFound("Usuario nao encontrado.");

    await usersRepo.remove(id);
    return res.json({ ok: true });
  })
);

// ─── 2. Obras cadastradas a mao (RF94, RF95) ────────────────────────────────

const ObraManualSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    type: z.enum(["ALBUM", "EP", "SINGLE"]).optional(),
    // Mesma precisao flexivel do cadastro (§17).
    releaseDate: z
      .string()
      .trim()
      .regex(/^\d{4}(-\d{2}(-\d{2})?)?$/, "use AAAA, AAAA-MM ou AAAA-MM-DD")
      .optional(),
    coverUrl: z.string().trim().url("informe um endereco valido").max(600).optional(),
    genres: z.array(z.string().trim().min(1).max(60)).max(12).optional(),
  })
  .refine((corpo) => Object.keys(corpo).length > 0, "informe pelo menos um campo para editar");

router.get(
  "/obras-manuais",
  asyncRoute(async (req, res) => {
    res.json({ lancamentos: await releases.manuais(req.session.user.id) });
  })
);

router.patch(
  "/obras-manuais/:id",
  writeLimiter,
  asyncRoute(async (req, res) => {
    const { id } = parseOrThrow(IdParamSchema, req.params);
    const alteracoes = parseOrThrow(ObraManualSchema, req.body);

    const atual = await releases.porId(id, req.session.user.id);
    if (!atual) throw notFound("Lancamento nao encontrado.");
    if (atual.origin !== "MANUAL") {
      throw badRequest("Somente obras cadastradas a mao podem ser editadas aqui.");
    }

    await releases.atualizarManual(id, {
      title: alteracoes.title ?? null,
      type: alteracoes.type ?? null,
      releaseDate: alteracoes.releaseDate ?? null,
      coverUrl: alteracoes.coverUrl ?? null,
      genres: alteracoes.genres ?? null,
    });

    res.json({ lancamento: await releases.porId(id, req.session.user.id) });
  })
);

router.delete(
  "/obras-manuais/:id",
  writeLimiter,
  asyncRoute(async (req, res) => {
    const { id } = parseOrThrow(IdParamSchema, req.params);

    const atual = await releases.porId(id, req.session.user.id);
    if (!atual) throw notFound("Lancamento nao encontrado.");
    if (atual.origin !== "MANUAL") {
      throw badRequest("Somente obras cadastradas a mao podem ser removidas aqui.");
    }

    const removida = await releases.removerManual(id);
    if (!removida) throw notFound("Lancamento nao encontrado.");
    res.json({ ok: true });
  })
);

// ─── 3. Moderacao (RF96, RF97) ──────────────────────────────────────────────

/**
 * Excluir uma review na moderacao remove SOMENTE a review (§30, §55). A
 * escuta, a nota, o favorito e a presenca em listas continuam valendo — quem
 * escreveu continua tendo ouvido a obra.
 */
router.get(
  "/reviews",
  asyncRoute(async (_req, res) => {
    res.json({ reviews: await reviews.recentes(80) });
  })
);

router.delete(
  "/reviews/:id",
  writeLimiter,
  asyncRoute(async (req, res) => {
    const { id } = parseOrThrow(IdParamSchema, req.params);
    const removida = await reviews.removerPorId(id);
    if (!removida) throw notFound("Review nao encontrada.");
    res.json({ ok: true });
  })
);

/**
 * A moderacao ve listas publicas e privadas — e a unica situacao em que uma
 * lista privada aparece para quem nao e' o dono (§24).
 */
router.get(
  "/listas",
  asyncRoute(async (_req, res) => {
    res.json({ listas: await lists.todas(80) });
  })
);

router.delete(
  "/listas/:id",
  writeLimiter,
  asyncRoute(async (req, res) => {
    const { id } = parseOrThrow(IdParamSchema, req.params);
    const removida = await lists.removerPorId(id);
    if (!removida) throw notFound("Lista nao encontrada.");
    res.json({ ok: true });
  })
);

module.exports = router;
