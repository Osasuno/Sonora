// Cadastro manual (§16, §17). Fallback, nao atalho.
//
// O formulario e' bloqueado por padrao. Para liberar, a fonte externa precisa
// responder e NAO encontrar a obra. Tres desfechos possiveis na verificacao:
//
//   encontrou          -> nao libera; aponta a obra que ja existe
//   respondeu e nao achou -> libera o formulario
//   esta fora do ar    -> nao libera; pede para tentar depois
//
// O terceiro caso e' o que importa de verdade: liberar cadastro durante uma
// queda temporaria encheria o catalogo de duplicatas (§16). A mesma verificacao
// e' refeita no servidor no momento de gravar — o navegador nao e' a autoridade.

import { api, ErroApi } from "../api.js";
import { ir } from "../router.js";
import {
  avisarErro,
  avisarOk,
  capa,
  el,
  icone,
  rotuloDoTipo,
  trocar,
} from "../ui.js";

const TIPOS = [
  { valor: "ALBUM", rotulo: "Álbum" },
  { valor: "EP", rotulo: "EP" },
  { valor: "SINGLE", rotulo: "Single" },
];

const erroTexto = (erro, reserva) => (erro instanceof ErroApi ? erro.message : reserva);

function campo(id, rotulo, entrada, dica) {
  return el(
    "div",
    { class: "campo" },
    el("label", { for: id, text: rotulo }),
    entrada,
    dica ? el("span", { class: "dica", text: dica }) : null
  );
}

// ─── Etapa 1: verificar na fonte externa ───────────────────────────────────

function etapaVerificacao({ title, artistName }, aoLiberar) {
  const campoTitulo = el("input", {
    type: "text",
    id: "manual-titulo",
    maxlength: "200",
    value: title,
    required: true,
  });
  const campoArtista = el("input", {
    type: "text",
    id: "manual-artista",
    maxlength: "200",
    value: artistName,
    required: true,
  });

  const resultado = el("div", {});
  const verificar = el(
    "button",
    { class: "btn primario", type: "submit" },
    icone("busca", 15),
    "Verificar na fonte externa"
  );

  async function executar(evento) {
    evento.preventDefault();
    const titulo = campoTitulo.value.trim();
    const artista = campoArtista.value.trim();

    if (!titulo || !artista) {
      avisarErro("Informe o título e o artista para verificar.");
      return;
    }

    verificar.disabled = true;
    trocar(resultado, el("div", { class: "vazio" }, el("span", { class: "carregando-inline" })));

    let resposta;
    try {
      resposta = await api.verificarManual(titulo, artista);
    } catch (erro) {
      // Fonte fora do ar (503) ou rede caida: nao libera (§16).
      const dados = erro instanceof ErroApi ? erro.dados || {} : {};
      trocar(
        resultado,
        el(
          "div",
          { class: "faixa-aviso ruim" },
          icone("alerta", 18),
          el(
            "div",
            {},
            el("b", { text: "A fonte externa está temporariamente indisponível" }),
            el("span", {
              text: `${dados.erro || erroTexto(erro, "")} Enquanto ela não responde, o cadastro manual fica bloqueado: liberá-lo agora criaria obras duplicadas. Tente de novo em instantes.`,
            })
          )
        )
      );
      verificar.disabled = false;
      return;
    }

    verificar.disabled = false;

    if (!resposta.liberado && resposta.correspondente) {
      // A fonte tem a obra: o caminho certo e' usar o resultado dela.
      const achada = resposta.correspondente;
      trocar(
        resultado,
        el(
          "div",
          { class: "painel" },
          el("div", { class: "painel-titulo", text: "Essa obra já existe na fonte externa" }),
          el(
            "div",
            { class: "fileira", style: "gap:14px;align-items:flex-start" },
            el(
              "div",
              { class: "modal-obra-capa" },
              capa(achada.coverUrl, `Capa de ${achada.title}`)
            ),
            el(
              "div",
              { class: "pilha", style: "gap:6px" },
              el("b", { text: achada.title }),
              el("span", { text: achada.artistName }),
              el("span", {
                class: "texto-faint",
                text: [rotuloDoTipo(achada.type), achada.releaseYear].filter(Boolean).join(" · "),
              }),
              el("p", {
                class: "texto-muted",
                text: "Use essa obra em vez de cadastrar à mão: os metadados vêm completos e a obra não fica duplicada.",
              }),
              el(
                "a",
                { class: "btn primario", href: `/obra/${encodeURIComponent(achada.ref)}` },
                "Abrir essa obra"
              )
            )
          )
        )
      );
      return;
    }

    if (!resposta.liberado) {
      trocar(
        resultado,
        el(
          "div",
          { class: "faixa-aviso ruim" },
          icone("alerta", 18),
          el("div", {}, el("span", { text: resposta.erro || "Cadastro manual não liberado agora." }))
        )
      );
      return;
    }

    avisarOk("A fonte respondeu e não tem essa obra. Cadastro liberado.");
    aoLiberar({ title: titulo, artistName: artista, consultados: resposta.consultados });
  }

  return el(
    "form",
    { class: "pilha", onSubmit: executar },
    campo("manual-titulo", "Título do lançamento", campoTitulo),
    campo("manual-artista", "Artista", campoArtista),
    el("div", { class: "fileira" }, verificar),
    resultado
  );
}

// ─── Etapa 2: o formulario, agora liberado ─────────────────────────────────

function etapaFormulario({ title, artistName, consultados }) {
  const campoTitulo = el("input", { type: "text", id: "obra-titulo", maxlength: "200", value: title });
  const campoArtista = el("input", { type: "text", id: "obra-artista", maxlength: "200", value: artistName });

  const campoTipo = el(
    "select",
    { id: "obra-tipo" },
    TIPOS.map((tipo) => el("option", { value: tipo.valor, text: tipo.rotulo }))
  );

  // §17: a data entra na precisao que se tem. Nao usamos <input type="date">
  // de proposito: ele exigiria um dia exato que muitas vezes nao se sabe.
  const campoData = el("input", {
    type: "text",
    id: "obra-data",
    maxlength: "10",
    placeholder: "2024, 2024-08 ou 2024-08-09",
    pattern: "\\d{4}(-\\d{2}(-\\d{2})?)?",
  });

  const campoCapa = el("input", {
    type: "url",
    id: "obra-capa",
    maxlength: "500",
    placeholder: "https://…",
  });

  const campoGeneros = el("input", {
    type: "text",
    id: "obra-generos",
    maxlength: "200",
    placeholder: "post-punk, lo-fi",
  });

  const salvar = el("button", { class: "btn primario", type: "submit" }, icone("mais", 15), "Cadastrar obra");

  async function enviar(evento) {
    evento.preventDefault();

    const corpo = {
      title: campoTitulo.value.trim(),
      artistName: campoArtista.value.trim(),
      type: campoTipo.value,
      releaseDate: campoData.value.trim(),
      coverUrl: campoCapa.value.trim(),
      genres: campoGeneros.value
        .split(",")
        .map((g) => g.trim())
        .filter(Boolean)
        .slice(0, 8),
    };

    if (!/^\d{4}(-\d{2}(-\d{2})?)?$/.test(corpo.releaseDate)) {
      avisarErro("A data precisa ser 2024, 2024-08 ou 2024-08-09.");
      campoData.focus();
      return;
    }

    salvar.disabled = true;
    try {
      const resposta = await api.cadastrarManual(corpo);
      avisarOk("Obra cadastrada.");
      ir(`/obra/${resposta.lancamento.id}`);
    } catch (erro) {
      avisarErro(erroTexto(erro, "Nao consegui cadastrar a obra."));
      salvar.disabled = false;
    }
  }

  return el(
    "form",
    { class: "pilha-g", onSubmit: enviar },
    el(
      "div",
      { class: "faixa-aviso bom" },
      icone("check", 18),
      el(
        "div",
        {},
        el("b", { text: "Cadastro liberado" }),
        el("span", {
          text: `A fonte externa respondeu${
            consultados ? ` (${consultados} resultados analisados)` : ""
          } e não tem essa obra. A obra que você cadastrar fica disponível para todo mundo, não só para você.`,
        })
      )
    ),
    el(
      "div",
      { class: "pilha" },
      campo("obra-titulo", "Título", campoTitulo),
      campo("obra-artista", "Artista", campoArtista),
      campo("obra-tipo", "Tipo", campoTipo),
      campo(
        "obra-data",
        "Data de lançamento",
        campoData,
        "Informe só o que você sabe: ano, ano-mês ou data completa. Não invente precisão."
      ),
      campo(
        "obra-capa",
        "Endereço da capa",
        campoCapa,
        "Uma URL de imagem válida. Upload de arquivo não faz parte desta versão."
      ),
      campo("obra-generos", "Gêneros", campoGeneros, "Separados por vírgula. Opcional.")
    ),
    el(
      "div",
      { class: "fileira fim" },
      el("a", { class: "btn fantasma", href: "/pesquisa", text: "Cancelar" }),
      salvar
    )
  );
}

// ─── Tela ───────────────────────────────────────────────────────────────────

export function telaCadastroManual(container, _parametros, query) {
  const inicial = {
    title: (query.get("title") || "").trim(),
    artistName: (query.get("artistName") || "").trim(),
  };

  const area = el("div", {});

  const cabecalho = el(
    "header",
    { class: "pilha", style: "margin-bottom:24px" },
    el("h1", { text: "Cadastrar obra à mão" }),
    el("p", {
      class: "texto-muted",
      style: "max-width:70ch",
      text: "Este caminho existe só para obras que o catálogo oficial de metadados não tem. Primeiro verificamos na fonte externa; o formulário só abre se ela responder e não encontrar a obra.",
    })
  );

  const mostrarVerificacao = () =>
    trocar(
      area,
      etapaVerificacao(inicial, (liberado) => trocar(area, etapaFormulario(liberado)))
    );

  mostrarVerificacao();
  trocar(container, cabecalho, el("div", { style: "max-width:680px" }, area));
}
