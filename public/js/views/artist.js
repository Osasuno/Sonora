// Pagina do artista (§38).
//
// Os dados vem principalmente da fonte externa: a discografia NAO e' limitada
// ao que ja esta persistido no Sonora. O banco local entra apenas marcando o
// que ja esta aqui e com que nota.
//
// O foco e' album, EP e single — nada alem disso, conforme a especificacao.

import { api, ErroApi } from "../api.js";
import { gradeObras } from "../cards.js";
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

function ficha(artista) {
  // §38: "metadados uteis disponiveis". Mostramos o que a fonte der, sem
  // inventar campo nenhum e sem link para fora (§46).
  const metadados = [
    artista.type,
    artista.country,
    artista.area,
    artista.lifeSpan?.begin
      ? `desde ${artista.lifeSpan.begin}${artista.lifeSpan.end ? ` até ${artista.lifeSpan.end}` : ""}`
      : null,
  ].filter(Boolean);

  return el(
    "header",
    { class: "artista-topo" },
    el("span", { class: "artista-icone" }, icone("pessoas", 26)),
    el(
      "div",
      {},
      el("h1", { text: artista.name }),
      artista.desambiguacao ? el("p", { class: "texto-muted", text: artista.desambiguacao }) : null,
      metadados.length > 0
        ? el(
            "div",
            { class: "chips-secos" },
            metadados.map((valor) => el("span", { class: "selo", text: String(valor) }))
          )
        : null,
      artista.genres?.length > 0
        ? el(
            "div",
            { class: "chips-secos" },
            artista.genres.map((g) => el("span", { class: "selo", text: g }))
          )
        : null
    )
  );
}

/** Discografia agrupada por tipo, na ordem album → EP → single. */
function discografia(lancamentos, recarregar) {
  const blocos = [];

  for (const tipo of TIPOS) {
    const doTipo = lancamentos.filter((item) => item.type === tipo);
    if (doTipo.length === 0) continue;

    blocos.push(
      el(
        "section",
        { class: "secao" },
        el(
          "div",
          { class: "secao-topo" },
          el("h2", { class: "secao-titulo", text: `${rotuloDoTipo(tipo)}s` }),
          el("span", { class: "texto-faint", text: plural(doTipo.length, "obra", "obras") })
        ),
        gradeObras(doTipo, { aoMudar: recarregar })
      )
    );
  }

  return blocos;
}

export async function telaArtista(container, parametros) {
  const recarregar = () => telaArtista(container, parametros);

  trocar(container, esqueletoGrade(8));

  let dados;
  try {
    dados = await api.artista(parametros.id);
  } catch (erro) {
    if (erro instanceof ErroApi && erro.status === 404) {
      trocar(container, vazio("Artista não encontrado", "O endereço não corresponde a nenhum artista."));
      return;
    }
    if (erro instanceof ErroApi && (erro.status === 503 || erro.status === 0)) {
      trocar(
        container,
        vazio(
          "A fonte externa está indisponível",
          "A página do artista vem da integração externa. Tente de novo em instantes."
        )
      );
      return;
    }
    avisarErro(erro instanceof ErroApi ? erro.message : "Nao consegui carregar o artista.");
    trocar(container, vazio("Não deu para carregar", "Recarregue a página em instantes."));
    return;
  }

  const { artista, lancamentos } = dados;
  document.title = `${artista.name} — Sonora`;

  const noSonora = lancamentos.filter((item) => item.noSonora).length;

  trocar(
    container,
    ficha(artista),
    lancamentos.length > 0
      ? el(
          "p",
          { class: "texto-faint" },
          `${plural(lancamentos.length, "lançamento", "lançamentos")} na discografia` +
            (noSonora > 0 ? ` · ${noSonora} já no Sonora` : "")
        )
      : null,
    lancamentos.length > 0
      ? discografia(lancamentos, recarregar)
      : vazio(
          "Sem discografia disponível",
          artista.somenteLocal
            ? "Este artista foi criado por um cadastro manual e não existe na fonte externa, então não há discografia para listar."
            : "A fonte externa não trouxe álbuns, EPs ou singles para este artista."
        )
  );
}
