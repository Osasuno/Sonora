// Catalogo do Sonora: explorar o que ja esta aqui, com os filtros do §40.
//
// Importante nao confundir esta tela com a pesquisa (§39). A pesquisa consulta o
// MusicBrainz e encontra qualquer obra; esta tela percorre o que a comunidade
// trouxe para dentro do Sonora, porque e' sobre esse recorte que existem notas,
// escutas e reviews para filtrar e ordenar.
//
// Os filtros vivem na URL, entao a tela e' compartilhavel e o botao voltar funciona.

import { api, ErroApi } from "../api.js";
import { gradeObras } from "../cards.js";
import { ir } from "../router.js";
import { notaTexto } from "../stars.js";
import {
  avisarErro,
  el,
  esqueletoGrade,
  icone,
  plural,
  rotuloDoTipo,
  trocar,
  vazio,
} from "../ui.js";

const TIPOS = ["ALBUM", "EP", "SINGLE"];

/**
 * Ordenacoes oficiais (§40). Os dois primeiros itens sao os dois "mais
 * recentes" do §43 e NAO sao a mesma coisa: um olha a data de lancamento da
 * obra, o outro a data em que ela entrou no Sonora.
 */
const ORDENS = [
  { valor: "adicionados", rotulo: "Recém-adicionados ao Sonora" },
  { valor: "lancamento", rotulo: "Lançamentos mais recentes" },
  { valor: "popularidade", rotulo: "Popularidade (escutas)" },
  { valor: "nota_comunidade", rotulo: "Média da comunidade" },
  { valor: "minha_nota", rotulo: "Minha avaliação" },
  { valor: "alfabetica", rotulo: "Título (A–Z)" },
];

// Escala oficial (§29), usada nos dois filtros de avaliacao (§41).
const NOTAS = [0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

const CHAVES = [
  "tipo",
  "artistId",
  "genero",
  "anoDe",
  "anoAte",
  "notaComunidadeMin",
  "minhaNotaMin",
  "ordem",
  "pagina",
];

function lerFiltros(query) {
  const ordem = query.get("ordem");
  return {
    tipo: TIPOS.includes(query.get("tipo")) ? query.get("tipo") : "",
    artistId: query.get("artistId") || "",
    genero: query.get("genero") || "",
    anoDe: query.get("anoDe") || "",
    anoAte: query.get("anoAte") || "",
    notaComunidadeMin: query.get("notaComunidadeMin") || "",
    minhaNotaMin: query.get("minhaNotaMin") || "",
    ordem: ORDENS.some((o) => o.valor === ordem) ? ordem : "adicionados",
    pagina: Math.max(1, Number.parseInt(query.get("pagina") || "1", 10) || 1),
  };
}

const temAlgumFiltro = (filtros) =>
  Boolean(
    filtros.tipo ||
      filtros.artistId ||
      filtros.genero ||
      filtros.anoDe ||
      filtros.anoAte ||
      filtros.notaComunidadeMin ||
      filtros.minhaNotaMin
  );

/** Reescreve a URL com os filtros e deixa o roteador redesenhar. */
function aplicar(filtros, mudancas) {
  const proximo = { ...filtros, ...mudancas };
  // Qualquer mudanca de filtro volta para a primeira pagina.
  if (!("pagina" in mudancas)) proximo.pagina = 1;

  const busca = new URLSearchParams();
  for (const chave of CHAVES) {
    const valor = proximo[chave];
    if (!valor) continue;
    if (chave === "ordem" && valor === "adicionados") continue;
    if (chave === "pagina" && valor === 1) continue;
    busca.set(chave, String(valor));
  }
  const texto = busca.toString();
  ir(texto ? `/?${texto}` : "/");
}

function chipsDeTipo(filtros, contagem) {
  const total = contagem.reduce((soma, item) => soma + item.total, 0);
  const opcoes = [{ valor: "", rotulo: "Tudo", total }];

  for (const tipo of TIPOS) {
    const achado = contagem.find((c) => c.type === tipo);
    if (achado) opcoes.push({ valor: tipo, rotulo: rotuloDoTipo(tipo), total: achado.total });
  }

  return el(
    "div",
    { class: "chips", role: "group", "aria-label": "Filtrar por tipo de lancamento" },
    opcoes.map((opcao) =>
      el("button", {
        class: "chip",
        type: "button",
        "aria-pressed": String(filtros.tipo === opcao.valor),
        text: `${opcao.rotulo} (${opcao.total})`,
        onClick: () => aplicar(filtros, { tipo: opcao.valor }),
      })
    )
  );
}

/**
 * `largo` ocupa mais espaco no desktop e a linha inteira no celular;
 * `inteiroNoCelular` so ocupa a linha inteira no celular.
 */
function seletor({ id, rotulo, valor, opcoes, aoMudar, largo = false, inteiroNoCelular = false }) {
  const select = el(
    "select",
    { id, onChange: (evento) => aoMudar(evento.target.value) },
    opcoes.map((opcao) => el("option", { value: opcao.valor, text: opcao.rotulo }))
  );
  select.value = valor;

  const classes = ["campo", "compacto", largo && "largo", inteiroNoCelular && "inteiro-no-celular"];
  return el(
    "div",
    { class: classes.filter(Boolean).join(" ") },
    el("label", { for: id, text: rotulo }),
    select
  );
}

function campoAno({ id, rotulo, valor, limites, extremo, aoMudar }) {
  const entrada = el("input", {
    type: "number",
    // No celular abre o teclado so de digitos.
    inputmode: "numeric",
    id,
    value: valor,
    min: limites.menor || 1860,
    max: limites.maior || 2200,
    // O placeholder mostra o extremo real do catalogo daquele lado do intervalo.
    placeholder: String((extremo === "maior" ? limites.maior : limites.menor) || ""),
    onChange: (evento) => aoMudar(evento.target.value),
  });
  return el("div", { class: "campo compacto estreito" }, el("label", { for: id, text: rotulo }), entrada);
}

const opcoesDeNota = (textoVazio) => [
  { valor: "", rotulo: textoVazio },
  ...NOTAS.map((nota) => ({ valor: String(nota), rotulo: `${notaTexto(nota)} ou mais` })),
];

function painelDeFiltros(filtros, facetas) {
  const generos = [
    { valor: "", rotulo: "Todos os gêneros" },
    ...facetas.generos.map((g) => ({ valor: g.genero, rotulo: `${g.genero} (${g.total})` })),
  ];

  const artistas = [
    { valor: "", rotulo: "Todos os artistas" },
    ...facetas.artistas.map((a) => ({
      valor: String(a.id),
      rotulo: `${a.name} (${a.total_lancamentos})`,
    })),
  ];

  return el(
    "div",
    { class: "filtros", id: "painel-filtros" },
    seletor({
      id: "filtro-artista",
      rotulo: "Artista",
      valor: filtros.artistId,
      opcoes: artistas,
      largo: true,
      aoMudar: (valor) => aplicar(filtros, { artistId: valor }),
    }),
    seletor({
      id: "filtro-genero",
      rotulo: "Gênero",
      valor: filtros.genero,
      opcoes: generos,
      inteiroNoCelular: true,
      aoMudar: (valor) => aplicar(filtros, { genero: valor }),
    }),
    campoAno({
      id: "filtro-ano-de",
      rotulo: "De",
      valor: filtros.anoDe,
      limites: facetas.anos,
      extremo: "menor",
      aoMudar: (valor) => aplicar(filtros, { anoDe: valor }),
    }),
    campoAno({
      id: "filtro-ano-ate",
      rotulo: "Até",
      valor: filtros.anoAte,
      limites: facetas.anos,
      extremo: "maior",
      aoMudar: (valor) => aplicar(filtros, { anoAte: valor }),
    }),
    // §41: as duas perspectivas de avaliacao, lado a lado e sem se confundirem.
    seletor({
      id: "filtro-nota-comunidade",
      rotulo: "Média da comunidade",
      valor: filtros.notaComunidadeMin,
      opcoes: opcoesDeNota("Qualquer média"),
      aoMudar: (valor) => aplicar(filtros, { notaComunidadeMin: valor }),
    }),
    seletor({
      id: "filtro-minha-nota",
      rotulo: "Minha avaliação",
      valor: filtros.minhaNotaMin,
      opcoes: opcoesDeNota("Qualquer nota minha"),
      aoMudar: (valor) => aplicar(filtros, { minhaNotaMin: valor }),
    }),
    seletor({
      id: "filtro-ordem",
      rotulo: "Ordenar por",
      valor: filtros.ordem,
      opcoes: ORDENS.map((o) => ({ valor: o.valor, rotulo: o.rotulo })),
      largo: true,
      aoMudar: (valor) => aplicar(filtros, { ordem: valor }),
    }),
    temAlgumFiltro(filtros)
      ? el("button", {
          class: "btn fantasma pequeno",
          type: "button",
          text: "Limpar filtros",
          onClick: () => ir("/"),
        })
      : null
  );
}

// No celular o painel fica recolhido atras de um botao (o CSS esconde o botao no
// desktop). Cada troca de filtro redesenha a tela, entao o estado aberto/fechado
// mora aqui, fora da renderizacao.
let painelAberto = false;

const NO_PAINEL = ["artistId", "genero", "anoDe", "anoAte", "notaComunidadeMin", "minhaNotaMin"];

/** Quantos ajustes do painel fogem do padrao: filtros e a ordenacao. */
const ajustesNoPainel = (filtros) =>
  NO_PAINEL.filter((chave) => filtros[chave]).length + (filtros.ordem !== "adicionados" ? 1 : 0);

/**
 * O CSS esconde o painel quando este botao, logo antes dele, esta com
 * aria-expanded="false". O atributo e' a unica fonte do estado.
 */
function alternadorDoPainel(filtros) {
  const ajustes = ajustesNoPainel(filtros);
  const botao = el(
    "button",
    {
      class: "btn filtros-alternar",
      type: "button",
      "aria-controls": "painel-filtros",
      "aria-expanded": String(painelAberto),
    },
    icone("ajustes", 15),
    "Filtros e ordem",
    ajustes > 0 ? el("span", { class: "selo coral", text: String(ajustes) }) : null,
    el("span", { class: "seta" }, icone("seta_baixo", 15))
  );

  botao.addEventListener("click", () => {
    painelAberto = !painelAberto;
    botao.setAttribute("aria-expanded", String(painelAberto));
  });
  return botao;
}

function paginacao(filtros, dados) {
  if (dados.paginas <= 1) return null;

  const botao = (rotulo, pagina, desabilitado) =>
    el("button", {
      class: "btn pequeno",
      type: "button",
      disabled: desabilitado,
      text: rotulo,
      onClick: () => aplicar(filtros, { pagina }),
    });

  return el(
    "nav",
    { class: "paginacao", "aria-label": "Paginacao do catalogo" },
    botao("Anterior", dados.pagina - 1, dados.pagina <= 1),
    el("span", { class: "texto-faint", text: `Página ${dados.pagina} de ${dados.paginas}` }),
    botao("Próxima", dados.pagina + 1, dados.pagina >= dados.paginas)
  );
}

function semResultados(filtros) {
  if (!temAlgumFiltro(filtros)) {
    return vazio(
      "Nada no Sonora ainda",
      "O catálogo local guarda as obras com que alguém já interagiu. Pesquise um álbum e registre uma escuta para ele aparecer aqui.",
      el("a", { class: "btn primario", href: "/pesquisa" }, icone("busca", 15), "Pesquisar obras")
    );
  }

  return vazio(
    "Nenhuma obra com esses filtros",
    "Afrouxe um critério ou limpe os filtros.",
    el("button", { class: "btn fantasma", type: "button", text: "Limpar filtros", onClick: () => ir("/") })
  );
}

export async function telaCatalogo(container, _parametros, query) {
  const filtros = lerFiltros(query);
  const recarregar = () => telaCatalogo(container, _parametros, query);

  const cabecalho = el(
    "header",
    { class: "catalogo-topo" },
    el(
      "div",
      {},
      el("h1", { text: "No Sonora" }),
      el("p", {
        class: "texto-muted",
        text: "Álbuns, EPs e singles com que a comunidade já interagiu. Para encontrar qualquer obra, use a pesquisa.",
      })
    ),
    el("a", { class: "btn primario", href: "/pesquisa" }, icone("busca", 15), "Pesquisar obras")
  );

  trocar(container, cabecalho, esqueletoGrade(12));

  try {
    const [dados, facetas] = await Promise.all([api.explorar(filtros), api.facetas()]);

    const resumo = el(
      "div",
      { class: "catalogo-resumo" },
      el("span", {
        class: "texto-faint",
        text: `${plural(dados.total, "obra", "obras")} no catálogo do Sonora`,
      })
    );

    trocar(
      container,
      cabecalho,
      chipsDeTipo(filtros, facetas.tipos),
      // O botao precisa vir imediatamente antes do painel (seletor "+" no CSS).
      alternadorDoPainel(filtros),
      painelDeFiltros(filtros, facetas),
      resumo,
      dados.lancamentos.length > 0
        ? gradeObras(dados.lancamentos, { aoMudar: recarregar })
        : semResultados(filtros),
      paginacao(filtros, dados)
    );
  } catch (erro) {
    avisarErro(erro instanceof ErroApi ? erro.message : "Nao consegui carregar o catalogo.");
    trocar(container, cabecalho, vazio("Não deu para carregar", "Recarregue a página em instantes."));
  }
}
