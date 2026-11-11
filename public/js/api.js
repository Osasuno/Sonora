// Cliente HTTP da plataforma. Toda chamada passa por aqui, entao o tratamento de
// erro e de sessao expirada fica em um lugar so.

export class ErroApi extends Error {
  constructor(mensagem, status, extra = {}) {
    super(mensagem);
    this.name = "ErroApi";
    this.status = status;
    // Alguns erros carregam contexto que a tela usa para decidir o que mostrar
    // (por exemplo: o cadastro manual foi recusado porque a API encontrou a obra).
    this.dados = extra;
  }
}

/** Disparado quando o servidor responde 401: a interface volta para o login. */
const avisarSessaoExpirada = () => window.dispatchEvent(new CustomEvent("sonora:sessao-expirada"));

async function pedir(metodo, caminho, corpo) {
  const opcoes = {
    method: metodo,
    headers: { accept: "application/json" },
    credentials: "same-origin",
  };

  if (corpo !== undefined) {
    opcoes.headers["content-type"] = "application/json";
    opcoes.body = JSON.stringify(corpo);
  }

  let resposta;
  try {
    resposta = await fetch(`/api${caminho}`, opcoes);
  } catch {
    throw new ErroApi("Sem conexao com o servidor.", 0);
  }

  if (resposta.status === 204) return null;

  const dados = await resposta.json().catch(() => ({}));

  if (!resposta.ok) {
    if (resposta.status === 401) avisarSessaoExpirada();
    throw new ErroApi(dados.erro || `Falha na requisicao (${resposta.status})`, resposta.status, dados);
  }
  return dados;
}

const get = (caminho) => pedir("GET", caminho);
const post = (caminho, corpo) => pedir("POST", caminho, corpo ?? {});
const put = (caminho, corpo) => pedir("PUT", caminho, corpo ?? {});
const patch = (caminho, corpo) => pedir("PATCH", caminho, corpo);
const apagar = (caminho) => pedir("DELETE", caminho);

/** Monta a query string ignorando o que estiver vazio. */
function query(parametros) {
  const busca = new URLSearchParams();
  for (const [chave, valor] of Object.entries(parametros || {})) {
    if (valor !== undefined && valor !== null && valor !== "") busca.set(chave, String(valor));
  }
  const texto = busca.toString();
  return texto ? `?${texto}` : "";
}

const ref = (valor) => encodeURIComponent(String(valor));

export const api = {
  // ─── Sessao (§21, §22) ────────────────────────────────────────────────────
  status: () => get("/status"),
  euMesmo: () => get("/users/me"),
  cadastrar: (dados) => post("/auth/cadastro", dados),
  entrar: (username, password) => post("/auth/login", { username, password }),
  sair: () => post("/auth/logout"),
  trocarSenha: (currentPassword, newPassword) =>
    post("/auth/senha", { currentPassword, newPassword }),

  // ─── Catalogo ─────────────────────────────────────────────────────────────
  // A pesquisa vai a fonte externa (§12, §39); "explorar" percorre o que ja
  // existe no Sonora, com os filtros oficiais (§40-43).
  pesquisar: (termo, artista) => get(`/catalogo/pesquisa${query({ q: termo, artista })}`),
  pesquisarArtistas: (termo) => get(`/catalogo/pesquisa/artistas${query({ q: termo })}`),
  explorar: (filtros) => get(`/catalogo/explorar${query(filtros)}`),
  facetas: () => get("/catalogo/facetas"),

  // `ref` aceita id local ou MBID. Abrir nao persiste nada (§13).
  lancamento: (valor) => get(`/catalogo/lancamentos/${ref(valor)}`),
  artista: (valor) => get(`/catalogo/artistas/${ref(valor)}`),

  // Cadastro manual: fallback controlado (§16, §17)
  verificarManual: (title, artistName) => post("/catalogo/manual/verificar", { title, artistName }),
  cadastrarManual: (dados) => post("/catalogo/manual", dados),

  // ─── Interacoes (§26-§32) ─────────────────────────────────────────────────
  registrarEscuta: (refObra, listenedOn) => post("/interacoes/escutas", { ref: refObra, listenedOn }),
  removerEscuta: (id) => apagar(`/interacoes/escutas/${id}`),

  avaliar: (refObra, nota) => put("/interacoes/avaliacoes", { ref: refObra, nota }),
  removerAvaliacao: (refObra) => apagar(`/interacoes/avaliacoes/${ref(refObra)}`),

  publicarReview: (refObra, texto) => put("/interacoes/reviews", { ref: refObra, texto }),
  removerReview: (refObra) => apagar(`/interacoes/reviews/${ref(refObra)}`),

  // Nota e review na mesma acao: uma escuta automatica so (§28).
  registrar: (dados) => post("/interacoes/registro", dados),

  favoritar: (refObra) => post("/interacoes/favoritos", { ref: refObra }),
  desfavoritar: (refObra) => apagar(`/interacoes/favoritos/${ref(refObra)}`),
  adicionarQueroOuvir: (refObra) => post("/interacoes/quero-ouvir", { ref: refObra }),
  removerQueroOuvir: (refObra) => apagar(`/interacoes/quero-ouvir/${ref(refObra)}`),
  hoje: () => get("/interacoes/hoje"),

  // ─── Perfil (§23, §24, §25) ───────────────────────────────────────────────
  perfil: (username) => get(`/users/${encodeURIComponent(username)}`),
  areaDoPerfil: (username, area) =>
    get(`/users/${encodeURIComponent(username)}/area${query({ area })}`),
  salvarPerfil: (dados) => patch("/users/me", dados),

  // ─── Listas (§34, §35, §36) ───────────────────────────────────────────────
  listasPublicas: () => get("/listas"),
  minhasListas: () => get("/listas/minhas/todas"),
  lista: (id) => get(`/listas/${id}`),
  criarLista: (dados) => post("/listas", dados),
  editarLista: (id, dados) => patch(`/listas/${id}`, dados),
  apagarLista: (id) => apagar(`/listas/${id}`),
  adicionarNaLista: (id, refObra, comment) => post(`/listas/${id}/itens`, { ref: refObra, comment }),

  // ─── Administracao (§45) ──────────────────────────────────────────────────
  adminUsuarios: () => get("/admin/users"),
  adminCriarUsuario: (dados) => post("/admin/users", dados),
  adminTrocarSenha: (id, password) => post(`/admin/users/${id}/password`, { password }),
  adminDefinirAdmin: (id, isAdmin) => post(`/admin/users/${id}/role`, { isAdmin }),
  adminRemoverUsuario: (id) => apagar(`/admin/users/${id}`),

  adminObrasManuais: () => get("/admin/obras-manuais"),
  adminEditarObraManual: (id, dados) => patch(`/admin/obras-manuais/${id}`, dados),
  adminRemoverObraManual: (id) => apagar(`/admin/obras-manuais/${id}`),

  adminReviews: () => get("/admin/reviews"),
  adminRemoverReview: (id) => apagar(`/admin/reviews/${id}`),
  adminListas: () => get("/admin/listas"),
  adminRemoverLista: (id) => apagar(`/admin/listas/${id}`),
};
