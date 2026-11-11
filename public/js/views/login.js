// Entrada na plataforma: criar conta (US01) e login (US02) na mesma tela.

import { api, ErroApi } from "../api.js";
import { el, icone, trocar } from "../ui.js";

function arte() {
  const quadrados = Array.from({ length: 9 }, () => el("div"));
  return el(
    "div",
    { class: "login-arte", "aria-hidden": "true" },
    el("div", { class: "login-arte-grade" }, quadrados),
    el(
      "p",
      { class: "login-frase" },
      el("b", { text: "Todo disco que você ouve deixa um rastro." }),
      " Registre o que ouviu, dê a nota, escreva o que sentiu e monte a sua identidade musical."
    )
  );
}

/** `aoEntrar` recebe o usuario devolvido pelo servidor. */
export function telaLogin(aoEntrar) {
  const anfitriao = document.getElementById("tela-login");
  let modo = "entrar";

  const erro = el("div", { class: "login-erro", hidden: true, role: "alert" });
  const dicaDemo = el("div", { class: "faixa-demo", hidden: true });
  const formulario = el("form", { class: "login-form" });
  const titulo = el("h1", { text: "Entrar" });
  const subtitulo = el("p", { class: "sub" });
  const alternar = el("button", { class: "btn fantasma largo", type: "button" });

  function mostrarErro(mensagem) {
    erro.textContent = mensagem;
    erro.hidden = false;
  }

  async function enviar(evento, acao, botao) {
    evento.preventDefault();
    erro.hidden = true;
    botao.disabled = true;
    const rotuloOriginal = botao.textContent;
    trocar(botao, el("span", { class: "carregando-inline" }), " aguarde...");

    try {
      const resposta = await acao();
      aoEntrar(resposta.usuario);
    } catch (falha) {
      mostrarErro(falha instanceof ErroApi ? falha.message : "Nao consegui completar agora.");
      botao.disabled = false;
      trocar(botao, rotuloOriginal);
    }
  }

  function montarEntrar() {
    const usuario = el("input", {
      id: "login-usuario",
      type: "text",
      autocomplete: "username",
      required: true,
    });
    const senha = el("input", {
      id: "login-senha",
      type: "password",
      autocomplete: "current-password",
      required: true,
    });
    const botao = el("button", { class: "btn primario alto largo", type: "submit", text: "Entrar" });

    titulo.textContent = "Entrar";
    subtitulo.textContent = "Use seu usuário (ou e-mail) e senha.";
    alternar.textContent = "Não tenho conta — criar agora";

    trocar(
      formulario,
      el("div", { class: "campo" }, el("label", { for: "login-usuario", text: "Usuário ou e-mail" }), usuario),
      el("div", { class: "campo" }, el("label", { for: "login-senha", text: "Senha" }), senha),
      botao
    );

    formulario.onsubmit = (evento) =>
      enviar(evento, () => api.entrar(usuario.value.trim(), senha.value), botao);

    // Em modo demonstracao o acesso e' publico e conhecido: ja vem preenchido.
    api
      .status()
      .then((status) => {
        if (!status.demo) return;
        usuario.value = "leo";
        senha.value = "demo1234";
        trocar(
          dicaDemo,
          icone("alerta", 15),
          el(
            "span",
            {},
            el("b", { text: "Modo demonstração. " }),
            "Acesso de teste já preenchido (leo / demo1234). Os dados sociais são fictícios."
          )
        );
        dicaDemo.hidden = false;
      })
      .catch(() => null);

    usuario.focus();
  }

  function montarCadastro() {
    const nome = el("input", { id: "novo-nome", type: "text", maxlength: "80", autocomplete: "name" });
    const usuario = el("input", {
      id: "novo-usuario",
      type: "text",
      minlength: "3",
      maxlength: "40",
      pattern: "[A-Za-z0-9._-]+",
      autocomplete: "username",
      required: true,
    });
    const email = el("input", { id: "novo-email", type: "email", autocomplete: "email", required: true });
    const senha = el("input", {
      id: "nova-senha",
      type: "password",
      minlength: "8",
      autocomplete: "new-password",
      required: true,
    });
    const botao = el("button", { class: "btn primario alto largo", type: "submit", text: "Criar conta" });

    titulo.textContent = "Criar conta";
    subtitulo.textContent = "Leva menos de um minuto. Depois você já começa a registrar o que ouviu.";
    alternar.textContent = "Já tenho conta — entrar";
    dicaDemo.hidden = true;

    trocar(
      formulario,
      el("div", { class: "campo" }, el("label", { for: "novo-nome", text: "Como você quer aparecer" }), nome),
      el(
        "div",
        { class: "campo" },
        el("label", { for: "novo-usuario", text: "Usuário" }),
        usuario,
        el("span", { class: "dica", text: "Letras, números, ponto, hífen ou underline." })
      ),
      el("div", { class: "campo" }, el("label", { for: "novo-email", text: "E-mail" }), email),
      el(
        "div",
        { class: "campo" },
        el("label", { for: "nova-senha", text: "Senha" }),
        senha,
        el("span", { class: "dica", text: "Mínimo de 8 caracteres." })
      ),
      botao
    );

    formulario.onsubmit = (evento) =>
      enviar(
        evento,
        () =>
          api.cadastrar({
            username: usuario.value.trim(),
            email: email.value.trim(),
            displayName: nome.value.trim() || undefined,
            password: senha.value,
          }),
        botao
      );

    usuario.focus();
  }

  alternar.addEventListener("click", () => {
    modo = modo === "entrar" ? "cadastro" : "entrar";
    erro.hidden = true;
    if (modo === "entrar") montarEntrar();
    else montarCadastro();
  });

  trocar(
    anfitriao,
    arte(),
    el(
      "div",
      { class: "login-painel" },
      el(
        "div",
        { class: "login-caixa" },
        el("span", { class: "marca" }, el("span", { class: "marca-disco" }), "Sonora"),
        titulo,
        subtitulo,
        dicaDemo,
        erro,
        formulario,
        el("div", { class: "divisor" }),
        alternar
      )
    )
  );

  anfitriao.hidden = false;
  montarEntrar();
}
