// Ponto de entrada da interface: descobre se ha sessao, monta a casca e liga o
// roteador. Sem sessao, mostra a tela de entrada (login ou criar conta).

import { api } from "./api.js";
import { definirGancho, iniciar, registrar } from "./router.js";
import { marcarLinkAtivo, montarTopbar } from "./shell.js";
import { definirSessao, emDemonstracao } from "./state.js";
import { el, icone, trocar, vazio } from "./ui.js";

import { telaAdmin } from "./views/admin.js";
import { telaAjustes } from "./views/settings.js";
import { telaArtista } from "./views/artist.js";
import { telaCadastroManual } from "./views/manual.js";
import { telaCatalogo } from "./views/catalog.js";
import { telaEditorLista } from "./views/listEditor.js";
import { telaLancamento } from "./views/release.js";
import { telaLista } from "./views/listDetail.js";
import { telaListas } from "./views/lists.js";
import { telaLogin } from "./views/login.js";
import { telaPerfil } from "./views/profile.js";
import { telaPesquisa } from "./views/search.js";

const conteudo = () => document.getElementById("conteudo");

/**
 * Cada tela recebe (container, parametros, query).
 *
 * `:ref` em /obra e /artista aceita id local ou identificador externo: e' o que
 * permite abrir uma obra que ainda nao foi persistida (§13).
 */
const ROTAS = [
  ["/", telaCatalogo],
  ["/pesquisa", telaPesquisa],
  ["/obra/:id", telaLancamento],
  ["/artista/:id", telaArtista],
  ["/cadastro-manual", telaCadastroManual],
  ["/u/:username", telaPerfil],
  ["/listas", telaListas],
  ["/lista/nova", (container) => telaEditorLista(container, {})],
  ["/lista/:id", telaLista],
  ["/lista/:id/editar", telaEditorLista],
  ["/ajustes", telaAjustes],
  ["/admin", telaAdmin],
];

function registrarRotas() {
  for (const [padrao, tela] of ROTAS) {
    registrar(padrao, (parametros, query) => {
      document.title = "Sonora";
      window.scrollTo({ top: 0, behavior: "instant" });
      tela(conteudo(), parametros, query);
    });
  }

  registrar("*", () => {
    trocar(
      conteudo(),
      vazio(
        "Página não encontrada",
        "O endereço não existe (ou não existe mais).",
        el("a", { class: "btn primario", href: "/", text: "Ir para o catálogo" })
      )
    );
  });
}

let appPronto = false;

/**
 * Deixa claro, em toda tela, que o conteudo social e' ficticio.
 *
 * O modo demonstracao e' apoio temporario de desenvolvimento e nao faz parte da
 * versao alvo (§61): a persistencia oficial e' PostgreSQL.
 */
function mostrarFaixaDemo() {
  const faixa = el(
    "div",
    { class: "faixa-demo", role: "status" },
    icone("alerta", 15),
    el(
      "span",
      {},
      el("b", { text: "Modo demonstração. " }),
      "Os metadados e as capas são reais; pessoas, escutas, notas e reviews são fictícias e somem quando o servidor reinicia."
    )
  );
  document.getElementById("app").prepend(faixa);
}

function mostrarApp() {
  document.getElementById("boot").hidden = true;
  document.getElementById("tela-login").hidden = true;
  document.getElementById("app").hidden = false;

  if (emDemonstracao()) mostrarFaixaDemo();
  montarTopbar();
  registrarRotas();
  definirGancho(() => marcarLinkAtivo(window.location.pathname));
  iniciar();
  appPronto = true;
}

function mostrarLogin() {
  document.getElementById("boot").hidden = true;
  document.getElementById("app").hidden = true;

  telaLogin(() => {
    // Recarrega para a casca subir limpa com a nova sessao.
    window.location.assign("/");
  });
}

async function comecar() {
  try {
    const sessao = await api.euMesmo();
    definirSessao({
      usuario: sessao.usuario,
      dadosProntos: sessao.dadosProntos,
      demo: sessao.demo,
    });
    mostrarApp();
  } catch {
    mostrarLogin();
  }
}

// Sessao caiu no meio do uso: volta para a entrada sem deixar a tela travada.
// O 401 da checagem inicial nao conta — ali o login ja e' mostrado normalmente.
window.addEventListener("sonora:sessao-expirada", () => {
  if (!appPronto) return;
  appPronto = false;
  window.location.assign("/");
});

// Atalho: "/" foca a busca, como em quase todo catalogo.
document.addEventListener("keydown", (evento) => {
  if (evento.key !== "/" || evento.ctrlKey || evento.metaKey) return;
  const alvo = evento.target;
  if (alvo instanceof HTMLInputElement || alvo instanceof HTMLTextAreaElement) return;

  const campo = document.getElementById("busca-global");
  if (!campo) return;
  evento.preventDefault();
  campo.focus();
});

comecar();
