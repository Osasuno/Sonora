"use strict";

const express = require("express");
const { z } = require("zod");

const auth = require("../auth");
const dados = require("../dados");
const { users } = require("../repos");
const { cadastroLimiter, loginLimiter } = require("../security");
const { asyncRoute, parseOrThrow, badRequest, conflict } = require("./helpers");

const router = express.Router();

const SENHA_MINIMA = 8;

const CadastroSchema = z.object({
  username: z
    .string()
    .trim()
    .min(3, "minimo de 3 caracteres")
    .max(40)
    .regex(/^[a-zA-Z0-9._-]+$/, "use apenas letras, numeros, ponto, hifen ou underline"),
  email: z.string().trim().email("e-mail invalido").max(254),
  displayName: z.string().trim().min(1).max(80).optional(),
  password: z.string().min(SENHA_MINIMA, `minimo de ${SENHA_MINIMA} caracteres`).max(200),
});

const LoginSchema = z.object({
  username: z.string().trim().min(1).max(60),
  password: z.string().min(1).max(200),
});

const SenhaSchema = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z.string().min(SENHA_MINIMA, `minimo de ${SENHA_MINIMA} caracteres`).max(200),
});

/** Abre a sessao renovando o identificador, para evitar fixacao de sessao. */
function iniciarSessao(req, res, usuario) {
  return req.session.regenerate((err) => {
    if (err) return res.status(500).json({ erro: "Nao foi possivel iniciar a sessao." });
    req.session.user = auth.toSessionUser(usuario);
    return res.json({ usuario: req.session.user });
  });
}

/**
 * US01 — criar uma conta.
 *
 * O escopo trata o cadastro aberto como Must e como primeiro critério de sucesso
 * do MVP (secoes 11.1 e 23), por isso ele existe aqui. Quem entra ja entra como
 * usuario comum: perfil de administrador so e' concedido por outro administrador.
 */
router.post(
  "/cadastro",
  cadastroLimiter,
  dados.exigir,
  asyncRoute(async (req, res) => {
    const corpo = parseOrThrow(CadastroSchema, req.body);

    if (await users.findByUsername(corpo.username)) {
      throw conflict("Esse nome de usuario ja esta em uso.");
    }
    if (await users.findByEmail(corpo.email)) {
      throw conflict("Esse e-mail ja tem uma conta.");
    }

    const criado = await users.create({
      username: corpo.username,
      email: corpo.email,
      displayName: corpo.displayName || corpo.username,
      passwordHash: await auth.hashPassword(corpo.password),
      isAdmin: false,
    });

    // Entra direto: cadastrar e depois pedir login de novo e' atrito sem motivo.
    return iniciarSessao(req, res, { ...criado, is_admin: false });
  })
);

/** US02 — login. */
router.post(
  "/login",
  loginLimiter,
  dados.exigir,
  asyncRoute(async (req, res) => {
    const { username, password } = parseOrThrow(LoginSchema, req.body);

    // Aceita entrar por usuario ou por e-mail, os dois sao unicos.
    const encontrado =
      (await users.findByUsername(username)) ||
      (username.includes("@") ? await users.findByEmail(username) : null);

    const valido = encontrado && (await auth.checkPassword(password, encontrado.password_hash));
    if (!valido) {
      // Mensagem generica de proposito: nao revela se a conta existe.
      return res.status(401).json({ erro: "Usuario ou senha invalidos." });
    }

    return iniciarSessao(req, res, encontrado);
  })
);

/** US02 — logout. */
router.post("/logout", (req, res) => {
  if (!req.session) return res.json({ ok: true });
  return req.session.destroy(() => {
    res.clearCookie("sonora.sid");
    res.json({ ok: true });
  });
});

router.post(
  "/senha",
  auth.requireUser,
  dados.exigir,
  asyncRoute(async (req, res) => {
    const { currentPassword, newPassword } = parseOrThrow(SenhaSchema, req.body);

    const encontrado = await users.findById(req.session.user.id);
    const valido = encontrado && (await auth.checkPassword(currentPassword, encontrado.password_hash));
    if (!valido) throw badRequest("A senha atual nao confere.");

    await users.setPassword(encontrado.id, await auth.hashPassword(newPassword));
    return res.json({ ok: true });
  })
);

module.exports = router;
