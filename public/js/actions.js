// Acoes que varias telas compartilham: registrar escuta, avaliar, favoritar e
// guardar no Quero ouvir. Ficam juntas para o tratamento de erro e a pergunta
// do §32 nao serem reescritos em cada tela.

import { api, ErroApi } from "./api.js";
import { abrirRegistro } from "./registro.js";
import { avisarErro, avisarOk, confirmar } from "./ui.js";

const mensagem = (erro, reserva) => (erro instanceof ErroApi ? erro.message : reserva);

/**
 * Normaliza qualquer forma de obra que a API devolve: linha do banco, resultado
 * de pesquisa ou item de lista.
 *
 * O campo que importa e' `ref`: e' com ele que a interface fala do lancamento.
 * Quando a obra ja esta no Sonora, `ref` e' o id local; quando ela so existe na
 * fonte externa, e' o MBID. Isso e' o que permite abrir e interagir com uma
 * obra que nunca foi persistida (§13).
 */
export function normalizarObra(bruto) {
  const id = bruto.id ?? bruto.release_id ?? null;
  const mbid = bruto.mbid ?? null;

  return {
    id,
    mbid,
    ref: String(bruto.ref ?? id ?? mbid ?? ""),
    title: bruto.title || "",
    type: bruto.type || null,
    releaseYear: bruto.release_year ?? bruto.releaseYear ?? null,
    releaseDate: bruto.release_date ?? bruto.releaseDate ?? null,
    // Precisao original da data: "1997", "1997-05" ou "1997-05-21" (§17).
    releaseDateText: bruto.release_date_text ?? bruto.releaseDateText ?? null,
    coverUrl: bruto.cover_url ?? bruto.coverUrl ?? null,
    genres: bruto.genres || [],
    origin: bruto.origin || null,
    artistId: bruto.artist_id ?? bruto.artistId ?? null,
    artistMbid: bruto.artist_mbid ?? bruto.artistMbid ?? bruto.artista?.mbid ?? null,
    artistName: bruto.artist_name ?? bruto.artistName ?? bruto.artista?.name ?? "",
    notaMedia: bruto.nota_media ?? bruto.notaMedia ?? null,
    minhaNota: bruto.minha_nota ?? bruto.minhaNota ?? null,
    escutas: bruto.escutas ?? 0,
    totalNotas: bruto.total_notas ?? 0,
    totalReviews: bruto.total_reviews ?? 0,
    noSonora: bruto.noSonora ?? Boolean(id),
  };
}

/** Endereco da obra. Aceita id local ou MBID — as duas rotas funcionam. */
export const linkObra = (obra) =>
  `/obra/${encodeURIComponent(obra.ref || obra.id || obra.mbid || "")}`;

/** Endereco do artista. Preferimos o MBID, porque a pagina vem da API (§38). */
export const linkArtista = (obra) => {
  const alvo = obra.artistMbid || obra.artist_mbid || obra.artistId || obra.artist_id;
  return alvo ? `/artista/${encodeURIComponent(alvo)}` : null;
};

export const linkPerfil = (username) => `/u/${encodeURIComponent(username)}`;

/**
 * Pergunta do §32.
 *
 * Quando a escuta e' registrada e a obra esta no Quero ouvir, o servidor devolve
 * `perguntarQueroOuvir: true` — e nunca remove por conta propria. Quem decide e'
 * a pessoa, aqui.
 */
async function talvezSairDoQueroOuvir(resposta, obra) {
  if (!resposta?.perguntarQueroOuvir) return;

  const remover = await confirmar({
    titulo: "Tirar do Quero ouvir?",
    mensagem: `"${obra.title}" está no seu Quero ouvir e você acabou de registrar uma escuta. Quer remover da lista ou manter?`,
    textoConfirmar: "Remover",
    textoCancelar: "Manter",
    perigo: false,
  });

  if (!remover) return;

  try {
    await api.removerQueroOuvir(obra.ref);
    avisarOk("Tirado do Quero ouvir.");
  } catch (erro) {
    avisarErro(mensagem(erro, "Nao consegui atualizar o Quero ouvir."));
  }
}

/**
 * Registra uma escuta em um clique (§26). Escuta e' independente de nota: dá
 * para marcar que ouviu sem avaliar nada.
 */
export async function registrarEscuta(obraBruta, { listenedOn = null } = {}) {
  const obra = normalizarObra(obraBruta);
  try {
    const resposta = await api.registrarEscuta(obra.ref, listenedOn || undefined);
    avisarOk("Escuta registrada.");
    await talvezSairDoQueroOuvir(resposta, obra);
    return true;
  } catch (erro) {
    avisarErro(mensagem(erro, "Nao consegui registrar a escuta."));
    return false;
  }
}

/** Abre o formulario de nota e review (§29, §30). */
export function abrirAvaliacao(obraBruta, { nota = null, texto = "", aoConcluir } = {}) {
  const obra = normalizarObra(obraBruta);
  abrirRegistro({
    obra,
    nota,
    texto,
    aoConcluir,
    aoPerguntarQueroOuvir: (resposta) => talvezSairDoQueroOuvir(resposta, obra),
  });
}

/** Avalia direto, sem formulario — usado nas acoes rapidas do cartao. */
export async function avaliar(obraBruta, nota) {
  const obra = normalizarObra(obraBruta);
  try {
    const resposta = await api.avaliar(obra.ref, nota);
    avisarOk("Avaliação salva.");
    await talvezSairDoQueroOuvir(resposta, obra);
    return true;
  } catch (erro) {
    avisarErro(mensagem(erro, "Nao consegui salvar a avaliacao."));
    return false;
  }
}

/** Favoritos (§31). */
export async function alternarFavorito(obraBruta, jaEra) {
  const obra = normalizarObra(obraBruta);
  try {
    if (jaEra) {
      await api.desfavoritar(obra.ref);
      avisarOk("Removido dos favoritos.");
    } else {
      await api.favoritar(obra.ref);
      avisarOk("Adicionado aos favoritos.");
    }
    return !jaEra;
  } catch (erro) {
    avisarErro(mensagem(erro, "Nao consegui atualizar os favoritos."));
    return jaEra;
  }
}

/** Quero ouvir (§32). */
export async function alternarQueroOuvir(obraBruta, jaEsta) {
  const obra = normalizarObra(obraBruta);
  try {
    if (jaEsta) {
      await api.removerQueroOuvir(obra.ref);
      avisarOk("Removido do Quero ouvir.");
    } else {
      await api.adicionarQueroOuvir(obra.ref);
      avisarOk("Guardado no Quero ouvir.");
    }
    return !jaEsta;
  } catch (erro) {
    avisarErro(mensagem(erro, "Nao consegui atualizar o Quero ouvir."));
    return jaEsta;
  }
}
