// Notas em estrelas, de meia em meia — a escala do Letterboxd (0,5 a 5).

import { el, icone } from "./ui.js";

const TOTAL = 5;

/** Uma estrela: vazia, meia ou cheia. A metade e' um recorte de 50%. */
function estrela(preenchimento) {
  const largura = preenchimento === "cheia" ? "100%" : "50%";
  const camadas = [icone("estrela", 14)];

  if (preenchimento !== "vazia") {
    camadas.push(
      el("span", { class: "preenchida", style: `width:${largura}` }, icone("estrela", 14))
    );
  }
  return el("span", { class: "est" }, camadas);
}

/**
 * Exibicao somente leitura. Devolve null quando nao ha nota, para o chamador
 * decidir o que mostrar no lugar.
 */
export function estrelas(nota, { grande = false } = {}) {
  if (nota === null || nota === undefined) return null;

  const itens = [];
  for (let posicao = 1; posicao <= TOTAL; posicao += 1) {
    if (nota >= posicao) itens.push(estrela("cheia"));
    else if (nota >= posicao - 0.5) itens.push(estrela("meia"));
    else itens.push(estrela("vazia"));
  }

  return el(
    "span",
    { class: `estrelas ${grande ? "g" : ""}`.trim(), "aria-label": `nota ${nota} de 5`, role: "img" },
    itens
  );
}

/** Texto curto da nota, com virgula decimal (padrao pt-BR). */
export const notaTexto = (nota) =>
  nota === null || nota === undefined ? "" : String(nota).replace(".", ",");

/**
 * Campo interativo de nota. Cada estrela tem duas metades clicaveis:
 * a esquerda vale meia, a direita vale inteira. Tambem responde ao teclado
 * (setas para ajustar, Delete para limpar).
 */
export function estrelasInput(notaInicial, aoMudar) {
  let nota = notaInicial ?? null;
  const container = el("div", {
    class: "estrelas-input",
    role: "slider",
    tabindex: "0",
    "aria-label": "Nota do album, de meia em meia estrela",
    "aria-valuemin": "0",
    "aria-valuemax": "5",
  });

  function definir(novaNota) {
    nota = novaNota;
    pintar();
    aoMudar(nota);
  }

  function pintar() {
    container.setAttribute("aria-valuenow", String(nota ?? 0));
    container.setAttribute("aria-valuetext", nota ? `${notaTexto(nota)} de 5` : "sem nota");

    [...container.children].forEach((botao, indice) => {
      const posicao = indice + 1;
      const atual = nota ?? 0;
      let estado = "vazia";
      if (atual >= posicao) estado = "cheia";
      else if (atual >= posicao - 0.5) estado = "meia";
      botao.dataset.estado = estado;
    });
  }

  for (let posicao = 1; posicao <= TOTAL; posicao += 1) {
    const botao = el(
      "button",
      {
        class: "estrela-btn",
        type: "button",
        "aria-label": `dar nota ${posicao}`,
        onClick: (evento) => {
          const caixa = botao.getBoundingClientRect();
          const metadeEsquerda = evento.clientX - caixa.left < caixa.width / 2;
          const escolhida = metadeEsquerda ? posicao - 0.5 : posicao;
          definir(nota === escolhida ? null : escolhida);
        },
      },
      el("span", { class: "cheia" }, icone("estrela", 30)),
      el("span", { class: "metade" }, icone("estrela", 30))
    );
    container.append(botao);
  }

  container.addEventListener("keydown", (evento) => {
    const passos = { ArrowRight: 0.5, ArrowUp: 0.5, ArrowLeft: -0.5, ArrowDown: -0.5 };
    if (evento.key === "Delete" || evento.key === "Backspace") {
      evento.preventDefault();
      definir(null);
      return;
    }
    const passo = passos[evento.key];
    if (passo === undefined) return;

    evento.preventDefault();
    const proxima = Math.min(5, Math.max(0.5, (nota ?? 0) + passo));
    definir(proxima);
  });

  pintar();
  return { elemento: container, valor: () => nota };
}

/** Histograma de 0,5 a 5 usado nas paginas de album e de perfil. */
export function histograma(dados) {
  const mapa = new Map((dados || []).map((linha) => [Number(linha.nota), linha.quantidade]));
  const maximo = Math.max(1, ...mapa.values());

  const barras = [];
  for (let nota = 0.5; nota <= 5; nota += 0.5) {
    const quantidade = mapa.get(nota) || 0;
    barras.push(
      el("div", {
        class: "histograma-barra",
        style: `height:${Math.round((quantidade / maximo) * 100)}%`,
        dataset: { tem: quantidade > 0 ? "sim" : "nao" },
        title: `${notaTexto(nota)} estrelas: ${quantidade}`,
      })
    );
  }
  return el("div", { class: "histograma", role: "img", "aria-label": "distribuicao das notas" }, barras);
}
