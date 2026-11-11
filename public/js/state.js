// Estado compartilhado minimo: quem esta logado e se ha fonte de dados.

const ouvintes = new Set();

const estado = {
  usuario: null,
  dadosProntos: false,
  demo: false,
};

export const usuarioAtual = () => estado.usuario;
export const dadosProntos = () => estado.dadosProntos;
export const emDemonstracao = () => estado.demo;
export const souAdmin = () => Boolean(estado.usuario?.isAdmin);

export function definirSessao({ usuario, dadosProntos: prontos, demo }) {
  estado.usuario = usuario || null;
  if (prontos !== undefined) estado.dadosProntos = Boolean(prontos);
  if (demo !== undefined) estado.demo = Boolean(demo);
  notificar();
}

export function atualizarUsuario(parcial) {
  if (!estado.usuario) return;
  estado.usuario = { ...estado.usuario, ...parcial };
  notificar();
}

export function limparSessao() {
  estado.usuario = null;
  notificar();
}

export function observar(ouvinte) {
  ouvintes.add(ouvinte);
  return () => ouvintes.delete(ouvinte);
}

function notificar() {
  for (const ouvinte of ouvintes) ouvinte(estado);
}
