// Uma lista aberta: cabecalho, descricao e as obras na ordem definida pelo
// autor, cada uma com o comentario que ele escreveu para aquele item (§34).

import { api, ErroApi } from "../api.js";
import { cartaoObra } from "../cards.js";
import { ir } from "../router.js";
import {
  avatar,
  avisarErro,
  avisarOk,
  confirmar,
  dataCurta,
  el,
  icone,
  plural,
  trocar,
  vazio,
} from "../ui.js";

async function apagar(lista) {
  const confirmado = await confirmar({
    titulo: `Apagar "${lista.title}"?`,
    mensagem:
      "A lista some. As obras continuam no catálogo e as suas escutas, notas e reviews não são afetadas.",
    textoConfirmar: "Apagar lista",
  });
  if (!confirmado) return;

  try {
    await api.apagarLista(lista.id);
    avisarOk("Lista apagada.");
    ir("/listas");
  } catch (erro) {
    avisarErro(erro instanceof ErroApi ? erro.message : "Nao consegui apagar a lista.");
  }
}

function cabecalho(lista, souODono) {
  const acoes = souODono
    ? el(
        "div",
        { class: "fileira" },
        el("a", { class: "btn", href: `/lista/${lista.id}/editar` }, icone("lapis", 15), "Editar"),
        el("button", { class: "btn perigo", type: "button", text: "Apagar", onClick: () => apagar(lista) })
      )
    : null;

  return el(
    "header",
    { class: "pilha", style: "margin-bottom:28px" },
    el(
      "div",
      { class: "fileira entre" },
      el(
        "div",
        { class: "pilha", style: "gap:6px" },
        el(
          "div",
          { class: "fileira fileira-selos" },
          el("span", { class: "secao-titulo", text: "Lista" }),
          lista.visibility === "PRIVATE" ? el("span", { class: "selo", text: "privada" }) : null
        ),
        el("h1", { text: lista.title })
      ),
      acoes
    ),
    el(
      "div",
      { class: "fileira" },
      avatar(lista.autor),
      el("a", { href: `/u/${encodeURIComponent(lista.autor.username)}`, text: lista.autor.displayName }),
      el("span", { class: "texto-faint", text: plural(lista.totalItens, "obra", "obras") }),
      el("span", { class: "texto-faint", text: `atualizada em ${dataCurta(lista.updatedAt)}` })
    ),
    lista.description
      ? el("p", {
          class: "texto-muted",
          style: "max-width:70ch;white-space:pre-wrap",
          text: lista.description,
        })
      : null
  );
}

export async function telaLista(container, parametros) {
  trocar(container, el("div", { class: "vazio" }, el("span", { class: "carregando-inline" })));

  try {
    const dados = await api.lista(parametros.id);
    const { lista, itens, souODono } = dados;
    const recarregar = () => telaLista(container, parametros);

    const grade = el(
      "div",
      { class: "grade" },
      itens.map((item, indice) =>
        cartaoObra(item, {
          posicao: indice + 1,
          aoMudar: recarregar,
          // §34: o comentario e' do item na lista, nao uma nota numerica.
          rodapeExtra: item.comment
            ? el("div", { class: "card-nota-lista", text: item.comment })
            : undefined,
        })
      )
    );

    trocar(
      container,
      cabecalho(lista, souODono),
      itens.length > 0
        ? grade
        : vazio(
            "Lista sem obras",
            souODono ? "Abra o editor e escolha as obras." : "Quem criou ainda não adicionou nada."
          )
    );
    document.title = `${lista.title} — Sonora`;
  } catch (erro) {
    avisarErro(erro instanceof ErroApi ? erro.message : "Lista nao encontrada.");
    trocar(container, vazio("Lista não encontrada", "Confira o endereço ou volte para as listas."));
  }
}
