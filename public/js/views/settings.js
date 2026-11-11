// Ajustes da propria conta: perfil (§25) e senha.
//
// A gestao de usuarios NAO fica aqui — ela e' uma das tres frentes da area
// administrativa (§45), em /admin. Separar as duas coisas evita confundir
// "mexer em mim" com "mexer nos outros".

import { api, ErroApi } from "../api.js";
import { ir } from "../router.js";
import { montarTopbar } from "../shell.js";
import { atualizarUsuario, usuarioAtual } from "../state.js";
import { avatar, avisarErro, avisarOk, el, trocar } from "../ui.js";

const SENHA_MINIMA = 8;
const erroTexto = (erro, reserva) => (erro instanceof ErroApi ? erro.message : reserva);

// ─── Perfil (§25): nome de exibicao e bio, nada mais ───────────────────────

function abaPerfil() {
  const eu = usuarioAtual();

  const nome = el("input", { type: "text", id: "perfil-nome", maxlength: "80", value: eu.displayName });
  const bio = el("textarea", {
    id: "perfil-bio",
    maxlength: "400",
    placeholder: "Duas linhas sobre o seu gosto musical",
  });

  const salvar = el("button", { class: "btn primario", type: "button", text: "Salvar perfil" });
  salvar.addEventListener("click", async () => {
    salvar.disabled = true;
    try {
      const resposta = await api.salvarPerfil({
        displayName: nome.value.trim(),
        bio: bio.value.trim(),
      });
      atualizarUsuario({ displayName: resposta.perfil.displayName });
      montarTopbar();
      avisarOk("Perfil atualizado.");
    } catch (erro) {
      avisarErro(erroTexto(erro, "Nao consegui salvar o perfil."));
    }
    salvar.disabled = false;
  });

  // A bio nao vem na sessao; buscamos do perfil publico.
  api
    .perfil(eu.username)
    .then((dados) => {
      bio.value = dados.perfil.bio || "";
    })
    .catch(() => null);

  return el(
    "div",
    { class: "pilha-g", style: "max-width:620px" },
    el(
      "div",
      { class: "fileira", style: "gap:20px" },
      avatar(eu, "gg"),
      el(
        "div",
        {},
        el("div", { class: "rotulo", text: "Como você aparece" }),
        el("p", { class: "texto-faint", text: `@${eu.username}` })
      )
    ),
    el("div", { class: "campo" }, el("label", { for: "perfil-nome", text: "Nome de exibição" }), nome),
    el("div", { class: "campo" }, el("label", { for: "perfil-bio", text: "Sobre você" }), bio),
    el(
      "div",
      { class: "fileira" },
      salvar,
      el("a", { class: "btn fantasma", href: `/u/${encodeURIComponent(eu.username)}`, text: "Ver meu perfil" })
    )
  );
}

// ─── Senha ──────────────────────────────────────────────────────────────────

function abaSenha() {
  const atual = el("input", { type: "password", id: "senha-atual", autocomplete: "current-password" });
  const nova = el("input", { type: "password", id: "senha-nova", autocomplete: "new-password" });
  const repetir = el("input", { type: "password", id: "senha-repetir", autocomplete: "new-password" });

  const salvar = el("button", { class: "btn primario", type: "button", text: "Trocar senha" });
  salvar.addEventListener("click", async () => {
    if (nova.value.length < SENHA_MINIMA) {
      avisarErro(`A nova senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`);
      return;
    }
    if (nova.value !== repetir.value) {
      avisarErro("As duas senhas novas nao batem.");
      return;
    }

    salvar.disabled = true;
    try {
      await api.trocarSenha(atual.value, nova.value);
      atual.value = "";
      nova.value = "";
      repetir.value = "";
      avisarOk("Senha trocada.");
    } catch (erro) {
      avisarErro(erroTexto(erro, "Nao consegui trocar a senha."));
    }
    salvar.disabled = false;
  });

  return el(
    "div",
    { class: "pilha", style: "max-width:420px" },
    el("div", { class: "campo" }, el("label", { for: "senha-atual", text: "Senha atual" }), atual),
    el(
      "div",
      { class: "campo" },
      el("label", { for: "senha-nova", text: "Nova senha" }),
      nova,
      el("span", { class: "dica", text: `Mínimo de ${SENHA_MINIMA} caracteres.` })
    ),
    el("div", { class: "campo" }, el("label", { for: "senha-repetir", text: "Repita a nova senha" }), repetir),
    el("div", { class: "fileira" }, salvar)
  );
}

// ─── Tela ───────────────────────────────────────────────────────────────────

const ABAS = [
  { chave: "perfil", rotulo: "Perfil", monta: abaPerfil },
  { chave: "senha", rotulo: "Senha", monta: abaSenha },
];

export function telaAjustes(container, _parametros, query) {
  const pedida = query.get("aba");
  const inicial = ABAS.some((aba) => aba.chave === pedida) ? pedida : "perfil";
  const conteudo = el("div", {});

  const barra = el(
    "div",
    { class: "abas", role: "tablist", "aria-label": "Seções dos ajustes" },
    ABAS.map((aba) =>
      el("button", {
        class: "aba",
        type: "button",
        role: "tab",
        dataset: { aba: aba.chave },
        "aria-selected": String(aba.chave === inicial),
        text: aba.rotulo,
        onClick: () => ir(`/ajustes?aba=${aba.chave}`),
      })
    )
  );

  trocar(container, el("h1", { text: "Ajustes", style: "margin-bottom:22px" }), barra, conteudo);
  trocar(conteudo, ABAS.find((aba) => aba.chave === inicial).monta());
}
