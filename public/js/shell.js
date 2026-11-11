// Barra superior: marca, navegacao, pesquisa e menu da pessoa logada.
//
// A busca do topo leva para /pesquisa, que consulta a fonte externa (§39) — e
// nao para um filtro do catalogo local. Essa e' a inversao que a especificacao
// exige: encontrar uma obra nao depende de alguem ja te-la trazido para ca.

import { api } from "./api.js";
import { ir } from "./router.js";
import { limparSessao, souAdmin, usuarioAtual } from "./state.js";
import { avatar, el, icone, trocar } from "./ui.js";

const LINKS = [
  { href: "/pesquisa", rotulo: "Pesquisar" },
  { href: "/", rotulo: "No Sonora" },
  { href: "/listas", rotulo: "Listas" },
];

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
  const meuPerfil = `/u/${encodeURIComponent(eu.username)}`;

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
    el("a", { class: "marca", href: "/" }, el("span", { class: "marca-disco" }), "Sonora"),
    el(
      "nav",
      { class: "nav-links", "aria-label": "Navegação principal" },
      LINKS.map((link) => el("a", { class: "nav-link", href: link.href, text: link.rotulo }))
    ),
    busca,
    botaoEu
  );

  marcarLinkAtivo(window.location.pathname);
}

/** Destaca o link da secao em que estamos. */
export function marcarLinkAtivo(caminho) {
  for (const link of document.querySelectorAll("#topbar .nav-link")) {
    const href = link.getAttribute("href");

    let ativo;
    if (href === "/") {
      ativo = caminho === "/" || caminho.startsWith("/obra") || caminho.startsWith("/artista");
    } else if (href === "/pesquisa") {
      ativo = caminho.startsWith("/pesquisa") || caminho.startsWith("/cadastro-manual");
    } else {
      ativo = caminho.startsWith(href);
    }

    if (ativo) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
}
