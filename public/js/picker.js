// Dois seletores em modal:
//   escolherObras  — para montar uma lista
//   escolherLista  — para mandar uma obra para uma lista existente
//
// A busca de obras vai a fonte externa (§39), nao ao banco local: montar uma
// lista nao deveria exigir que outra pessoa ja tivesse cadastrado a obra. Entrar
// numa lista e' interacao, entao a obra e' persistida nesse momento (§13).

import { api, ErroApi } from "./api.js";
import { normalizarObra } from "./actions.js";
import {
  abrirModal,
  avisarErro,
  avisarOk,
  capa,
  el,
  esqueletoGrade,
  icone,
  plural,
  rotuloDoTipo,
  trocar,
  vazio,
} from "./ui.js";

const ATRASO_BUSCA = 420;
const MINIMO = 2;

// ─── Escolher obras para uma lista ─────────────────────────────────────────

/** `aoConfirmar` recebe as obras escolhidas, na ordem em que foram clicadas. */
export function escolherObras({ titulo = "Escolher obras", maximo = 25, aoConfirmar }) {
  const escolhidas = new Map();

  const contador = el("span", { class: "texto-faint", text: `0 de ${maximo}` });
  const resultados = el("div", { class: "pilha" });
  const confirmarBtn = el("button", {
    class: "btn primario",
    type: "button",
    text: "Confirmar",
    disabled: true,
  });

  const campo = el("input", {
    type: "search",
    id: "picker-busca",
    placeholder: "Título ou artista",
    autocomplete: "off",
  });

  let temporizador = null;
  campo.addEventListener("input", () => {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => buscar(campo.value.trim()), ATRASO_BUSCA);
  });

  function atualizarContador() {
    contador.textContent = `${escolhidas.size} de ${maximo}`;
    confirmarBtn.disabled = escolhidas.size === 0;
  }

  function alternar(obra, cartao) {
    if (escolhidas.has(obra.ref)) {
      escolhidas.delete(obra.ref);
      cartao.dataset.escolhido = "nao";
    } else {
      if (escolhidas.size >= maximo) {
        avisarErro(`Você pode escolher no máximo ${maximo}.`);
        return;
      }
      escolhidas.set(obra.ref, obra);
      cartao.dataset.escolhido = "sim";
    }
    atualizarContador();
  }

  function item(bruto) {
    const obra = normalizarObra(bruto);
    const marca = el("span", { class: "picker-marca" }, icone("check", 16));

    const cartao = el(
      "button",
      {
        class: "picker-item",
        type: "button",
        dataset: { escolhido: escolhidas.has(obra.ref) ? "sim" : "nao" },
        "aria-label": `Escolher ${obra.title}, de ${obra.artistName}`,
      },
      el("div", { class: "capa-wrap" }, capa(obra.coverUrl, `Capa de ${obra.title}`), marca),
      el(
        "div",
        { class: "card-meta" },
        el("span", { class: "card-titulo", text: obra.title }),
        el("span", { class: "card-artista", text: obra.artistName }),
        el("span", {
          class: "card-ano",
          text: [rotuloDoTipo(obra.type), obra.releaseYear].filter(Boolean).join(" · "),
        })
      )
    );
    cartao.addEventListener("click", () => alternar(obra, cartao));
    return cartao;
  }

  /** Sem termo, mostra o que ja esta no Sonora; com termo, vai a fonte externa. */
  async function buscar(termo) {
    trocar(resultados, esqueletoGrade(8));

    if (termo.length > 0 && termo.length < MINIMO) {
      trocar(resultados, vazio("Escreva um pouco mais", `Mínimo de ${MINIMO} letras.`));
      return;
    }

    try {
      const obras =
        termo.length === 0
          ? (await api.explorar({ ordem: "popularidade" })).lancamentos
          : (await api.pesquisar(termo)).resultados;

      if (obras.length === 0) {
        trocar(
          resultados,
          vazio("Nada encontrado", "Tente outro termo. Se a obra não existe na fonte externa, cadastre-a à mão antes.")
        );
        return;
      }
      trocar(resultados, el("div", { class: "grade compacta" }, obras.map(item)));
    } catch (erro) {
      const indisponivel = erro instanceof ErroApi && (erro.status === 503 || erro.status === 0);
      trocar(
        resultados,
        vazio(
          indisponivel ? "A fonte externa está indisponível" : "A busca falhou",
          indisponivel ? "Tente de novo em instantes." : "Revise o termo e tente de novo."
        )
      );
    }
  }

  const modal = abrirModal({
    titulo,
    largo: true,
    corpo: el(
      "div",
      { class: "pilha" },
      el(
        "div",
        { class: "campo" },
        el("label", { for: "picker-busca", text: "Buscar obras" }),
        campo,
        el("span", {
          class: "dica",
          text: "A busca consulta o catálogo oficial de metadados. Sem termo, mostra o que já está no Sonora.",
        })
      ),
      resultados
    ),
    rodape: [
      el("span", { class: "esquerda" }, contador),
      el("button", { class: "btn fantasma", type: "button", text: "Cancelar", onClick: () => modal.fechar() }),
      confirmarBtn,
    ],
  });

  confirmarBtn.addEventListener("click", () => {
    modal.fechar();
    aoConfirmar([...escolhidas.values()]);
  });

  buscar("");
}

// ─── Mandar uma obra para uma lista existente ──────────────────────────────

/**
 * Lista as minhas listas (publicas e privadas) e adiciona a obra na escolhida,
 * com um comentario opcional por item (§34).
 */
export function escolherLista(obra) {
  const area = el("div", { class: "pilha" });

  const comentario = el("input", {
    type: "text",
    id: "comentario-item",
    maxlength: "300",
    placeholder: "Por que esta obra entra na lista? (opcional)",
  });

  const modal = abrirModal({
    titulo: `Adicionar "${obra.title}" a uma lista`,
    corpo: el(
      "div",
      { class: "pilha" },
      el(
        "div",
        { class: "campo" },
        el("label", { for: "comentario-item", text: "Comentário do item" }),
        comentario
      ),
      area
    ),
    rodape: [
      el("button", { class: "btn fantasma", type: "button", text: "Fechar", onClick: () => modal.fechar() }),
      el("a", { class: "btn", href: "/lista/nova", text: "Criar nova lista", onClick: () => modal.fechar() }),
    ],
  });

  async function adicionar(lista) {
    try {
      await api.adicionarNaLista(lista.id, obra.ref, comentario.value.trim() || undefined);
      modal.fechar();
      avisarOk(`Adicionado a "${lista.title}".`);
    } catch (erro) {
      avisarErro(erro instanceof ErroApi ? erro.message : "Nao consegui adicionar a lista.");
    }
  }

  api
    .minhasListas()
    .then(({ listas }) => {
      if (listas.length === 0) {
        trocar(
          area,
          vazio("Você ainda não tem listas", "Crie uma lista primeiro e depois volte aqui.")
        );
        return;
      }

      trocar(
        area,
        el(
          "div",
          { class: "escolha-listas" },
          listas.map((lista) =>
            el(
              "button",
              { class: "escolha-lista", type: "button", onClick: () => adicionar(lista) },
              icone("listas", 16),
              el(
                "span",
                {},
                el("b", { text: lista.title }),
                el("span", {
                  class: "texto-faint",
                  text: `${plural(lista.totalItens, "obra", "obras")}${
                    lista.visibility === "PRIVATE" ? " · privada" : ""
                  }`,
                })
              )
            )
          )
        )
      );
    })
    .catch(() => {
      trocar(area, vazio("Não deu para carregar suas listas", "Tente de novo em instantes."));
    });
}
