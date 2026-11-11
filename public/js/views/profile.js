// Perfil musical (§24). A identidade da pessoa na plataforma: quem ela e', o
// que ela ouviu, como avaliou e o que escreveu.
//
// Sete areas, carregadas sob demanda — e nao por acaso sao sete: escuta, nota e
// review sao coisas independentes (§27), entao "Historico", "Obras ouvidas",
// "Avaliacoes" e "Reviews" mostram recortes diferentes, nao a mesma lista com
// outro nome.

import { api, ErroApi } from "../api.js";
import { cartaoAvaliacao, cartaoEscuta, cartaoLista, cartaoReview, gradeObras, pilhaDeCartoes } from "../cards.js";
import { ir } from "../router.js";
import { usuarioAtual } from "../state.js";
import { notaTexto } from "../stars.js";
import {
  avatar,
  avisarErro,
  avisarOk,
  confirmar,
  dataCurta,
  el,
  esqueletoGrade,
  icone,
  plural,
  trocar,
  vazio,
} from "../ui.js";

const AREAS = [
  { chave: "historico", rotulo: "Histórico" },
  { chave: "ouvidas", rotulo: "Obras ouvidas" },
  { chave: "avaliacoes", rotulo: "Avaliações" },
  { chave: "reviews", rotulo: "Reviews" },
  { chave: "favoritos", rotulo: "Favoritos" },
  { chave: "quero-ouvir", rotulo: "Quero ouvir" },
  { chave: "listas", rotulo: "Listas" },
];

const erroTexto = (erro, reserva) => (erro instanceof ErroApi ? erro.message : reserva);

// ─── Cabecalho ──────────────────────────────────────────────────────────────

function numero(valor, rotulo) {
  return el(
    "div",
    { class: "numero" },
    el("b", { text: valor === null || valor === undefined ? "—" : String(valor) }),
    el("span", { text: rotulo })
  );
}

function cabecalho(dados) {
  const { perfil, numeros, contribuicoes, souEu } = dados;

  const identidade = el(
    "div",
    { class: "perfil-identidade" },
    avatar(perfil, "gg"),
    el(
      "div",
      {},
      el(
        "div",
        { class: "fileira fileira-selos" },
        el("h1", { text: perfil.displayName }),
        perfil.isAdmin ? el("span", { class: "selo coral", text: "admin" }) : null
      ),
      el("p", { class: "texto-faint", text: `@${perfil.username}` }),
      perfil.bio ? el("p", { class: "perfil-bio", text: perfil.bio }) : null,
      el(
        "div",
        { class: "fileira fileira-selos" },
        el("span", { class: "texto-faint" }, icone("calendario", 13), ` no Sonora desde ${dataCurta(perfil.createdAt)}`),
        // §19: so cadastro manual conta como contribuicao.
        contribuicoes.manuais > 0
          ? el("span", {
              class: "selo",
              text: `${plural(contribuicoes.manuais, "obra cadastrada", "obras cadastradas")} à mão`,
            })
          : null
      )
    ),
    souEu ? el("a", { class: "btn", href: "/ajustes" }, icone("ajustes", 15), "Editar perfil") : null
  );

  return el(
    "header",
    { class: "perfil-topo" },
    identidade,
    el(
      "div",
      { class: "perfil-numeros" },
      numero(numeros.obras_ouvidas, "obras ouvidas"),
      numero(numeros.total_escutas, "escutas"),
      numero(numeros.avaliacoes, "avaliações"),
      numero(numeros.reviews, "reviews"),
      numero(numeros.nota_media === null ? null : notaTexto(numeros.nota_media), "nota média")
    )
  );
}

// ─── Areas ──────────────────────────────────────────────────────────────────

const nomeProprio = (souEu, perfil) => (souEu ? "Você" : perfil.displayName);

function areaVazia(area, souEu, perfil) {
  const quem = nomeProprio(souEu, perfil);
  const textos = {
    historico: `${quem} ainda não registrou nenhuma escuta.`,
    ouvidas: `${quem} ainda não ouviu nada por aqui.`,
    avaliacoes: `${quem} ainda não deu nota a nenhuma obra.`,
    reviews: `${quem} ainda não escreveu nenhuma review.`,
    favoritos: `${quem} ainda não marcou favoritos.`,
    "quero-ouvir": `${quem} não tem nada guardado para ouvir depois.`,
    listas: `${quem} ainda não criou listas.`,
  };

  return vazio(
    "Nada aqui ainda",
    textos[area],
    souEu && area === "listas"
      ? el("a", { class: "btn primario", href: "/lista/nova", text: "Criar lista" })
      : souEu
        ? el("a", { class: "btn primario", href: "/pesquisa", text: "Pesquisar obras" })
        : null
  );
}

async function removerEscuta(escuta, recarregar) {
  const sim = await confirmar({
    titulo: "Remover esta escuta?",
    mensagem: `A escuta de ${dataCurta(escuta.listened_on)} sai do histórico. A nota e a review continuam.`,
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
}

/** Cada area tem uma forma propria: grade de obras, pilha ou cartoes de lista. */
function montarArea(area, itens, { souEu, perfil, recarregar }) {
  if (itens.length === 0) return areaVazia(area, souEu, perfil);

  switch (area) {
    case "historico":
      // §33: cada escuta aparece separada, em ordem cronologica.
      return pilhaDeCartoes(itens, (escuta) =>
        cartaoEscuta(escuta, { aoRemover: souEu ? (e) => removerEscuta(e, recarregar) : null })
      );

    case "ouvidas":
      // Obras distintas, com a contagem de escutas de cada uma.
      return gradeObras(itens, { aoMudar: recarregar });

    case "avaliacoes":
      return pilhaDeCartoes(itens, cartaoAvaliacao);

    case "reviews":
      return pilhaDeCartoes(itens, (review) => cartaoReview(review, { mostrarAutor: false }));

    case "favoritos":
    case "quero-ouvir":
      return gradeObras(itens, { aoMudar: recarregar });

    case "listas":
      return el("div", { class: "grade-listas" }, itens.map((lista) => cartaoLista(lista, { mostrarAutor: false })));

    default:
      return vazio("Área desconhecida", "");
  }
}

// ─── Tela ───────────────────────────────────────────────────────────────────

export async function telaPerfil(container, parametros, query) {
  const username = parametros.username;
  const pedida = query.get("area");
  const areaAtual = AREAS.some((a) => a.chave === pedida) ? pedida : "historico";

  const recarregar = () => telaPerfil(container, parametros, query);

  trocar(container, esqueletoGrade(4));

  let dados;
  try {
    dados = await api.perfil(username);
  } catch (erro) {
    if (erro instanceof ErroApi && erro.status === 404) {
      trocar(
        container,
        vazio("Perfil não encontrado", `Ninguém usa "@${username}" no Sonora.`)
      );
      return;
    }
    avisarErro(erroTexto(erro, "Nao consegui carregar o perfil."));
    trocar(container, vazio("Não deu para carregar", "Recarregue a página em instantes."));
    return;
  }

  document.title = `${dados.perfil.displayName} — Sonora`;
  const eu = usuarioAtual();
  const souEu = dados.souEu || dados.perfil.id === eu?.id;

  const conteudo = el("div", { class: "perfil-area" }, esqueletoGrade(6));

  const abas = el(
    "div",
    { class: "abas", role: "tablist", "aria-label": "Áreas do perfil" },
    AREAS.map((area) =>
      el("button", {
        class: "aba",
        type: "button",
        role: "tab",
        dataset: { area: area.chave },
        "aria-selected": String(area.chave === areaAtual),
        text: area.rotulo,
        onClick: () => ir(`/u/${encodeURIComponent(username)}?area=${area.chave}`),
      })
    )
  );

  trocar(container, cabecalho({ ...dados, souEu }), abas, conteudo);

  try {
    const resposta = await api.areaDoPerfil(username, areaAtual);
    trocar(
      conteudo,
      montarArea(areaAtual, resposta.itens || [], { souEu, perfil: dados.perfil, recarregar })
    );
  } catch (erro) {
    avisarErro(erroTexto(erro, "Nao consegui carregar esta area."));
    trocar(conteudo, vazio("Não deu para carregar esta área", "Tente de novo em instantes."));
  }
}
