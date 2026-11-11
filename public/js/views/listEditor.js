// Editor de lista (§34, §35): titulo, descricao, visibilidade, obras na ordem
// escolhida e um comentario por item. Serve para criar (/lista/nova) e para
// editar (/lista/:id/editar).
//
// Os itens guardam `ref`, nao id: uma obra pode entrar na lista vindo direto da
// fonte externa e ser persistida nesse momento (§13).

import { api, ErroApi } from "../api.js";
import { escolherObras } from "../picker.js";
import { ir } from "../router.js";
import {
  avisarErro,
  avisarOk,
  botaoIcone,
  el,
  icone,
  rotuloDoTipo,
  trocar,
  vazio,
} from "../ui.js";

/** Uma linha do editor: posicao, capa, identificacao, comentario e ordem. */
function linhaItem(item, indice, acoes) {
  const comentario = el("input", {
    type: "text",
    value: item.comment || "",
    maxlength: "300",
    placeholder: "comentário sobre esta obra na lista (opcional)",
    "aria-label": `Comentário sobre ${item.title}`,
    onInput: (evento) => {
      item.comment = evento.target.value;
    },
  });

  return el(
    "div",
    { class: "editor-item" },
    el("span", { class: "pos", text: String(indice + 1) }),
    item.coverUrl
      ? el("img", { src: item.coverUrl, alt: "", loading: "lazy" })
      : el("div", { class: "capa-vazia", style: "width:44px;height:44px;border-radius:6px" }),
    el(
      "div",
      { class: "editor-item-corpo" },
      el("b", { text: item.title }),
      el("span", { text: `${item.artistName} · ${rotuloDoTipo(item.type)}` }),
      el("div", { style: "margin-top:6px" }, comentario)
    ),
    el(
      "div",
      { class: "editor-item-acoes" },
      botaoIcone("seta_cima", "Subir", () => acoes.mover(indice, -1), { tamanho: 15 }),
      botaoIcone("seta_baixo", "Descer", () => acoes.mover(indice, 1), { tamanho: 15 }),
      botaoIcone("lixeira", "Remover da lista", () => acoes.remover(indice), { tamanho: 15 })
    )
  );
}

export async function telaEditorLista(container, parametros) {
  const editando = Boolean(parametros.id);
  let itens = [];
  // §35: lista nova nasce publica.
  const estado = { title: "", description: "", visibility: "PUBLIC" };

  if (editando) {
    trocar(container, el("div", { class: "vazio" }, el("span", { class: "carregando-inline" })));
    try {
      const dados = await api.lista(parametros.id);
      if (!dados.souODono) {
        avisarErro("Essa lista nao e sua.");
        ir(`/lista/${parametros.id}`);
        return;
      }
      estado.title = dados.lista.title;
      estado.description = dados.lista.description;
      estado.visibility = dados.lista.visibility;
      itens = dados.itens.map((item) => ({
        ref: String(item.id),
        title: item.title,
        type: item.type,
        artistName: item.artist_name,
        coverUrl: item.cover_url,
        comment: item.comment,
      }));
    } catch (erro) {
      avisarErro(erro instanceof ErroApi ? erro.message : "Lista nao encontrada.");
      trocar(container, vazio("Lista não encontrada", "Volte para as listas e tente de novo."));
      return;
    }
  }

  const areaItens = el("div", { class: "editor-itens" });

  const acoes = {
    mover(indice, direcao) {
      const destino = indice + direcao;
      if (destino < 0 || destino >= itens.length) return;
      [itens[indice], itens[destino]] = [itens[destino], itens[indice]];
      pintar();
    },
    remover(indice) {
      itens.splice(indice, 1);
      pintar();
    },
  };

  function pintar() {
    if (itens.length === 0) {
      trocar(
        areaItens,
        vazio("Nenhuma obra na lista", "Use o botão acima para escolher obras.")
      );
      return;
    }
    trocar(areaItens, itens.map((item, indice) => linhaItem(item, indice, acoes)));
  }

  const titulo = el("input", {
    type: "text",
    id: "lista-titulo",
    maxlength: "120",
    value: estado.title,
    placeholder: "Ex.: shoegaze para começar",
    required: true,
    onInput: (evento) => {
      estado.title = evento.target.value;
    },
  });

  const descricao = el("textarea", {
    id: "lista-descricao",
    maxlength: "1500",
    placeholder: "Conte o critério da lista (opcional)",
    onInput: (evento) => {
      estado.description = evento.target.value;
    },
  });
  descricao.value = estado.description;

  const privada = el("input", { type: "checkbox", onChange: (evento) => {
    estado.visibility = evento.target.checked ? "PRIVATE" : "PUBLIC";
  } });
  privada.checked = estado.visibility === "PRIVATE";

  const visibilidade = el(
    "div",
    { class: "campo" },
    el("label", { class: "check" }, privada, el("span", { text: "Lista privada" })),
    el("span", {
      class: "dica",
      text: "Listas nascem públicas. Privada fica visível só para você (e para a administração, em moderação).",
    })
  );

  const adicionar = el(
    "button",
    {
      class: "btn",
      type: "button",
      onClick: () =>
        escolherObras({
          titulo: "Adicionar obras à lista",
          maximo: 25,
          aoConfirmar: (obras) => {
            const jaTem = new Set(itens.map((item) => item.ref));
            for (const obra of obras) {
              if (jaTem.has(obra.ref)) continue;
              itens.push({
                ref: obra.ref,
                title: obra.title,
                type: obra.type,
                artistName: obra.artistName,
                coverUrl: obra.coverUrl,
                comment: "",
              });
            }
            pintar();
          },
        }),
    },
    icone("mais", 16),
    "Adicionar obras"
  );

  const salvar = el("button", {
    class: "btn primario",
    type: "button",
    text: editando ? "Salvar lista" : "Criar lista",
  });

  salvar.addEventListener("click", async () => {
    if (!estado.title.trim()) {
      avisarErro("De um titulo a lista.");
      titulo.focus();
      return;
    }

    salvar.disabled = true;
    const corpo = {
      title: estado.title.trim(),
      description: estado.description.trim(),
      visibility: estado.visibility,
      items: itens.map((item) => ({ ref: item.ref, comment: (item.comment || "").trim() })),
    };

    try {
      if (editando) {
        await api.editarLista(parametros.id, corpo);
        avisarOk("Lista salva.");
        ir(`/lista/${parametros.id}`);
      } else {
        const criada = await api.criarLista(corpo);
        avisarOk("Lista criada.");
        ir(`/lista/${criada.id}`);
      }
    } catch (erro) {
      avisarErro(erro instanceof ErroApi ? erro.message : "Nao consegui salvar a lista.");
      salvar.disabled = false;
    }
  });

  trocar(
    container,
    el("h1", { text: editando ? "Editar lista" : "Nova lista", style: "margin-bottom:22px" }),
    el(
      "div",
      { class: "pilha-g", style: "max-width:760px" },
      el(
        "div",
        { class: "pilha" },
        el("div", { class: "campo" }, el("label", { for: "lista-titulo", text: "Título" }), titulo),
        el("div", { class: "campo" }, el("label", { for: "lista-descricao", text: "Descrição" }), descricao),
        visibilidade
      ),
      el(
        "div",
        { class: "pilha" },
        el("div", { class: "fileira entre" }, el("span", { class: "secao-titulo", text: "Obras" }), adicionar),
        areaItens
      ),
      el(
        "div",
        { class: "fileira fim" },
        el("a", {
          class: "btn fantasma",
          href: editando ? `/lista/${parametros.id}` : "/listas",
          text: "Cancelar",
        }),
        salvar
      )
    )
  );

  pintar();
}
