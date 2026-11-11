// Blocos basicos da interface: criacao de elementos, icones, formatacao,
// avisos e modais. Tudo aqui e' generico e nao conhece regra de negocio.

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Cria um elemento. `props.class`, `props.text`, `props.html` (evitado),
 * atributos comuns e `on<Evento>` para ouvintes.
 */
export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;

    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style") node.setAttribute("style", value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }

  anexar(node, children);
  return node;
}

function anexar(node, children) {
  for (const child of children.flat(4)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/** Substitui todo o conteudo de um elemento. */
export function trocar(alvo, ...children) {
  alvo.replaceChildren();
  anexar(alvo, children);
  return alvo;
}

// ─── Icones ────────────────────────────────────────────────────────────────

const ICONES = {
  busca: [["circle", { cx: 11, cy: 11, r: 7 }], ["path", { d: "M16.5 16.5 21 21" }]],
  play: [["path", { d: "M7 4.5v15l13-7.5z", fill: "currentColor", stroke: "none" }]],
  pause: [
    ["path", { d: "M8 4.5h3.2v15H8z", fill: "currentColor", stroke: "none" }],
    ["path", { d: "M12.8 4.5H16v15h-3.2z", fill: "currentColor", stroke: "none" }],
  ],
  proxima: [
    ["path", { d: "M6 5v14l9-7z", fill: "currentColor", stroke: "none" }],
    ["path", { d: "M18 5v14" }],
  ],
  anterior: [
    ["path", { d: "M18 5v14l-9-7z", fill: "currentColor", stroke: "none" }],
    ["path", { d: "M6 5v14" }],
  ],
  estrela: [
    [
      "path",
      {
        d: "M12 2.6l2.95 6.02 6.65.95-4.8 4.66 1.13 6.6L12 17.72 6.07 20.83l1.13-6.6L2.4 9.57l6.65-.95z",
        fill: "currentColor",
        stroke: "none",
      },
    ],
  ],
  coracao: [
    [
      "path",
      {
        d: "M20.5 5.9a5 5 0 0 0-7.1 0L12 7.3l-1.4-1.4a5 5 0 1 0-7.1 7.1l8.5 8.5 8.5-8.5a5 5 0 0 0 0-7.1z",
      },
    ],
  ],
  mais: [["path", { d: "M12 5v14M5 12h14" }]],
  check: [["path", { d: "M20 6 9 17l-5-5" }]],
  fechar: [["path", { d: "M18 6 6 18M6 6l12 12" }]],
  lixeira: [
    ["path", { d: "M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15" }],
  ],
  lapis: [["path", { d: "M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z" }]],
  listas: [["path", { d: "M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" }]],
  casa: [["path", { d: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z" }]],
  pessoas: [
    ["circle", { cx: 9, cy: 8, r: 3.2 }],
    ["path", { d: "M2.5 20a6.5 6.5 0 0 1 13 0M17 11.2a3 3 0 0 0 0-6M18 20h3.5a5.5 5.5 0 0 0-3.2-5" }],
  ],
  ajustes: [
    ["path", { d: "M4 7h11M19 7h1M4 17h5M13 17h7" }],
    ["circle", { cx: 17, cy: 7, r: 2.2 }],
    ["circle", { cx: 11, cy: 17, r: 2.2 }],
  ],
  sair: [["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" }]],
  seta_baixo: [["path", { d: "M6 9l6 6 6-6" }]],
  seta_cima: [["path", { d: "M6 15l6-6 6 6" }]],
  seta_esq: [["path", { d: "M19 12H5M11 18l-6-6 6-6" }]],
  olho: [
    ["path", { d: "M2.2 12S6 5.5 12 5.5 21.8 12 21.8 12 18 18.5 12 18.5 2.2 12 2.2 12z" }],
    ["circle", { cx: 12, cy: 12, r: 3 }],
  ],
  volume: [
    ["path", { d: "M4 9.5h3.2L12 5.5v13L7.2 14.5H4z" }],
    ["path", { d: "M16 9a4.5 4.5 0 0 1 0 6M18.8 6.5a8 8 0 0 1 0 11" }],
  ],
  disco: [["circle", { cx: 12, cy: 12, r: 9 }], ["circle", { cx: 12, cy: 12, r: 2.6 }]],
  calendario: [
    ["rect", { x: 3, y: 5, width: 18, height: 16, rx: 2.5 }],
    ["path", { d: "M3 10h18M8 3v4M16 3v4" }],
  ],
  reouvir: [["path", { d: "M3 11a8 8 0 0 1 13.6-5.7L21 9M21 5v4h-4M21 13a8 8 0 0 1-13.6 5.7L3 15M3 19v-4h4" }]],
  externo: [["path", { d: "M14 4h6v6M20 4l-8.5 8.5M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" }]],
  marcador: [["path", { d: "M19 21l-7-5-7 5V5.5A2.5 2.5 0 0 1 7.5 3h9A2.5 2.5 0 0 1 19 5.5z" }]],
  relogio: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M12 7.2V12l3.4 2" }]],
  alerta: [["path", { d: "M12 3.5 21.5 20H2.5zM12 10v4.5M12 17.2h.01" }]],
  info: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M12 11v5.5M12 7.8h.01" }]],
  importar: [["path", { d: "M12 3v12M7.5 10.5 12 15l4.5-4.5M4 19h16" }]],
  chave: [
    ["circle", { cx: 8, cy: 15, r: 4 }],
    ["path", { d: "M10.8 12.2 20 3M17 6l2.5 2.5M14.5 8.5 17 11" }],
  ],
};

/** Devolve um <svg> do conjunto de icones. */
export function icone(nome, tamanho = 18) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(tamanho));
  svg.setAttribute("height", String(tamanho));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.7");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");

  for (const [tag, attrs] of ICONES[nome] || ICONES.disco) {
    const shape = document.createElementNS(SVG_NS, tag);
    for (const [key, value] of Object.entries(attrs)) shape.setAttribute(key, String(value));
    svg.append(shape);
  }
  return svg;
}

/** Botao so de icone, sempre com rotulo acessivel. */
export function botaoIcone(nome, rotulo, onClick, extras = {}) {
  return el(
    "button",
    {
      class: `icone-btn ${extras.class || ""}`.trim(),
      type: "button",
      "aria-label": rotulo,
      title: rotulo,
      onClick,
      ...(extras.pressed === undefined ? {} : { "aria-pressed": String(extras.pressed) }),
    },
    icone(nome, extras.tamanho || 18)
  );
}

// ─── Formatacao ────────────────────────────────────────────────────────────

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function duracao(segundos) {
  if (!segundos && segundos !== 0) return "--:--";
  const total = Math.round(segundos);
  const min = Math.floor(total / 60);
  const seg = total % 60;
  return `${min}:${String(seg).padStart(2, "0")}`;
}

export function duracaoLonga(segundos) {
  if (!segundos) return "";
  const min = Math.round(segundos / 60);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)} h ${min % 60} min`;
}

const SO_DATA = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Converte para Date respeitando o fuso.
 * "2026-09-01" sozinho seria lido como meia-noite UTC e, no Brasil, viraria
 * 31 de agosto. Datas sem hora sao montadas como meia-noite local.
 */
function paraData(valor) {
  if (valor instanceof Date) return valor;
  if (typeof valor === "string" && SO_DATA.test(valor)) {
    const [ano, mes, dia] = valor.split("-").map(Number);
    return new Date(ano, mes - 1, dia);
  }
  return new Date(valor);
}

export function dataCurta(valor) {
  if (!valor) return "";
  const data = paraData(valor);
  if (Number.isNaN(data.getTime())) return "";
  return `${data.getDate()} ${MESES[data.getMonth()]} ${data.getFullYear()}`;
}

/**
 * Data de lancamento na precisao que se tem (§17).
 *
 * "1997" vira "1997", "1997-05" vira "mai 1997" e "1997-05-21" vira
 * "21 mai 1997". Mostrar "1 de janeiro de 1997" para uma obra que so informa o
 * ano seria inventar precisao que a fonte nao deu.
 */
export function dataDeLancamento(texto, anoReserva) {
  const bruto = String(texto || "").trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(bruto)) return dataCurta(bruto);
  if (/^\d{4}-\d{2}$/.test(bruto)) {
    const [ano, mes] = bruto.split("-").map(Number);
    return `${MESES[mes - 1]} ${ano}`;
  }
  if (/^\d{4}$/.test(bruto)) return bruto;
  return anoReserva ? String(anoReserva) : "";
}

export function ano(valor) {
  if (!valor) return "";
  const data = paraData(valor);
  return Number.isNaN(data.getTime()) ? "" : String(data.getFullYear());
}

const UNIDADES = [
  [60, "agora"],
  [3600, "min"],
  [86400, "h"],
  [604800, "d"],
];

export function dataRelativa(valor) {
  if (!valor) return "";
  const segundos = Math.max(0, (Date.now() - paraData(valor).getTime()) / 1000);

  if (segundos < UNIDADES[0][0]) return "agora";
  if (segundos < UNIDADES[1][0]) return `${Math.floor(segundos / 60)} min`;
  if (segundos < UNIDADES[2][0]) return `${Math.floor(segundos / 3600)} h`;
  if (segundos < UNIDADES[3][0]) return `${Math.floor(segundos / 86400)} d`;
  return dataCurta(valor);
}

export function iniciais(nome) {
  const partes = String(nome || "?").trim().split(/\s+/);
  const primeira = partes[0]?.[0] || "?";
  const segunda = partes.length > 1 ? partes[partes.length - 1][0] : "";
  return (primeira + segunda).toUpperCase();
}

export function plural(quantidade, singular, pluralForma) {
  return `${quantidade} ${quantidade === 1 ? singular : pluralForma}`;
}

/** Avatar circular com as iniciais da pessoa. */
export function avatar(pessoa, tamanho = "") {
  return el("span", {
    class: `avatar ${tamanho}`.trim(),
    text: iniciais(pessoa?.displayName || pessoa?.display_name || pessoa?.username),
    "aria-hidden": "true",
  });
}

// Tipos de lancamento suportados (secao 12 do escopo).
const TIPOS = {
  ALBUM: { curto: "Álbum", artigo: "o álbum" },
  EP: { curto: "EP", artigo: "o EP" },
  SINGLE: { curto: "Single", artigo: "o single" },
};

export const rotuloDoTipo = (tipo) => TIPOS[tipo]?.curto || tipo || "Lançamento";
export const tipoComArtigo = (tipo) => TIPOS[tipo]?.artigo || "o lançamento";

/** Selo de tipo, usado em cartoes e na pagina da obra. */
export const seloDoTipo = (tipo) =>
  el("span", { class: `selo tipo-${String(tipo || "").toLowerCase()}`, text: rotuloDoTipo(tipo) });

// Origem da obra (§46). Dois valores, so: veio da API ou foi cadastrada a mao.
const ORIGENS = {
  API: { rotulo: "MusicBrainz", classe: "origem-api" },
  MANUAL: { rotulo: "Cadastro manual", classe: "origem-manual" },
};

export const rotuloDaOrigem = (origem) => ORIGENS[origem]?.rotulo || "Origem desconhecida";

/**
 * Selo de origem. E' um <span>, nunca um link: a especificacao proibe
 * explicitamente apontar para fora, para a MusicBrainz (§46, §64).
 */
export function seloDeOrigem(origem, { curto = false } = {}) {
  const info = ORIGENS[origem];
  if (!info) return null;
  return el("span", {
    class: `selo origem ${info.classe}`,
    text: curto ? info.rotulo : `Origem: ${info.rotulo}`,
    title: `Origem: ${info.rotulo}`,
  });
}

/**
 * Valida uma URL vinda de fora antes de usa-la em CSS (background-image).
 * Sem isso, um endereco com aspas poderia injetar propriedades no estilo.
 */
export function urlSegura(url) {
  if (typeof url !== "string" || /["'()\\]/.test(url)) return null;
  try {
    const analisada = new URL(url, window.location.origin);
    return analisada.protocol === "https:" || analisada.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

const capaVazia = (alt) =>
  el("div", { class: "capa-vazia", role: "img", "aria-label": alt || "sem capa" }, icone("disco", 26));

/**
 * Imagem de capa com reserva visual.
 *
 * O `onError` nao e' zelo excessivo: o Cover Art Archive redireciona para o
 * Internet Archive, que as vezes devolve 500 num arquivo especifico. Sem isso a
 * grade ficaria com imagem quebrada em vez do lugar da capa (RNF17).
 */
export function capa(url, alt) {
  if (!url) return capaVazia(alt);

  return el("img", {
    src: url,
    alt: alt || "",
    loading: "lazy",
    decoding: "async",
    onError: (evento) => evento.target.replaceWith(capaVazia(alt)),
  });
}

// ─── Avisos ────────────────────────────────────────────────────────────────

const areaAvisos = () => document.getElementById("avisos");

export function avisar(mensagem, tipo = "") {
  const area = areaAvisos();
  if (!area) return;

  const nota = el("div", { class: `aviso ${tipo}`.trim() }, mensagem);
  area.append(nota);
  setTimeout(() => nota.remove(), 4200);
}

export const avisarErro = (mensagem) => avisar(mensagem, "erro");
export const avisarOk = (mensagem) => avisar(mensagem, "ok");

// ─── Modal ─────────────────────────────────────────────────────────────────

const FOCAVEIS = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Abre um modal acessivel: fecha no Esc e no clique fora, devolve o foco para
 * onde estava e prende o Tab dentro da caixa.
 */
export function abrirModal({ titulo, corpo, rodape, largo = false, aoFechar }) {
  const anfitriao = document.getElementById("modais");
  const focoAnterior = document.activeElement;

  const caixa = el(
    "div",
    { class: `modal ${largo ? "largo" : ""}`.trim(), role: "dialog", "aria-modal": "true", "aria-label": titulo },
    el(
      "div",
      { class: "modal-topo" },
      el("h2", { text: titulo }),
      botaoIcone("fechar", "Fechar", () => fechar())
    ),
    el("div", { class: "modal-corpo" }, corpo),
    rodape ? el("div", { class: "modal-rodape" }, rodape) : null
  );

  const veu = el("div", {
    class: "veu",
    onClick: (evento) => {
      if (evento.target === veu) fechar();
    },
  }, caixa);

  function aoTeclar(evento) {
    if (evento.key === "Escape") {
      evento.preventDefault();
      fechar();
      return;
    }
    if (evento.key !== "Tab") return;

    const focaveis = [...caixa.querySelectorAll(FOCAVEIS)].filter((n) => !n.disabled);
    if (focaveis.length === 0) return;

    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    if (evento.shiftKey && document.activeElement === primeiro) {
      evento.preventDefault();
      ultimo.focus();
    } else if (!evento.shiftKey && document.activeElement === ultimo) {
      evento.preventDefault();
      primeiro.focus();
    }
  }

  let aberto = true;
  function fechar() {
    if (!aberto) return;
    aberto = false;
    document.removeEventListener("keydown", aoTeclar);
    veu.remove();
    if (focoAnterior instanceof HTMLElement) focoAnterior.focus();
    if (typeof aoFechar === "function") aoFechar();
  }

  anfitriao.append(veu);
  document.addEventListener("keydown", aoTeclar);
  caixa.querySelector(FOCAVEIS)?.focus();

  return { fechar, caixa };
}

/**
 * Confirmacao de duas saidas. Usada antes de apagar algo e tambem na pergunta
 * do Quero ouvir, onde as duas opcoes sao legitimas (Remover / Manter) — por
 * isso o texto do botao de recusa e' configuravel.
 */
export function confirmar({
  titulo,
  mensagem,
  textoConfirmar = "Confirmar",
  textoCancelar = "Cancelar",
  perigo = true,
}) {
  return new Promise((resolve) => {
    let decidido = false;
    const decidir = (valor) => {
      decidido = true;
      modal.fechar();
      resolve(valor);
    };

    const modal = abrirModal({
      titulo,
      corpo: el("p", { class: "texto-muted", text: mensagem }),
      rodape: [
        el("button", { class: "btn fantasma", type: "button", text: textoCancelar, onClick: () => decidir(false) }),
        el("button", {
          class: `btn ${perigo ? "perigo" : "primario"}`,
          type: "button",
          text: textoConfirmar,
          onClick: () => decidir(true),
        }),
      ],
      aoFechar: () => {
        if (!decidido) resolve(false);
      },
    });
  });
}

// ─── Estados de tela ───────────────────────────────────────────────────────

export function vazio(titulo, descricao, acao) {
  return el(
    "div",
    { class: "vazio" },
    icone("disco", 30),
    el("b", { text: titulo }),
    descricao ? el("p", { text: descricao }) : null,
    acao || null
  );
}

export function esqueletoGrade(quantidade = 12) {
  const cartoes = Array.from({ length: quantidade }, () =>
    el(
      "div",
      {},
      el("div", { class: "esqueleto capa" }),
      el("div", { class: "esqueleto linha" }),
      el("div", { class: "esqueleto linha curta" })
    )
  );
  return el("div", { class: "grade" }, cartoes);
}

export function secao(titulo, conteudo, acao) {
  return el(
    "section",
    { class: "secao" },
    el(
      "div",
      { class: "secao-topo" },
      el("h2", { class: "secao-titulo", text: titulo }),
      acao || null
    ),
    conteudo
  );
}

export function aviso(titulo, mensagem) {
  return el(
    "div",
    { class: "faixa-aviso" },
    icone("alerta", 18),
    el("div", {}, el("b", { text: titulo }), el("span", { text: mensagem }))
  );
}
