// Pecas reutilizaveis: cartao de obra, escuta, avaliacao, review e lista.
// Todas aceitam o formato cru da API — quem normaliza e' o actions.js.

import {
  abrirAvaliacao,
  linkArtista,
  linkObra,
  linkPerfil,
  normalizarObra,
  registrarEscuta,
} from "./actions.js";
import { estrelas, notaTexto } from "./stars.js";
import { usuarioAtual } from "./state.js";
import {
  avatar,
  botaoIcone,
  capa,
  dataCurta,
  dataRelativa,
  el,
  icone,
  plural,
  rotuloDoTipo,
  seloDeOrigem,
} from "./ui.js";

/**
 * Cartao de obra.
 *
 * Serve tanto para obra que ja esta no Sonora quanto para resultado de pesquisa
 * que so existe na fonte externa — nos dois casos o link abre a pagina, e abrir
 * nao persiste nada (§13). As acoes rapidas (ouvi / avaliar) persistem, porque
 * sao interacao.
 */
export function cartaoObra(bruto, opcoes = {}) {
  const obra = normalizarObra(bruto);
  const { posicao, rodapeExtra, semAcoes = false, aoMudar } = opcoes;

  const acoes = semAcoes
    ? null
    : el(
        "div",
        { class: "capa-acoes" },
        botaoIcone("check", `Registrar escuta de ${obra.title}`, async (evento) => {
          evento.preventDefault();
          if (await registrarEscuta(obra)) aoMudar?.();
        }),
        botaoIcone("estrela", `Avaliar ${obra.title}`, (evento) => {
          evento.preventDefault();
          abrirAvaliacao(obra, { nota: obra.minhaNota, aoConcluir: () => aoMudar?.() });
        })
      );

  // Prioridade no rodape: a nota de quem esta olhando diz mais que a media.
  const rodape =
    rodapeExtra ||
    (obra.minhaNota
      ? el("div", { class: "card-rodape" }, estrelas(obra.minhaNota), el("span", { text: "sua nota" }))
      : obra.notaMedia
        ? el(
            "div",
            { class: "card-rodape" },
            estrelas(obra.notaMedia),
            el("span", { text: notaTexto(obra.notaMedia) })
          )
        : obra.escutas > 0
          ? el(
              "div",
              { class: "card-rodape" },
              icone("relogio", 13),
              el("span", { text: plural(obra.escutas, "escuta", "escutas") })
            )
          : null);

  const hrefArtista = linkArtista(obra);

  return el(
    "article",
    { class: "card-obra" },
    el(
      "a",
      {
        href: linkObra(obra),
        class: "capa-wrap",
        "aria-label": `${obra.title}, ${rotuloDoTipo(obra.type)} de ${obra.artistName}`,
      },
      capa(obra.coverUrl, `Capa de ${obra.title}`),
      posicao ? el("span", { class: "medalha-posicao", text: `#${posicao}` }) : null,
      el("span", {
        class: `marca-tipo tipo-${String(obra.type || "").toLowerCase()}`,
        text: rotuloDoTipo(obra.type),
      }),
      // §46: a origem aparece ja no cartao, sem link para fora.
      obra.origin === "MANUAL" ? el("span", { class: "marca-manual", text: "manual" }) : null
    ),
    acoes,
    el(
      "div",
      { class: "card-meta" },
      el("a", { href: linkObra(obra), class: "card-titulo", text: obra.title }),
      hrefArtista
        ? el("a", { href: hrefArtista, class: "card-artista", text: obra.artistName })
        : el("span", { class: "card-artista", text: obra.artistName }),
      obra.releaseYear ? el("span", { class: "card-ano", text: String(obra.releaseYear) }) : null,
      rodape
    )
  );
}

export function gradeObras(itens, opcoes = {}) {
  return el(
    "div",
    { class: `grade ${opcoes.compacta ? "compacta" : ""}`.trim() },
    itens.map((item, indice) =>
      cartaoObra(item, { ...opcoes, posicao: opcoes.numerada ? indice + 1 : undefined })
    )
  );
}

// ─── Linha de obra com a obra a esquerda e algo a direita ───────────────────

/** Base das listagens de escuta, avaliacao e review. */
function linhaDeObra(bruto, { cabeca, corpo, acoes }) {
  const obra = normalizarObra(bruto);

  return el(
    "article",
    { class: "card-entrada" },
    el(
      "a",
      { href: linkObra(obra), class: "entrada-capa", "aria-label": obra.title },
      capa(obra.coverUrl, `Capa de ${obra.title}`)
    ),
    el(
      "div",
      { class: "entrada-corpo" },
      cabeca || null,
      el(
        "a",
        { class: "entrada-obra", href: linkObra(obra) },
        obra.title,
        el("span", { text: ` · ${obra.artistName}` })
      ),
      corpo || null,
      acoes ? el("div", { class: "entrada-acoes" }, acoes) : null
    )
  );
}

/** Uma escuta do historico (§33). Escuta nao tem nota nem texto. */
export function cartaoEscuta(escuta, { aoRemover } = {}) {
  const eu = usuarioAtual();
  const minha = eu?.id === escuta.user_id;

  const remover =
    minha && aoRemover
      ? botaoIcone("lixeira", "Remover esta escuta", () => aoRemover(escuta), { tamanho: 16 })
      : null;

  return linhaDeObra(
    { ...escuta, id: escuta.release_id },
    {
      cabeca: el(
        "div",
        { class: "entrada-cabeca" },
        icone("relogio", 14),
        el("span", { class: "selo", text: "ouviu" }),
        el("span", { class: "texto-faint", text: dataCurta(escuta.listened_on) })
      ),
      acoes: remover,
    }
  );
}

/** Uma avaliacao do perfil (§24). */
export function cartaoAvaliacao(nota) {
  return linhaDeObra(
    { ...nota, id: nota.release_id },
    {
      cabeca: el(
        "div",
        { class: "entrada-cabeca" },
        estrelas(nota.rating),
        el("span", { class: "texto-faint", text: `há ${dataRelativa(nota.updated_at)}` })
      ),
    }
  );
}

/**
 * Uma review. A nota aparece ao lado quando existe, mas sao registros
 * independentes: pode haver review sem nota e nota sem review (§27).
 */
export function cartaoReview(review, { mostrarAutor = true, aoEditar, aoRemover } = {}) {
  const eu = usuarioAtual();
  const minha = eu?.id === review.user_id;

  const texto = el("div", { class: "entrada-resenha", text: review.review });
  texto.addEventListener("click", () => texto.classList.toggle("aberta"));

  const acoes = [];
  if (minha && aoEditar) {
    acoes.push(botaoIcone("lapis", "Editar a sua review", () => aoEditar(review), { tamanho: 16 }));
  }
  if (minha && aoRemover) {
    acoes.push(botaoIcone("lixeira", "Excluir a sua review", () => aoRemover(review), { tamanho: 16 }));
  }

  return linhaDeObra(
    { ...review, id: review.release_id },
    {
      cabeca: el(
        "div",
        { class: "entrada-cabeca" },
        mostrarAutor
          ? [
              avatar({ displayName: review.display_name }),
              el("a", {
                class: "entrada-autor",
                href: linkPerfil(review.username),
                text: review.display_name,
              }),
            ]
          : null,
        review.rating ? estrelas(review.rating) : el("span", { class: "selo", text: "sem nota" }),
        el("span", { class: "texto-faint", text: `há ${dataRelativa(review.created_at)}` })
      ),
      corpo: texto,
      acoes: acoes.length > 0 ? acoes : null,
    }
  );
}

export const pilhaDeCartoes = (itens, construir) =>
  el("div", { class: "lista-registros" }, itens.map(construir));

// ─── Cartao de lista ───────────────────────────────────────────────────────

export function cartaoLista(lista, { mostrarAutor = true } = {}) {
  const capas = (lista.capas || []).filter(Boolean).slice(0, 4);

  return el(
    "a",
    { class: "card-lista", href: `/lista/${lista.id}` },
    el(
      "div",
      { class: "card-lista-capas" },
      capas.length > 0
        ? capas.map((url) => el("img", { src: url, alt: "", loading: "lazy" }))
        : el("div", { class: "capa-vazia" }, icone("listas", 24))
    ),
    el(
      "div",
      { class: "card-lista-corpo" },
      el(
        "div",
        { class: "fileira fileira-selos" },
        el("h3", { text: lista.title }),
        // §35: privada so aparece para o dono (e na moderacao), mas quando
        // aparece, precisa ficar claro que e' privada.
        lista.visibility === "PRIVATE"
          ? el("span", { class: "selo", text: "privada" })
          : null
      ),
      el(
        "div",
        { class: "card-lista-meta" },
        mostrarAutor ? avatar(lista.autor) : null,
        mostrarAutor ? el("span", { text: lista.autor?.displayName || "" }) : null,
        mostrarAutor ? el("span", { text: "·" }) : null,
        el("span", { text: plural(lista.totalItens, "obra", "obras") })
      )
    )
  );
}

/**
 * Resultado de pesquisa na fonte externa (§39).
 *
 * Nao existe botao de "importar": o fluxo oficial e' abrir a obra e interagir —
 * a persistencia acontece sozinha nesse momento (§13, §15). Por isso o cartao
 * leva direto para a pagina da obra.
 */
export function cartaoResultado(resultado, opcoes = {}) {
  const obra = normalizarObra(resultado);

  const marca = obra.noSonora
    ? el("span", { class: "selo verde", text: "no Sonora" })
    : el("span", { class: "selo", text: "só na fonte externa" });

  return cartaoObra(resultado, {
    ...opcoes,
    rodapeExtra: el(
      "div",
      { class: "card-rodape" },
      marca,
      obra.notaMedia ? estrelas(obra.notaMedia) : null,
      obra.escutas > 0 ? el("span", { text: plural(obra.escutas, "escuta", "escutas") }) : null
    ),
  });
}
