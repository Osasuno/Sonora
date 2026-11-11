// Roteador de uma pagina so, em cima da History API.
// Os links comuns (<a href="/algo">) sao interceptados automaticamente.

const rotas = [];
let aoNavegar = null;
let iniciado = false;

/** Converte "/album/:id" num regex com grupos nomeados. */
function compilar(padrao) {
  const partes = padrao
    .split("/")
    .filter(Boolean)
    .map((parte) => (parte.startsWith(":") ? `(?<${parte.slice(1)}>[^/]+)` : parte.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  return new RegExp(`^/${partes.join("/")}/?$`);
}

export function registrar(padrao, manipulador) {
  rotas.push({ regex: compilar(padrao), manipulador, padrao });
}

export function definirGancho(fn) {
  aoNavegar = fn;
}

export const caminhoAtual = () => window.location.pathname;
export const parametrosUrl = () => new URLSearchParams(window.location.search);

/** Navega sem recarregar a pagina. */
export function ir(destino, { substituir = false } = {}) {
  const atual = window.location.pathname + window.location.search;
  if (destino === atual) return;

  if (substituir) window.history.replaceState({}, "", destino);
  else window.history.pushState({}, "", destino);
  resolver();
}

export function resolver() {
  const caminho = window.location.pathname;

  for (const rota of rotas) {
    const encontrado = rota.regex.exec(caminho);
    if (!encontrado) continue;

    const parametros = {};
    for (const [chave, valor] of Object.entries(encontrado.groups || {})) {
      parametros[chave] = decodeURIComponent(valor);
    }
    if (aoNavegar) aoNavegar(rota.padrao);
    rota.manipulador(parametros, parametrosUrl());
    return;
  }

  if (aoNavegar) aoNavegar(null);
  rotas.find((rota) => rota.padrao === "*")?.manipulador({}, parametrosUrl());
}

function eLinkInterno(alvo) {
  if (!alvo || alvo.target === "_blank" || alvo.hasAttribute("download")) return false;
  const href = alvo.getAttribute("href") || "";
  return href.startsWith("/") && !href.startsWith("//");
}

export function iniciar() {
  if (iniciado) return;
  iniciado = true;

  document.addEventListener("click", (evento) => {
    if (evento.defaultPrevented || evento.metaKey || evento.ctrlKey || evento.shiftKey) return;
    if (evento.button !== 0) return;

    const link = evento.target.closest("a");
    if (!eLinkInterno(link)) return;

    evento.preventDefault();
    ir(link.getAttribute("href"));
  });

  window.addEventListener("popstate", resolver);
  resolver();
}
