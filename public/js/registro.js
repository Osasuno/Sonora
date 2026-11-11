// Formulario de avaliacao e review (§29, §30).
//
// Nota e review sao duas coisas independentes e podem existir separadas, mas
// quase sempre a pessoa quer as duas de uma vez. Por isso o formulario envia em
// uma unica chamada: o servidor garante que isso registre apenas UMA escuta
// automatica (§28), em vez de duas.
//
// A escuta pura (ouvi, nao quero avaliar) nao passa por aqui — e' um clique
// direto no cartao ou na pagina da obra.

import { api, ErroApi } from "./api.js";
import { estrelasInput, notaTexto } from "./stars.js";
import { abrirModal, avisarErro, avisarOk, capa, el, rotuloDoTipo, seloDeOrigem } from "./ui.js";

function cabecalho(obra) {
  return el(
    "div",
    { class: "modal-obra" },
    el("div", { class: "modal-obra-capa" }, capa(obra.coverUrl, `Capa de ${obra.title}`)),
    el(
      "div",
      {},
      el("b", { text: obra.title }),
      el("span", { text: obra.artistName }),
      el(
        "div",
        { class: "fileira fileira-selos" },
        el("span", {
          class: "texto-faint",
          text: [rotuloDoTipo(obra.type), obra.releaseYear].filter(Boolean).join(" · "),
        }),
        obra.origin ? seloDeOrigem(obra.origin, { curto: true }) : null
      )
    )
  );
}

function campoNota(inicial, aoMudar) {
  const rotulo = el("span", {
    class: inicial ? "nota-numero" : "sem-nota",
    text: inicial ? `${notaTexto(inicial)} / 5` : "sem nota",
  });

  const entrada = estrelasInput(inicial, (nota) => {
    rotulo.className = nota ? "nota-numero" : "sem-nota";
    rotulo.textContent = nota ? `${notaTexto(nota)} / 5` : "sem nota";
    aoMudar(nota);
  });

  return el(
    "div",
    { class: "nota-escolha" },
    el(
      "div",
      {},
      el("div", { class: "rotulo", text: "Sua nota" }),
      entrada.elemento,
      el("div", { class: "dica", text: "De meia em meia estrela, de 0,5 a 5. Delete limpa a nota." })
    ),
    rotulo
  );
}

/**
 * Abre o formulario.
 *
 * `nota` e `texto` preenchidos = a pessoa ja avaliou ou resenhou esta obra e
 * esta editando. Nao existe historico de versoes: a avaliacao e a review atuais
 * sao substituidas (§29, §30).
 */
export function abrirRegistro({ obra, nota = null, texto = "", aoConcluir, aoPerguntarQueroOuvir }) {
  const jaTinha = nota !== null || Boolean(texto);

  const dados = { nota, texto: texto || "" };

  const resenha = el("textarea", {
    id: "campo-review",
    placeholder: "O que você achou? (opcional)",
    maxlength: "5000",
    onInput: (evento) => {
      dados.texto = evento.target.value;
    },
  });
  resenha.value = dados.texto;

  const salvar = el("button", {
    class: "btn primario",
    type: "button",
    text: jaTinha ? "Salvar alterações" : "Publicar",
  });

  const corpo = el(
    "div",
    { class: "pilha" },
    cabecalho(obra),
    campoNota(dados.nota, (valor) => {
      dados.nota = valor;
    }),
    el("div", { class: "campo" }, el("label", { for: "campo-review", text: "Review" }), resenha),
    jaTinha
      ? null
      : el("p", {
          class: "dica",
          text: "Publicar pela primeira vez também registra uma escuta desta obra.",
        })
  );

  const modal = abrirModal({
    titulo: jaTinha ? "Editar avaliação e review" : "Avaliar e escrever",
    corpo,
    rodape: [
      el("button", { class: "btn fantasma", type: "button", text: "Cancelar", onClick: () => modal.fechar() }),
      salvar,
    ],
  });

  salvar.addEventListener("click", async () => {
    const texto = dados.texto.trim();

    if (dados.nota === null && texto.length === 0) {
      avisarErro("Dê uma nota, escreva uma review, ou as duas.");
      return;
    }

    salvar.disabled = true;
    try {
      // Uma chamada so: e' o que garante uma escuta automatica, nao duas (§28).
      const resposta = await api.registrar({
        ref: obra.ref,
        nota: dados.nota,
        texto,
      });

      modal.fechar();
      avisarOk(jaTinha ? "Atualizado." : "Publicado.");
      aoConcluir?.(resposta);
      if (resposta?.perguntarQueroOuvir) await aoPerguntarQueroOuvir?.(resposta);
    } catch (erro) {
      avisarErro(erro instanceof ErroApi ? erro.message : "Nao consegui salvar.");
      salvar.disabled = false;
    }
  });
}
