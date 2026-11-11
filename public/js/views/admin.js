// Area administrativa (§45). Tres frentes, e so estas tres:
//
//   Usuarios      — ver, criar, redefinir senha, conceder/remover admin, excluir
//   Obras manuais — editar e remover o que foi cadastrado a mao
//   Moderacao     — excluir reviews e listas de qualquer pessoa
//
// Dados vindos da fonte externa nao sao editaveis aqui: a especificacao diz
// explicitamente que isso nao e' requisito. E nao existe fila de denuncia,
// apelacao, reputacao, strike nem banimento — tudo isso esta fora desta versao.

import { api, ErroApi } from "../api.js";
import { linkObra, linkPerfil } from "../actions.js";
import { ir } from "../router.js";
import { souAdmin, usuarioAtual } from "../state.js";
import { estrelas } from "../stars.js";
import {
  abrirModal,
  avatar,
  avisarErro,
  avisarOk,
  botaoIcone,
  capa,
  confirmar,
  dataCurta,
  dataRelativa,
  el,
  icone,
  plural,
  rotuloDoTipo,
  trocar,
  vazio,
} from "../ui.js";

const SENHA_MINIMA = 8;
const erroTexto = (erro, reserva) => (erro instanceof ErroApi ? erro.message : reserva);

const carregando = () => el("div", { class: "vazio" }, el("span", { class: "carregando-inline" }));

// ─── Usuarios (RF90-RF93) ───────────────────────────────────────────────────

function formularioNovoUsuario(recarregar) {
  const usuario = el("input", { type: "text", id: "novo-usuario-admin", maxlength: "40", autocomplete: "off" });
  const nome = el("input", { type: "text", id: "novo-nome-admin", maxlength: "80", autocomplete: "off" });
  const senha = el("input", { type: "password", id: "nova-senha-admin", autocomplete: "new-password" });
  const admin = el("input", { type: "checkbox" });

  const criar = el("button", { class: "btn primario", type: "button", text: "Criar acesso" });
  criar.addEventListener("click", async () => {
    criar.disabled = true;
    try {
      await api.adminCriarUsuario({
        username: usuario.value.trim(),
        displayName: nome.value.trim() || undefined,
        password: senha.value,
        isAdmin: admin.checked,
      });
      avisarOk(`Acesso criado para ${usuario.value.trim()}.`);
      usuario.value = "";
      nome.value = "";
      senha.value = "";
      admin.checked = false;
      recarregar();
    } catch (erro) {
      avisarErro(erroTexto(erro, "Nao consegui criar o acesso."));
    }
    criar.disabled = false;
  });

  return el(
    "div",
    { class: "painel" },
    el("div", { class: "painel-titulo", text: "Criar acesso" }),
    el(
      "div",
      { class: "pilha" },
      el(
        "div",
        { class: "linha-campos" },
        el("div", { class: "campo" }, el("label", { for: "novo-usuario-admin", text: "Usuário" }), usuario),
        el("div", { class: "campo" }, el("label", { for: "novo-nome-admin", text: "Nome de exibição" }), nome)
      ),
      el(
        "div",
        { class: "campo" },
        el("label", { for: "nova-senha-admin", text: "Senha inicial" }),
        senha,
        el("span", {
          class: "dica",
          text: `Mínimo de ${SENHA_MINIMA} caracteres. A pessoa pode trocar depois.`,
        })
      ),
      el("label", { class: "check" }, admin, el("span", { text: "Também é administrador" })),
      el("div", { class: "fileira" }, criar)
    )
  );
}

function redefinirSenhaDe(pessoa) {
  const campo = el("input", { type: "password", id: "reset-senha", autocomplete: "new-password" });
  const confirmarBtn = el("button", { class: "btn primario", type: "button", text: "Redefinir" });

  const modal = abrirModal({
    titulo: `Redefinir senha de ${pessoa.displayName}`,
    corpo: el(
      "div",
      { class: "campo" },
      el("label", { for: "reset-senha", text: "Nova senha" }),
      campo,
      el("span", { class: "dica", text: `Mínimo de ${SENHA_MINIMA} caracteres.` })
    ),
    rodape: [
      el("button", { class: "btn fantasma", type: "button", text: "Cancelar", onClick: () => modal.fechar() }),
      confirmarBtn,
    ],
  });

  confirmarBtn.addEventListener("click", async () => {
    if (campo.value.length < SENHA_MINIMA) {
      avisarErro(`A senha precisa de pelo menos ${SENHA_MINIMA} caracteres.`);
      return;
    }
    confirmarBtn.disabled = true;
    try {
      await api.adminTrocarSenha(pessoa.id, campo.value);
      modal.fechar();
      avisarOk(`Senha de ${pessoa.username} redefinida.`);
    } catch (erro) {
      avisarErro(erroTexto(erro, "Nao consegui redefinir a senha."));
      confirmarBtn.disabled = false;
    }
  });
}

function linhaUsuario(pessoa, recarregar) {
  const eu = usuarioAtual();
  const souEu = pessoa.id === eu?.id;

  const alternarAdmin = botaoIcone(
    "chave",
    pessoa.isAdmin ? "Remover administrador" : "Tornar administrador",
    async () => {
      try {
        await api.adminDefinirAdmin(pessoa.id, !pessoa.isAdmin);
        recarregar();
      } catch (erro) {
        avisarErro(erroTexto(erro, "Nao consegui mudar o perfil."));
      }
    },
    { tamanho: 16, class: pessoa.isAdmin ? "ativo" : "" }
  );

  const remover = botaoIcone(
    "lixeira",
    `Excluir ${pessoa.username}`,
    async () => {
      const sim = await confirmar({
        titulo: `Excluir ${pessoa.displayName}?`,
        mensagem:
          "A conta, as escutas, as avaliações, as reviews e as listas dessa pessoa são apagadas. As obras que ela cadastrou continuam no catálogo, porque o catálogo é colaborativo.",
        textoConfirmar: "Excluir usuário",
      });
      if (!sim) return;
      try {
        await api.adminRemoverUsuario(pessoa.id);
        avisarOk("Usuário excluído.");
        recarregar();
      } catch (erro) {
        avisarErro(erroTexto(erro, "Nao consegui excluir o usuario."));
      }
    },
    { tamanho: 16 }
  );

  // Trava simples: ninguem se remove nem se rebaixa sem querer.
  if (souEu) {
    alternarAdmin.disabled = true;
    remover.disabled = true;
  }

  return el(
    "tr",
    {},
    el(
      "td",
      {},
      el(
        "div",
        { class: "fileira", style: "gap:10px" },
        avatar(pessoa),
        el(
          "div",
          {},
          el("a", { style: "font-weight:600", href: linkPerfil(pessoa.username), text: pessoa.displayName }),
          el("div", { class: "texto-faint", text: `@${pessoa.username}` })
        )
      )
    ),
    el(
      "td",
      {},
      pessoa.isAdmin
        ? el("span", { class: "selo coral", text: "admin" })
        : el("span", { class: "selo", text: "membro" })
    ),
    el("td", { class: "texto-faint", text: dataCurta(pessoa.createdAt) }),
    el(
      "td",
      {},
      el(
        "div",
        { class: "acoes" },
        botaoIcone("chave", `Redefinir senha de ${pessoa.username}`, () => redefinirSenhaDe(pessoa), {
          tamanho: 16,
        }),
        alternarAdmin,
        remover
      )
    )
  );
}

function abaUsuarios() {
  const area = el("div", { class: "pilha-g" });

  async function recarregar() {
    trocar(area, carregando());
    try {
      const { usuarios } = await api.adminUsuarios();

      const tabela = el(
        "table",
        { class: "tabela" },
        el(
          "thead",
          {},
          el(
            "tr",
            {},
            el("th", { scope: "col", text: "Pessoa" }),
            el("th", { scope: "col", text: "Perfil" }),
            el("th", { scope: "col", text: "Desde" }),
            el("th", { scope: "col" }, el("span", { class: "sr-only", text: "Ações" }))
          )
        ),
        el("tbody", {}, usuarios.map((pessoa) => linhaUsuario(pessoa, recarregar)))
      );

      trocar(
        area,
        el(
          "div",
          { class: "faixa-aviso" },
          icone("info", 18),
          el(
            "div",
            {},
            el("b", { text: "Cadastro aberto está ligado" }),
            el("span", {
              text: "Qualquer pessoa cria a própria conta na tela de entrada e entra como membro comum. Esta área serve para criar acessos de apoio, redefinir senha e conceder perfil de administrador.",
            })
          )
        ),
        formularioNovoUsuario(recarregar),
        el("div", { class: "tabela-rolagem" }, tabela)
      );
    } catch (erro) {
      avisarErro(erroTexto(erro, "Nao consegui carregar os usuarios."));
      trocar(area, vazio("Não deu para carregar", "Tente de novo em instantes."));
    }
  }

  recarregar();
  return area;
}

// ─── Obras manuais (RF94, RF95) ─────────────────────────────────────────────

function editarObraManual(obra, recarregar) {
  const titulo = el("input", { type: "text", id: "edit-titulo", maxlength: "300", value: obra.title });

  const tipo = el(
    "select",
    { id: "edit-tipo" },
    ["ALBUM", "EP", "SINGLE"].map((valor) =>
      el("option", { value: valor, text: rotuloDoTipo(valor) })
    )
  );
  tipo.value = obra.type;

  const data = el("input", {
    type: "text",
    id: "edit-data",
    maxlength: "10",
    value: obra.release_date_text || (obra.release_year ? String(obra.release_year) : ""),
    placeholder: "2024, 2024-08 ou 2024-08-09",
  });

  const capaUrl = el("input", { type: "url", id: "edit-capa", maxlength: "600", value: obra.cover_url || "" });
  const generos = el("input", {
    type: "text",
    id: "edit-generos",
    maxlength: "300",
    value: (obra.genres || []).join(", "),
  });

  const salvar = el("button", { class: "btn primario", type: "button", text: "Salvar" });

  const modal = abrirModal({
    titulo: `Editar "${obra.title}"`,
    corpo: el(
      "div",
      { class: "pilha" },
      el("div", { class: "campo" }, el("label", { for: "edit-titulo", text: "Título" }), titulo),
      el("div", { class: "campo" }, el("label", { for: "edit-tipo", text: "Tipo" }), tipo),
      el(
        "div",
        { class: "campo" },
        el("label", { for: "edit-data", text: "Data de lançamento" }),
        data,
        el("span", { class: "dica", text: "Ano, ano-mês ou data completa." })
      ),
      el("div", { class: "campo" }, el("label", { for: "edit-capa", text: "Endereço da capa" }), capaUrl),
      el(
        "div",
        { class: "campo" },
        el("label", { for: "edit-generos", text: "Gêneros" }),
        generos,
        el("span", { class: "dica", text: "Separados por vírgula." })
      )
    ),
    rodape: [
      el("button", { class: "btn fantasma", type: "button", text: "Cancelar", onClick: () => modal.fechar() }),
      salvar,
    ],
  });

  salvar.addEventListener("click", async () => {
    const valorData = data.value.trim();
    if (valorData && !/^\d{4}(-\d{2}(-\d{2})?)?$/.test(valorData)) {
      avisarErro("A data precisa ser 2024, 2024-08 ou 2024-08-09.");
      return;
    }

    salvar.disabled = true;
    try {
      await api.adminEditarObraManual(obra.id, {
        title: titulo.value.trim() || undefined,
        type: tipo.value,
        releaseDate: valorData || undefined,
        coverUrl: capaUrl.value.trim() || undefined,
        genres: generos.value
          .split(",")
          .map((g) => g.trim())
          .filter(Boolean),
      });
      modal.fechar();
      avisarOk("Obra atualizada.");
      recarregar();
    } catch (erro) {
      avisarErro(erroTexto(erro, "Nao consegui salvar a obra."));
      salvar.disabled = false;
    }
  });
}

function linhaObraManual(obra, recarregar) {
  const remover = async () => {
    const sim = await confirmar({
      titulo: `Remover "${obra.title}"?`,
      mensagem:
        "A obra sai do catálogo, junto com as escutas, avaliações e reviews que ela recebeu. Não dá para desfazer.",
      textoConfirmar: "Remover obra",
    });
    if (!sim) return;
    try {
      await api.adminRemoverObraManual(obra.id);
      avisarOk("Obra removida.");
      recarregar();
    } catch (erro) {
      avisarErro(erroTexto(erro, "Nao consegui remover a obra."));
    }
  };

  return el(
    "tr",
    {},
    el(
      "td",
      {},
      el(
        "div",
        { class: "fileira", style: "gap:10px" },
        el("div", { class: "mini-capa" }, capa(obra.cover_url, "")),
        el(
          "div",
          {},
          el("a", { style: "font-weight:600", href: linkObra({ ref: String(obra.id) }), text: obra.title }),
          el("div", { class: "texto-faint", text: obra.artist_name })
        )
      )
    ),
    el("td", { class: "texto-faint", text: rotuloDoTipo(obra.type) }),
    el("td", { class: "texto-faint", text: obra.release_date_text || obra.release_year || "—" }),
    el(
      "td",
      { class: "texto-faint" },
      obra.created_by_username ? `@${obra.created_by_username}` : "—"
    ),
    el(
      "td",
      { class: "texto-faint" },
      `${plural(obra.escutas, "escuta", "escutas")} · ${plural(obra.total_notas, "nota", "notas")}`
    ),
    el(
      "td",
      {},
      el(
        "div",
        { class: "acoes" },
        botaoIcone("lapis", `Editar ${obra.title}`, () => editarObraManual(obra, recarregar), { tamanho: 16 }),
        botaoIcone("lixeira", `Remover ${obra.title}`, remover, { tamanho: 16 })
      )
    )
  );
}

function abaObrasManuais() {
  const area = el("div", { class: "pilha-g" });

  async function recarregar() {
    trocar(area, carregando());
    try {
      const { lancamentos } = await api.adminObrasManuais();

      if (lancamentos.length === 0) {
        trocar(
          area,
          vazio(
            "Nenhuma obra manual",
            "Todo o catálogo veio da fonte externa. Obras cadastradas à mão aparecem aqui para edição e remoção."
          )
        );
        return;
      }

      trocar(
        area,
        el(
          "div",
          { class: "faixa-aviso" },
          icone("info", 18),
          el(
            "div",
            {},
            el("b", { text: "Só obras cadastradas à mão" }),
            el("span", {
              text: "Dados vindos da fonte externa não são editáveis: eles pertencem ao catálogo oficial de metadados.",
            })
          )
        ),
        el(
          "div",
          { class: "tabela-rolagem" },
          el(
            "table",
            { class: "tabela" },
            el(
              "thead",
              {},
              el(
                "tr",
                {},
                el("th", { scope: "col", text: "Obra" }),
                el("th", { scope: "col", text: "Tipo" }),
                el("th", { scope: "col", text: "Lançamento" }),
                el("th", { scope: "col", text: "Cadastrada por" }),
                el("th", { scope: "col", text: "Uso" }),
                el("th", { scope: "col" }, el("span", { class: "sr-only", text: "Ações" }))
              )
            ),
            el("tbody", {}, lancamentos.map((obra) => linhaObraManual(obra, recarregar)))
          )
        )
      );
    } catch (erro) {
      avisarErro(erroTexto(erro, "Nao consegui carregar as obras manuais."));
      trocar(area, vazio("Não deu para carregar", "Tente de novo em instantes."));
    }
  }

  recarregar();
  return area;
}

// ─── Moderacao (RF96, RF97) ─────────────────────────────────────────────────

function cartaoReviewModerada(review, recarregar) {
  const excluir = async () => {
    const sim = await confirmar({
      titulo: "Excluir esta review?",
      mensagem:
        "Somente a review é removida. A escuta, a nota e os demais vínculos de quem escreveu continuam intactos.",
      textoConfirmar: "Excluir review",
    });
    if (!sim) return;
    try {
      await api.adminRemoverReview(review.id);
      avisarOk("Review excluída.");
      recarregar();
    } catch (erro) {
      avisarErro(erroTexto(erro, "Nao consegui excluir a review."));
    }
  };

  return el(
    "article",
    { class: "card-moderacao" },
    el(
      "div",
      { class: "fileira entre" },
      el(
        "div",
        { class: "fileira", style: "gap:8px" },
        avatar({ displayName: review.display_name }),
        el("a", { href: linkPerfil(review.username), text: review.display_name }),
        review.rating ? estrelas(review.rating) : el("span", { class: "selo", text: "sem nota" }),
        el("span", { class: "texto-faint", text: `há ${dataRelativa(review.created_at)}` })
      ),
      botaoIcone("lixeira", "Excluir esta review", excluir, { tamanho: 16 })
    ),
    el(
      "a",
      { class: "entrada-obra", href: linkObra({ ref: String(review.release_id) }) },
      review.title,
      el("span", { text: ` · ${review.artist_name}` })
    ),
    el("p", { class: "entrada-resenha aberta", text: review.review })
  );
}

function linhaListaModerada(lista, recarregar) {
  const excluir = async () => {
    const sim = await confirmar({
      titulo: `Excluir "${lista.title}"?`,
      mensagem:
        "A lista é removida para todo mundo. As obras e os registros das pessoas não são afetados.",
      textoConfirmar: "Excluir lista",
    });
    if (!sim) return;
    try {
      await api.adminRemoverLista(lista.id);
      avisarOk("Lista excluída.");
      recarregar();
    } catch (erro) {
      avisarErro(erroTexto(erro, "Nao consegui excluir a lista."));
    }
  };

  return el(
    "tr",
    {},
    el(
      "td",
      {},
      el(
        "div",
        { class: "pilha", style: "gap:2px" },
        el("a", { style: "font-weight:600", href: `/lista/${lista.id}`, text: lista.title }),
        lista.description
          ? el("div", { class: "texto-faint", text: lista.description.slice(0, 90) })
          : null
      )
    ),
    el(
      "td",
      {},
      el("a", { href: linkPerfil(lista.username), text: lista.display_name })
    ),
    el(
      "td",
      {},
      lista.visibility === "PRIVATE"
        ? el("span", { class: "selo", text: "privada" })
        : el("span", { class: "selo verde", text: "pública" })
    ),
    el("td", { class: "texto-faint", text: plural(lista.total_itens, "obra", "obras") }),
    el("td", { class: "texto-faint", text: dataCurta(lista.updated_at) }),
    el("td", {}, el("div", { class: "acoes" }, botaoIcone("lixeira", `Excluir ${lista.title}`, excluir, { tamanho: 16 })))
  );
}

function abaModeracao() {
  const area = el("div", { class: "pilha-g" });

  async function recarregar() {
    trocar(area, carregando());
    try {
      const [{ reviews }, { listas }] = await Promise.all([api.adminReviews(), api.adminListas()]);

      trocar(
        area,
        el(
          "div",
          { class: "faixa-aviso" },
          icone("info", 18),
          el(
            "div",
            {},
            el("b", { text: "Moderação nesta versão é ação direta" }),
            el("span", {
              text: "Não há fila de denúncias, apelação, reputação nem banimento: moderar significa excluir uma review ou uma lista inadequada. Listas privadas aparecem aqui, e só aqui, fora do perfil do dono.",
            })
          )
        ),
        el(
          "section",
          { class: "secao" },
          el("h2", { class: "secao-titulo", text: `Reviews (${reviews.length})` }),
          reviews.length > 0
            ? el("div", { class: "pilha" }, reviews.map((review) => cartaoReviewModerada(review, recarregar)))
            : el("p", { class: "texto-muted", text: "Nenhuma review publicada ainda." })
        ),
        el(
          "section",
          { class: "secao" },
          el("h2", { class: "secao-titulo", text: `Listas (${listas.length})` }),
          listas.length > 0
            ? el(
                "div",
                { class: "tabela-rolagem" },
                el(
                  "table",
                  { class: "tabela" },
                  el(
                    "thead",
                    {},
                    el(
                      "tr",
                      {},
                      el("th", { scope: "col", text: "Lista" }),
                      el("th", { scope: "col", text: "Autor" }),
                      el("th", { scope: "col", text: "Visibilidade" }),
                      el("th", { scope: "col", text: "Itens" }),
                      el("th", { scope: "col", text: "Atualizada" }),
                      el("th", { scope: "col" }, el("span", { class: "sr-only", text: "Ações" }))
                    )
                  ),
                  el("tbody", {}, listas.map((lista) => linhaListaModerada(lista, recarregar)))
                )
              )
            : el("p", { class: "texto-muted", text: "Nenhuma lista criada ainda." })
        )
      );
    } catch (erro) {
      avisarErro(erroTexto(erro, "Nao consegui carregar a moderacao."));
      trocar(area, vazio("Não deu para carregar", "Tente de novo em instantes."));
    }
  }

  recarregar();
  return area;
}

// ─── Tela ───────────────────────────────────────────────────────────────────

const ABAS = [
  { chave: "usuarios", rotulo: "Usuários", monta: abaUsuarios },
  { chave: "obras", rotulo: "Obras manuais", monta: abaObrasManuais },
  { chave: "moderacao", rotulo: "Moderação", monta: abaModeracao },
];

export function telaAdmin(container, _parametros, query) {
  // RF89: usuario comum nao ve esta area. O servidor tambem recusa, mas nao
  // faz sentido desenhar a tela para quem nao pode usa-la.
  if (!souAdmin()) {
    trocar(
      container,
      vazio(
        "Área restrita",
        "Só administradores acessam a administração.",
        el("a", { class: "btn primario", href: "/", text: "Voltar ao catálogo" })
      )
    );
    return;
  }

  const pedida = query.get("aba");
  const inicial = ABAS.some((aba) => aba.chave === pedida) ? pedida : "usuarios";
  const conteudo = el("div", {});

  const barra = el(
    "div",
    { class: "abas", role: "tablist", "aria-label": "Seções da administração" },
    ABAS.map((aba) =>
      el("button", {
        class: "aba",
        type: "button",
        role: "tab",
        dataset: { aba: aba.chave },
        "aria-selected": String(aba.chave === inicial),
        text: aba.rotulo,
        onClick: () => ir(`/admin?aba=${aba.chave}`),
      })
    )
  );

  trocar(
    container,
    el(
      "header",
      { class: "pilha", style: "margin-bottom:22px" },
      el("h1", { text: "Administração" }),
      el("p", {
        class: "texto-muted",
        text: "Usuários, obras cadastradas à mão e moderação de conteúdo.",
      })
    ),
    barra,
    conteudo
  );

  trocar(conteudo, ABAS.find((aba) => aba.chave === inicial).monta());
}
