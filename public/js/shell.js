// Barra superior: marca, navegacao, pesquisa e menu da pessoa logada.
//
// A busca do topo leva para /pesquisa, que consulta a fonte externa (§39) — e
// nao para um filtro do catalogo local. Essa e' a inversao que a especificacao
// exige: encontrar uma obra nao depende de alguem ja te-la trazido para ca.

import { api } from "./api.js";
import { ir } from "./router.js";
import { limparSessao, souAdmin, usuarioAtual } from "./state.js";
import { avatar, el, icone, trocar } from "./ui.js";

// `secao` liga o link a secao da tela atual (marcarLinkAtivo); `icone` e' o da
// barra de baixo do celular.
const LINKS = [
  { href: "/pesquisa", rotulo: "Pesquisar", secao: "pesquisa", icone: "busca" },
  { href: "/", rotulo: "No Sonora", secao: "catalogo", icone: "disco" },
  { href: "/listas", rotulo: "Listas", secao: "listas", icone: "listas" },
];

const caminhoDoPerfil = (eu) => `/u/${encodeURIComponent(eu.username)}`;

let menuAberto = null;

function fecharMenu() {
  menuAberto?.remove();
  menuAberto = null;
}

function itemMenu(nomeIcone, rotulo, acao, extra = "") {
  return el(
    "button",
    {
      class: `menu-item ${extra}`.trim(),
      type: "button",
      onClick: () => {
        fecharMenu();
        acao();
      },
    },
    icone(nomeIcone, 16),
    rotulo
  );
}

function abrirMenu(ancora) {
  if (menuAberto) {
    fecharMenu();
    return;
  }

  const eu = usuarioAtual();
  const meuPerfil = caminhoDoPerfil(eu);

  const menu = el(
    "div",
    { class: "menu", role: "menu" },
    itemMenu("disco", "Meu perfil", () => ir(meuPerfil)),
    itemMenu("relogio", "Histórico de escutas", () => ir(`${meuPerfil}?area=historico`)),
    itemMenu("estrela", "Minhas avaliações", () => ir(`${meuPerfil}?area=avaliacoes`)),
    itemMenu("lapis", "Minhas reviews", () => ir(`${meuPerfil}?area=reviews`)),
    itemMenu("coracao", "Favoritos", () => ir(`${meuPerfil}?area=favoritos`)),
    itemMenu("marcador", "Quero ouvir", () => ir(`${meuPerfil}?area=quero-ouvir`)),
    el("div", { class: "menu-sep" }),
    itemMenu("ajustes", "Ajustes", () => ir("/ajustes")),
    souAdmin() ? itemMenu("chave", "Administração", () => ir("/admin")) : null,
    el("div", { class: "menu-sep" }),
    itemMenu("sair", "Sair", sair, "perigo")
  );

  ancora.closest(".topbar").append(menu);
  menuAberto = menu;
  setTimeout(() => document.addEventListener("click", aoClicarFora, { once: true }), 0);
}

function aoClicarFora(evento) {
  if (menuAberto && !menuAberto.contains(evento.target)) fecharMenu();
}

async function sair() {
  await api.sair().catch(() => null);
  limparSessao();
  window.location.assign("/");
}

/** Renderiza a barra. Chamada de novo quando o nome de exibicao muda. */
export function montarTopbar() {
  const anfitriao = document.getElementById("topbar");
  const eu = usuarioAtual();
  if (!anfitriao || !eu) return;

  const campoBusca = el("input", {
    type: "search",
    id: "busca-global",
    placeholder: "Buscar álbum, EP ou single...",
    autocomplete: "off",
  });

  const busca = el(
    "form",
    {
      class: "busca-topo",
      role: "search",
      onSubmit: (evento) => {
        evento.preventDefault();
        const termo = campoBusca.value.trim();
        ir(termo ? `/pesquisa?q=${encodeURIComponent(termo)}` : "/pesquisa");
      },
    },
    el("label", { class: "sr-only", for: "busca-global", text: "Pesquisar obras" }),
    el("span", { class: "lupa" }, icone("busca", 16)),
    campoBusca
  );

  const botaoEu = el(
    "button",
    {
      class: "eu",
      type: "button",
      "aria-haspopup": "menu",
      "aria-label": `Menu de ${eu.displayName}`,
    },
    avatar(eu),
    el("span", { class: "eu-nome", text: eu.displayName }),
    icone("seta_baixo", 14)
  );
  botaoEu.addEventListener("click", (evento) => {
    evento.stopPropagation();
    abrirMenu(botaoEu);
  });

  trocar(
    anfitriao,
    el(
      "a",
      // O nome some em tela muito estreita (CSS); o rotulo garante o nome do link.
      { class: "marca", href: "/", "aria-label": "Sonora, página inicial" },
      el("span", { class: "marca-disco" }),
      el("span", { class: "marca-texto", text: "Sonora" })
    ),
    el(
      "nav",
      { class: "nav-links", "aria-label": "Navegação principal" },
      LINKS.map((link) =>
        el("a", { class: "nav-link", href: link.href, text: link.rotulo, dataset: { secao: link.secao } })
      )
    ),
    busca,
    botaoEu
  );

  montarNavInferior(eu);
  marcarLinkAtivo(window.location.pathname);
}

/**
 * Barra fixa embaixo, so no celular (o CSS esconde no desktop). La os links do
 * topo somem por falta de espaco, e sem esta barra a pagina de Listas ficava
 * sem caminho.
 */
function montarNavInferior(eu) {
  const anfitriao = document.getElementById("nav-inferior");
  if (!anfitriao) return;

  const item = ({ href, rotulo, secao }, simbolo) =>
    el("a", { class: "nav-inferior-link", href, dataset: { secao } }, simbolo, el("span", { text: rotulo }));

  trocar(
    anfitriao,
    LINKS.map((link) => item(link, icone(link.icone, 22))),
    item({ href: caminhoDoPerfil(eu), rotulo: "Perfil", secao: "perfil" }, avatar(eu, "p"))
  );
}

/** Em que secao da navegacao esta o caminho (vale para o topo e para a barra de baixo). */
function secaoDe(caminho) {
  if (caminho.startsWith("/pesquisa") || caminho.startsWith("/cadastro-manual")) return "pesquisa";
  if (caminho.startsWith("/lista")) return "listas";
  if (caminho === "/" || caminho.startsWith("/obra") || caminho.startsWith("/artista")) return "catalogo";

  const eu = usuarioAtual();
  if (eu && caminho.replace(/\/$/, "") === caminhoDoPerfil(eu)) return "perfil";
  return "";
}

/** Destaca o link da secao em que estamos. */
export function marcarLinkAtivo(caminho) {
  const secao = secaoDe(caminho);
  for (const link of document.querySelectorAll("#topbar .nav-link, #nav-inferior .nav-inferior-link")) {
    if (link.dataset.secao === secao) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}
