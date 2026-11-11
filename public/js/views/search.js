// Pesquisa (§39). Esta e' a porta de entrada do catalogo: consulta o
// MusicBrainz, nao o banco local. Encontrar uma obra nao depende de alguem ja
// te-la cadastrado aqui.
//
// O banco entra apenas como complemento: marca o que ja esta no Sonora e
// mostra a nota da comunidade e as escutas (§39).
//
// Esta tela tambem e' a unica porta do cadastro manual (§16): o botao so
// aparece quando a fonte externa respondeu e nao encontrou. Se a fonte estiver
// fora do ar, o cadastro fica bloqueado de proposito, para uma queda temporaria
// nao gerar obras duplicadas.

import { api, ErroApi } from "../api.js";
import { cartaoResultado } from "../cards.js";
import { ir } from "../router.js";
import {
  avisarErro,
  el,
  esqueletoGrade,
  icone,
  plural,
  trocar,
  vazio,
} from "../ui.js";

const MINIMO = 2;

function barraDeBusca(termoAtual, artistaAtual) {
  const campo = el("input", {
    type: "search",
    id: "pesquisa-termo",
    value: termoAtual,
    placeholder: "Título do álbum, EP ou single",
    autocomplete: "off",
    minlength: String(MINIMO),
  });

  const campoArtista = el("input", {
    type: "search",
    id: "pesquisa-artista",
    value: artistaAtual,
    placeholder: "Artista (opcional)",
    autocomplete: "off",
  });

  const enviar = (evento) => {
    evento.preventDefault();
    const termo = campo.value.trim();
    if (termo.length < MINIMO) {
      avisarErro(`Escreva pelo menos ${MINIMO} letras.`);
      return;
    }
    const busca = new URLSearchParams({ q: termo });
    if (campoArtista.value.trim()) busca.set("artista", campoArtista.value.trim());
    ir(`/pesquisa?${busca.toString()}`);
  };

  const form = el(
    "form",
    { class: "pesquisa-form", role: "search", onSubmit: enviar },
    el(
      "div",
      { class: "campo" },
      el("label", { for: "pesquisa-termo", text: "O que você quer encontrar" }),
      campo
    ),
    el(
      "div",
      { class: "campo" },
      el("label", { for: "pesquisa-artista", text: "Artista" }),
      campoArtista
    ),
    el("button", { class: "btn primario", type: "submit" }, icone("busca", 15), "Pesquisar")
  );

  setTimeout(() => campo.focus(), 0);
  return form;
}

function cartaoArtista(artista) {
  return el(
    "a",
    { class: "card-artista-res", href: `/artista/${encodeURIComponent(artista.mbid)}` },
    el("span", { class: "card-artista-icone" }, icone("pessoas", 18)),
    el(
      "span",
      {},
      el("b", { text: artista.name }),
      artista.desambiguacao ? el("span", { class: "texto-faint", text: artista.desambiguacao }) : null
    )
  );
}

/** Fonte fora do ar: nao oferece cadastro manual (§16). */
function fonteIndisponivel(mensagem, aoTentarDeNovo) {
  return el(
    "div",
    { class: "faixa-aviso ruim" },
    icone("alerta", 18),
    el(
      "div",
      {},
      el("b", { text: "A fonte externa está temporariamente indisponível" }),
      el("span", {
        text: `${mensagem} O cadastro manual fica bloqueado nesse momento de propósito: liberá-lo durante uma queda criaria obras duplicadas. Tente de novo em instantes.`,
      })
    ),
    el("button", {
      class: "btn pequeno",
      type: "button",
      text: "Tentar de novo",
      onClick: aoTentarDeNovo,
    })
  );
}

/** A fonte respondeu e nao achou: aqui sim o cadastro manual e' liberado. */
function nadaEncontrado(termo, artista) {
  const destino = new URLSearchParams({ title: termo });
  if (artista) destino.set("artistName", artista);

  return vazio(
    `Nada encontrado para "${termo}"`,
    "A fonte externa respondeu e não tem essa obra. Como ela realmente não existe no catálogo oficial, você pode cadastrá-la à mão.",
    el(
      "a",
      { class: "btn primario", href: `/cadastro-manual?${destino.toString()}` },
      icone("mais", 15),
      "Cadastrar à mão"
    )
  );
}

export async function telaPesquisa(container, _parametros, query) {
  const termo = (query.get("q") || "").trim();
  const artista = (query.get("artista") || "").trim();
  const recarregar = () => telaPesquisa(container, _parametros, query);

  const cabecalho = el(
    "header",
    { class: "pesquisa-topo" },
    el("h1", { text: "Pesquisar" }),
    el("p", {
      class: "texto-muted",
      text: "A busca consulta o catálogo oficial de metadados musicais. Você não precisa de uma obra já salva aqui para encontrá-la.",
    }),
    barraDeBusca(termo, artista)
  );

  if (termo.length < MINIMO) {
    trocar(
      container,
      cabecalho,
      vazio(
        "Comece pelo título",
        "Escreva o nome de um álbum, EP ou single. Se quiser, restrinja pelo artista."
      )
    );
    return;
  }

  trocar(container, cabecalho, esqueletoGrade(8));

  // As duas consultas sao independentes: uma pode falhar sem derrubar a outra.
  const [lancamentos, artistas] = await Promise.all([
    api.pesquisar(termo, artista || undefined).catch((erro) => ({ falha: erro })),
    api.pesquisarArtistas(termo).catch(() => ({ artistas: [] })),
  ]);

  const falha = lancamentos.falha;

  // A distincao do §16 acontece aqui. 503 (ou rede caida) significa "a fonte
  // esta fora"; qualquer outro erro e' problema nosso, nao da fonte. Em nenhum
  // dos dois casos o cadastro manual e' liberado.
  if (falha && (falha.status === 503 || falha.status === 0)) {
    trocar(container, cabecalho, fonteIndisponivel(falha.dados?.erro || falha.message, recarregar));
    return;
  }
  if (falha) {
    avisarErro(falha instanceof ErroApi ? falha.message : "A pesquisa falhou.");
    trocar(container, cabecalho, vazio("A pesquisa falhou", "Revise o termo e tente de novo."));
    return;
  }

  const achados = lancamentos.resultados || [];
  const nomes = artistas.artistas || [];

  const blocoArtistas =
    nomes.length > 0
      ? el(
          "section",
          { class: "secao" },
          el("h2", { class: "secao-titulo", text: "Artistas" }),
          el("div", { class: "grade-artistas" }, nomes.slice(0, 8).map(cartaoArtista))
        )
      : null;

  const blocoObras =
    achados.length > 0
      ? el(
          "section",
          { class: "secao" },
          el(
            "div",
            { class: "secao-topo" },
            el("h2", { class: "secao-titulo", text: "Lançamentos" }),
            el("span", {
              class: "texto-faint",
              text: `${plural(achados.length, "resultado", "resultados")}`,
            })
          ),
          el("div", { class: "grade" }, achados.map((item) => cartaoResultado(item, { aoMudar: recarregar })))
        )
      : null;

  trocar(
    container,
    cabecalho,
    blocoArtistas,
    blocoObras,
    achados.length === 0 ? nadaEncontrado(termo, artista) : null
  );
}
