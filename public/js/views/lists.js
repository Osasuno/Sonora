// Exploracao de listas (§36). Duas seccoes: as minhas (incluindo as privadas)
// e as publicas da comunidade.
//
// §36 define isso como exploracao simples de conteudo publico — nada de
// curtida, comentario ou ranking de listas.

import { api, ErroApi } from "../api.js";
import { cartaoLista } from "../cards.js";
import { usuarioAtual } from "../state.js";
import { avisarErro, el, icone, plural, trocar, vazio } from "../ui.js";

export async function telaListas(container) {
  const cabecalho = el(
    "header",
    { class: "fileira entre", style: "margin-bottom:26px" },
    el(
      "div",
      {},
      el("h1", { text: "Listas" }),
      el("p", {
        class: "texto-muted",
        text: "Seleções de obras organizadas pelo critério de cada pessoa.",
      })
    ),
    el("a", { class: "btn primario", href: "/lista/nova" }, icone("mais", 16), "Nova lista")
  );

  trocar(container, cabecalho, el("div", { class: "vazio" }, el("span", { class: "carregando-inline" })));

  try {
    const eu = usuarioAtual();
    const [publicas, minhas] = await Promise.all([api.listasPublicas(), api.minhasListas()]);

    const minhasListas = minhas.listas || [];
    // A exploracao publica nao repete as minhas: elas ja aparecem acima.
    const daComunidade = (publicas.listas || []).filter((lista) => lista.autor?.id !== eu?.id);

    const secaoMinhas = el(
      "section",
      { class: "secao" },
      el(
        "div",
        { class: "secao-topo" },
        el("h2", { class: "secao-titulo", text: "Suas listas" }),
        minhasListas.length > 0
          ? el("span", { class: "texto-faint", text: plural(minhasListas.length, "lista", "listas") })
          : null
      ),
      minhasListas.length > 0
        ? el(
            "div",
            { class: "grade-listas" },
            minhasListas.map((lista) => cartaoLista(lista, { mostrarAutor: false }))
          )
        : vazio(
            "Você ainda não tem listas",
            "Monte a primeira: os discos que te marcaram, o melhor de um gênero, o que você recomenda.",
            el("a", { class: "btn primario", href: "/lista/nova", text: "Criar lista" })
          )
    );

    const secaoComunidade = el(
      "section",
      { class: "secao" },
      el(
        "div",
        { class: "secao-topo" },
        el("h2", { class: "secao-titulo", text: "Da comunidade" }),
        daComunidade.length > 0
          ? el("span", { class: "texto-faint", text: plural(daComunidade.length, "lista pública", "listas públicas") })
          : null
      ),
      daComunidade.length > 0
        ? el("div", { class: "grade-listas" }, daComunidade.map((lista) => cartaoLista(lista)))
        : el("p", { class: "texto-muted", text: "Ninguém mais publicou listas por aqui ainda." })
    );

    trocar(container, cabecalho, secaoMinhas, secaoComunidade);
  } catch (erro) {
    avisarErro(erro instanceof ErroApi ? erro.message : "Nao consegui carregar as listas.");
    trocar(container, cabecalho, vazio("Não deu para carregar", "Tente de novo em instantes."));
  }
}
