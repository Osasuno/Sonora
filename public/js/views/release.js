// Pagina do lancamento (§37). Centro da aplicacao: e' aqui que a obra encontra
// as pessoas.
//
// O endereco aceita id local ou MBID. Abrir esta pagina NAO persiste a obra
// (§13): quando ela so existe na fonte externa, os numeros da comunidade vem
// zerados porque de fato ninguem interagiu ainda. A persistencia acontece na
// primeira acao pessoal.

import { api, ErroApi } from "../api.js";
import {
  abrirAvaliacao,
  alternarFavorito,
  alternarQueroOuvir,
  linkArtista,
  normalizarObra,
  registrarEscuta,
} from "../actions.js";
import { cartaoReview, pilhaDeCartoes } from "../cards.js";
import { escolherLista } from "../picker.js";
import { estrelas, histograma, notaTexto } from "../stars.js";
import {
  avisarErro,
  avisarOk,
  capa,
  confirmar,
  dataCurta,
  dataDeLancamento,
  el,
  esqueletoGrade,
  icone,
  plural,
  rotuloDoTipo,
  seloDeOrigem,
  trocar,
  vazio,
} from "../ui.js";

const erroTexto = (erro, reserva) => (erro instanceof ErroApi ? erro.message : reserva);

// ─── Cabecalho ──────────────────────────────────────────────────────────────

function ficha(obra) {
  const hrefArtista = linkArtista(obra);

  const linhas = [
    el("span", { class: "selo", text: rotuloDoTipo(obra.type) }),
    obra.releaseDateText || obra.releaseYear
      ? el("span", {
          class: "texto-faint",
          text: dataDeLancamento(obra.releaseDateText, obra.releaseYear),
        })
      : null,
    // §37 e §46: badge de origem, sem link para fora.
    seloDeOrigem(obra.origin),
  ];

  return el(
    "div",
    { class: "obra-ficha" },
    el("h1", { text: obra.title }),
    hrefArtista
      ? el("a", { class: "obra-artista", href: hrefArtista, text: obra.artistName })
      : el("span", { class: "obra-artista", text: obra.artistName }),
    el("div", { class: "fileira fileira-selos" }, linhas),
    obra.genres.length > 0
      ? el(
          "div",
          { class: "chips-secos" },
          obra.genres.map((g) => el("span", { class: "selo", text: g }))
        )
      : null
  );
}

/** Media da comunidade, quantidade de avaliacoes e popularidade (§37, §42). */
function numerosDaComunidade(comunidade) {
  if (comunidade.total === 0 && comunidade.escutas === 0) {
    return el("p", {
      class: "texto-muted",
      text: "Ninguém registrou nada sobre esta obra no Sonora ainda. Você pode ser a primeira pessoa.",
    });
  }

  const media =
    comunidade.total > 0
      ? el(
          "div",
          { class: "nota-grande" },
          el("b", { text: notaTexto(comunidade.media) }),
          estrelas(comunidade.media, { grande: true }),
          el("span", {
            class: "texto-faint",
            text: plural(comunidade.total, "avaliação", "avaliações"),
          })
        )
      : el("p", { class: "texto-muted", text: "Ainda sem avaliações." });

  return el(
    "div",
    { class: "comunidade-numeros" },
    media,
    // §42: popularidade no Sonora e' escuta, nao favorito nem review.
    el(
      "div",
      { class: "comunidade-contagens" },
      el(
        "span",
        {},
        icone("relogio", 14),
        ` ${plural(comunidade.escutas, "escuta", "escutas")} de ${plural(
          comunidade.ouvintes,
          "pessoa",
          "pessoas"
        )}`
      ),
      el("span", {}, icone("lapis", 14), ` ${plural(comunidade.reviews, "review", "reviews")}`)
    ),
    comunidade.histograma.length > 0 ? histograma(comunidade.histograma) : null
  );
}

// ─── Acoes pessoais (§37) ───────────────────────────────────────────────────

function acoesPessoais(obra, voce, recarregar) {
  const ouvi = el(
    "button",
    { class: "btn primario", type: "button" },
    icone("check", 16),
    "Registrar escuta"
  );
  ouvi.addEventListener("click", async () => {
    ouvi.disabled = true;
    await registrarEscuta(obra);
    recarregar();
  });

  const avaliar = el(
    "button",
    { class: "btn", type: "button" },
    icone("estrela", 16),
    voce.nota !== null || voce.review ? "Editar avaliação e review" : "Avaliar e escrever"
  );
  avaliar.addEventListener("click", () =>
    abrirAvaliacao(obra, {
      nota: voce.nota,
      texto: voce.review?.review || "",
      aoConcluir: recarregar,
    })
  );

  const favorito = el(
    "button",
    { class: `btn ${voce.favorito ? "ativo" : ""}`.trim(), type: "button", "aria-pressed": String(voce.favorito) },
    icone("coracao", 16),
    voce.favorito ? "Nos favoritos" : "Favoritar"
  );
  favorito.addEventListener("click", async () => {
    favorito.disabled = true;
    await alternarFavorito(obra, voce.favorito);
    recarregar();
  });

  const quero = el(
    "button",
    {
      class: `btn ${voce.quero_ouvir ? "ativo" : ""}`.trim(),
      type: "button",
      "aria-pressed": String(voce.quero_ouvir),
    },
    icone("marcador", 16),
    voce.quero_ouvir ? "No Quero ouvir" : "Quero ouvir"
  );
  quero.addEventListener("click", async () => {
    quero.disabled = true;
    await alternarQueroOuvir(obra, voce.quero_ouvir);
    recarregar();
  });

  const naLista = el("button", { class: "btn", type: "button" }, icone("listas", 16), "Adicionar a lista");
  naLista.addEventListener("click", () => escolherLista(obra));

  return el("div", { class: "obra-acoes" }, ouvi, avaliar, favorito, quero, naLista);
}

/** Minha nota e minha review, do meu ponto de vista (§41). */
function minhaParte(obra, voce, recarregar) {
  if (voce.nota === null && !voce.review) return null;

  const removerNota =
    voce.nota !== null
      ? el("button", {
          class: "btn fantasma pequeno",
          type: "button",
          text: "Remover nota",
          onClick: async () => {
            const sim = await confirmar({
              titulo: "Remover a sua nota?",
              mensagem: "A review e as escutas continuam. Só a nota sai.",
              textoConfirmar: "Remover nota",
            });
            if (!sim) return;
            try {
              await api.removerAvaliacao(obra.ref);
              avisarOk("Nota removida.");
              recarregar();
            } catch (erro) {
              avisarErro(erroTexto(erro, "Nao consegui remover a nota."));
            }
          },
        })
      : null;

  // §30 e §55: excluir a review remove SOMENTE a review.
  const removerReview = voce.review
    ? el("button", {
        class: "btn fantasma pequeno",
        type: "button",
        text: "Excluir review",
        onClick: async () => {
          const sim = await confirmar({
            titulo: "Excluir a sua review?",
            mensagem:
              "Somente o texto da review é removido. A sua nota, as suas escutas, o favorito e as listas continuam como estão.",
            textoConfirmar: "Excluir review",
          });
          if (!sim) return;
          try {
            await api.removerReview(obra.ref);
            avisarOk("Review excluída.");
            recarregar();
          } catch (erro) {
            avisarErro(erroTexto(erro, "Nao consegui excluir a review."));
          }
        },
      })
    : null;

  return el(
    "section",
    { class: "painel minha-parte" },
    el("div", { class: "painel-titulo", text: "Você" }),
    el(
      "div",
      { class: "pilha" },
      voce.nota !== null
        ? el(
            "div",
            { class: "fileira" },
            estrelas(voce.nota),
            el("span", { class: "nota-numero", text: `${notaTexto(voce.nota)} / 5` })
          )
        : el("p", { class: "texto-faint", text: "Você ainda não deu nota." }),
      voce.review ? el("div", { class: "entrada-resenha aberta", text: voce.review.review }) : null,
      el("div", { class: "fileira" }, removerNota, removerReview)
    )
  );
}

/** Historico de escutas desta pessoa para esta obra (§37). */
function minhasEscutas(obra, escutas, recarregar) {
  if (escutas.length === 0) return null;

  const remover = async (escuta) => {
    const sim = await confirmar({
      titulo: "Remover esta escuta?",
      mensagem: `A escuta de ${dataCurta(escuta.listened_on)} sai do seu histórico. A nota e a review continuam.`,
      textoConfirmar: "Remover",
    });
    if (!sim) return;
    try {
      await api.removerEscuta(escuta.id);
      avisarOk("Escuta removida.");
      recarregar();
    } catch (erro) {
      avisarErro(erroTexto(erro, "Nao consegui remover a escuta."));
    }
  };

  return el(
    "section",
    { class: "painel" },
    el(
      "div",
      { class: "painel-titulo" },
      `Suas escutas (${escutas.length})`
    ),
    el(
      "ul",
      { class: "lista-escutas" },
      escutas.map((escuta) =>
        el(
          "li",
          {},
          icone("relogio", 14),
          el("span", { text: dataCurta(escuta.listened_on) }),
          el("button", {
            class: "icone-btn",
            type: "button",
            "aria-label": `Remover escuta de ${dataCurta(escuta.listened_on)}`,
            title: "Remover",
            onClick: () => remover(escuta),
          }, icone("lixeira", 14))
        )
      )
    )
  );
}

// ─── Reviews da comunidade (§44) ────────────────────────────────────────────

function reviewsDaComunidade(obra, reviews, voce, recarregar) {
  if (reviews.length === 0) {
    return el(
      "section",
      { class: "secao" },
      el("h2", { class: "secao-titulo", text: "Reviews da comunidade" }),
      el("p", { class: "texto-muted", text: "Nenhuma review por aqui ainda." })
    );
  }

  return el(
    "section",
    { class: "secao" },
    el("h2", { class: "secao-titulo", text: `Reviews da comunidade (${reviews.length})` }),
    pilhaDeCartoes(reviews, (review) =>
      cartaoReview(review, {
        aoEditar: () =>
          abrirAvaliacao(obra, {
            nota: voce.nota,
            texto: review.review,
            aoConcluir: recarregar,
          }),
        aoRemover: async () => {
          const sim = await confirmar({
            titulo: "Excluir a sua review?",
            mensagem: "Somente a review é removida. Nota e escutas continuam.",
            textoConfirmar: "Excluir review",
          });
          if (!sim) return;
          try {
            await api.removerReview(obra.ref);
            avisarOk("Review excluída.");
            recarregar();
          } catch (erro) {
            avisarErro(erroTexto(erro, "Nao consegui excluir a review."));
          }
        },
      })
    )
  );
}

/** Obra que ainda nao foi persistida: deixa isso explicito, sem assustar. */
const avisoSoNaFonte = () =>
  el(
    "div",
    { class: "faixa-aviso" },
    icone("info", 18),
    el(
      "div",
      {},
      el("b", { text: "Esta obra ainda não está no Sonora" }),
      el("span", {
        text: "Você está vendo os dados direto da fonte externa. Ela entra no catálogo da plataforma na sua primeira ação: registrar escuta, avaliar, favoritar, guardar no Quero ouvir ou colocar numa lista.",
      })
    )
  );

// ─── Tela ───────────────────────────────────────────────────────────────────

export async function telaLancamento(container, parametros) {
  const recarregar = () => telaLancamento(container, parametros);

  trocar(container, esqueletoGrade(4));

  let dados;
  try {
    dados = await api.lancamento(parametros.id);
  } catch (erro) {
    if (erro instanceof ErroApi && erro.status === 404) {
      trocar(container, vazio("Lançamento não encontrado", "O endereço não corresponde a nenhuma obra."));
      return;
    }
    avisarErro(erroTexto(erro, "Nao consegui carregar a obra."));
    trocar(container, vazio("Não deu para carregar", "Recarregue a página em instantes."));
    return;
  }

  const obra = normalizarObra({ ...dados.lancamento, ref: parametros.id });
  const { comunidade, voce, persistido } = dados;

  document.title = `${obra.title} — Sonora`;

  trocar(
    container,
    persistido ? null : avisoSoNaFonte(),
    el(
      "div",
      { class: "obra-topo" },
      el("div", { class: "obra-capa" }, capa(obra.coverUrl, `Capa de ${obra.title}`)),
      el(
        "div",
        { class: "obra-info" },
        ficha(obra),
        acoesPessoais(obra, voce, recarregar),
        numerosDaComunidade(comunidade)
      )
    ),
    el(
      "div",
      { class: "obra-colunas" },
      el("div", {}, minhaParte(obra, voce, recarregar), minhasEscutas(obra, voce.escutas, recarregar)),
      reviewsDaComunidade(obra, dados.reviews, voce, recarregar)
    )
  );
}
