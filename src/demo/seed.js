"use strict";

/**
 * Semente do modo demonstracao.
 *
 * O catalogo aqui representa obras que "alguem ja tocou" — e isso importa: no
 * modelo oficial o banco local nao e' o catalogo, e so guarda obras com
 * interacao ou cadastradas a mao (§13). Logo, tudo o que esta semeado tem
 * escuta, nota, review, favorito, quero ouvir ou presenca em lista.
 *
 * Os metadados sao reais — MBID, titulo, tipo, ano e generos vieram do
 * MusicBrainz e estao fixados aqui de proposito, para o boot nao depender de 23
 * consultas a um servico limitado a 1 req/s. As capas sao buscadas no Cover Art
 * Archive na subida, entao aparecem de verdade.
 *
 * Ficticio e' apenas o conteudo social: pessoas, escutas, notas, reviews e
 * listas — e uma unica obra de cadastro manual, para a origem (§46) e a
 * administracao de catalogo manual (§45) terem o que mostrar.
 */

const bcrypt = require("bcryptjs");

const caa = require("../music/coverart");
const { SENHA_DEMO } = require("./config");
const store = require("./store");

// Menos rounds que em producao (12): a senha aqui e' publica e o boot tem que ser
// rapido. O caminho real de autenticacao nao muda.
const ROUNDS_DEMO = 8;

const PESSOAS = [
  {
    username: "leo",
    email: "leo@exemplo.test",
    displayName: "Leonardo Araujo",
    isAdmin: true,
    bio: "Ouço disco inteiro, na ordem, do começo ao fim. Fase: post-punk e shoegaze.",
  },
  {
    username: "marina",
    email: "marina@exemplo.test",
    displayName: "Marina Yamada",
    bio: "Colecionadora de vinil e de opiniões impopulares sobre segundo álbum de banda boa.",
  },
  {
    username: "caio",
    email: "caio@exemplo.test",
    displayName: "Caio Bernardes",
    bio: "Grunge, noise e qualquer coisa com guitarra suja o suficiente.",
  },
  {
    username: "ju",
    email: "ju@exemplo.test",
    displayName: "Juliana Rocha",
    bio: "Dream pop, 4AD e reverb. Fazendo a lição de casa do shoegaze inglês.",
  },
  {
    username: "rafa",
    email: "rafa@exemplo.test",
    displayName: "Rafael Duarte",
    bio: "Escuto tudo uma vez. O que fica, escuto trezentas.",
  },
];

/**
 * 17 albuns, 3 EPs e 3 singles vindos da API (origem API, §46). MBIDs reais do
 * MusicBrainz, resolvidos uma vez e fixados aqui.
 */
const CURADORIA = [
  { mbid: "b1392450-e666-3926-a536-22c65f834433", title: "OK Computer", type: "ALBUM", year: 1997, date: "1997-05-21",
    artist: { name: "Radiohead", mbid: "a74b1b7f-71a5-4011-9441-d0b5e4122711" },
    genres: ["alternative rock", "rock", "art rock", "experimental"] },
  { mbid: "cb76227e-3ac0-3002-9a10-615a5b73cc59", title: "Loveless", type: "ALBUM", year: 1991, date: "1991-11-04",
    artist: { name: "my bloody valentine", mbid: "8ca01f46-53ac-4af2-8516-55a909c0905e" },
    genres: ["shoegaze", "noise pop", "rock", "alternative rock"] },
  { mbid: "46482030-ef12-319c-9c5a-5d04c39d574b", title: "Souvlaki", type: "ALBUM", year: 1993, date: "1993-06-01",
    artist: { name: "Slowdive", mbid: "a16371b9-7d36-497a-a9d4-42b0a0440c5e" },
    genres: ["shoegaze", "dream pop", "rock", "alternative rock"] },
  { mbid: "42352def-1aab-3000-b548-895ebd869cb6", title: "Unknown Pleasures", type: "ALBUM", year: 1979, date: "1979-06-15",
    artist: { name: "Joy Division", mbid: "9a58fda3-f4ed-4080-a3a5-f457aac9fcdd" },
    genres: ["post-punk", "gothic rock", "rock"] },
  { mbid: "494bf606-d2f7-36d0-8340-eadad8601d2b", title: "Disintegration", type: "ALBUM", year: 1989, date: "1989-05-01",
    artist: { name: "The Cure", mbid: "69ee3720-a7cb-4402-b48d-a02c366f2bcf" },
    genres: ["gothic rock", "alternative rock", "post-punk", "new wave"] },
  { mbid: "1b022e01-4da6-387b-8658-8678046e4cef", title: "Nevermind", type: "ALBUM", year: 1991, date: "1991-09-24",
    artist: { name: "Nirvana", mbid: "5b11f4ce-a62d-471e-81fc-a69a8278c7da" },
    genres: ["grunge", "alternative rock", "rock", "punk rock"] },
  { mbid: "1aa41b19-5a72-341b-bd91-4cf61d1dab6b", title: "Doolittle", type: "ALBUM", year: 1989, date: "1989-04-17",
    artist: { name: "Pixies", mbid: "b6b2bb8d-54a9-491f-9607-7b546023b433" },
    genres: ["alternative rock", "indie rock", "rock"] },
  { mbid: "8f310800-045b-3e12-8268-50b3d33a2267", title: "In the Aeroplane Over the Sea", type: "ALBUM", year: 1998, date: "1998-02-10",
    artist: { name: "Neutral Milk Hotel", mbid: "a506f761-2c22-4b2f-8a94-bd748c2c8f75" },
    genres: ["indie rock", "indie folk", "lo-fi", "rock"] },
  { mbid: "d8dde278-482c-3cc8-a530-fea70476f3a5", title: "The Queen Is Dead", type: "ALBUM", year: 1986, date: "1986-06-16",
    artist: { name: "The Smiths", mbid: "40f5d9e4-2de7-4f2d-ad41-e31a9a9fea27" },
    genres: ["jangle pop", "indie pop", "indie rock", "post-punk"] },
  { mbid: "24769a99-8189-3d8c-947e-dbc8574dad5c", title: "Daydream Nation", type: "ALBUM", year: 1988, date: null,
    artist: { name: "Sonic Youth", mbid: "5cbef01b-cc35-4f52-af7b-d0df0c4f61b9" },
    genres: ["alternative rock", "rock", "noise rock", "post-punk"] },
  { mbid: "12fab6b9-4eaf-33b0-963e-cae03ac332fe", title: "Heaven or Las Vegas", type: "ALBUM", year: 1990, date: "1990-08-21",
    artist: { name: "Cocteau Twins", mbid: "000fc734-b7e1-4a01-92d1-f544261b43f5" },
    genres: ["dream pop", "rock", "shoegaze"] },
  { mbid: "8e40a68c-58e8-3c92-a763-645fda2ce8a7", title: "American Football", type: "ALBUM", year: 1999, date: "1999-09-14",
    artist: { name: "American Football", mbid: "4ebb5ad3-9018-407d-8c24-c03011ab9ac6" },
    genres: ["emo", "rock", "post-rock", "alternative rock"] },
  { mbid: "12e88251-2cde-3bea-9cee-2d8c7fe65039", title: "Diary", type: "ALBUM", year: 1994, date: "1994-05-10",
    artist: { name: "Sunny Day Real Estate", mbid: "86b24e8f-a4d9-4c84-83ee-fde0d14ad9fa" },
    genres: ["emo", "rock", "alternative rock", "indie rock"] },
  { mbid: "92d8f0c4-8c64-3bee-bee1-812a70e77efa", title: "Dirt", type: "ALBUM", year: 1992, date: "1992-09-29",
    artist: { name: "Alice in Chains", mbid: "4bd95eea-b9f6-4d70-a36c-cfea77431553" },
    genres: ["grunge", "alternative metal", "alternative rock", "hard rock"] },
  { mbid: "e7227840-5ef2-3813-af26-15dab34e1a51", title: "Turn On the Bright Lights", type: "ALBUM", year: 2002, date: "2002-08-19",
    artist: { name: "Interpol", mbid: "b23e8a63-8f47-4882-b55b-df2c92ef400e" },
    genres: ["rock", "indie rock", "post-punk revival", "post-punk"] },
  { mbid: "efea26d1-a016-30f6-b8e2-bc8c02336b0a", title: "Is This It", type: "ALBUM", year: 2001, date: "2001-01-27",
    artist: { name: "The Strokes", mbid: "f181961b-20f7-459e-89de-920ef03c7ed0" },
    genres: ["rock", "indie rock", "garage rock revival"] },
  { mbid: "58f1a60f-6b86-449a-8f4d-dd481b70db5c", title: "Bloodsports", type: "ALBUM", year: 2013, date: "2013-03-10",
    artist: { name: "Suede", mbid: "a55c2f1b-3f3f-4d6a-aa30-5e186dbadce6" },
    genres: ["rock", "britpop", "glam rock"] },
  { mbid: "fd8ae63d-8519-3234-880f-b60585715ec9", title: "Glider", type: "EP", year: 1990, date: "1990-04-23",
    artist: { name: "My Bloody Valentine", mbid: "8ca01f46-53ac-4af2-8516-55a909c0905e" },
    genres: ["rock", "shoegaze"] },
  { mbid: "d123a649-b909-3303-9a78-dc26b8b6d328", title: "Slowdive", type: "EP", year: 1990, date: "1990-11-05",
    artist: { name: "Slowdive", mbid: "a16371b9-7d36-497a-a9d4-42b0a0440c5e" },
    genres: ["rock", "shoegaze", "indie rock", "dream pop"] },
  { mbid: "4fcc5ec2-d177-396b-b810-9439031b3c3a", title: "Hormoaning", type: "EP", year: 1992, date: "1992-01-27",
    artist: { name: "Nirvana", mbid: "5b11f4ce-a62d-471e-81fc-a69a8278c7da" },
    genres: ["grunge", "punk rock", "rock", "noise rock"] },
  { mbid: "d4e6c019-a6df-38fb-b6aa-7861d71b5543", title: "Love Will Tear Us Apart", type: "SINGLE", year: 1980, date: "1980-04-18",
    artist: { name: "Joy Division", mbid: "9a58fda3-f4ed-4080-a3a5-f457aac9fcdd" },
    genres: ["new wave", "rock", "post-punk", "synth-pop"] },
  { mbid: "03345972-d2f8-36bb-b49a-03a9ceccb7a7", title: "Smells Like Teen Spirit", type: "SINGLE", year: 1991, date: "1991-09-10",
    artist: { name: "Nirvana", mbid: "5b11f4ce-a62d-471e-81fc-a69a8278c7da" },
    genres: ["grunge", "rock"] },
  { mbid: "49945a24-096a-3e99-aa1b-5226e39b44af", title: "How Soon is Now?", type: "SINGLE", year: 1984, date: null,
    artist: { name: "The Smiths", mbid: "40f5d9e4-2de7-4f2d-ad41-e31a9a9fea27" },
    genres: ["indie rock", "rock", "post-punk", "jangle pop"] },
];

/**
 * Obra de cadastro manual (§16, §17). Entra como indice 23 do acervo, logo
 * depois da curadoria, e e' a unica com origem MANUAL — e' o exemplo vivo do
 * selo de origem (§46) e o alvo da administracao de catalogo manual (§45).
 */
const MANUAIS = [
  {
    p: 0,
    title: "Som do Porão",
    type: "EP",
    year: 2024,
    date: "2024-08-09",
    artistName: "Fita Virgem",
    coverUrl: "/img/capa-manual.svg",
    genres: ["post-punk", "lo-fi"],
  },
];

/**
 * Escutas, notas e reviews — tres coisas independentes (§27).
 *
 * `o` = indice da obra no acervo, `p` = indice da pessoa, `dias` = dias atras.
 * Linha sem `nota` registra escuta sem avaliar; linha sem `texto` registra
 * escuta e nota sem review. A mesma obra pode aparecer varias vezes para a
 * mesma pessoa: cada linha e' uma escuta no historico (§26, §33).
 */
const REGISTROS = [
  { o: 0, p: 0, nota: 5, dias: 2, texto: "Vinte e cinco anos depois ainda soa como um disco que chegou adiantado. Ouvi de fone, à noite, e Let Down me pegou do mesmo jeito da primeira vez. Não é nostalgia: é arranjo." },
  { o: 0, p: 1, nota: 4.5, dias: 6, texto: "Perfeito? Quase. Tem dois minutos no meio do disco que eu pularia. Mas a sequência final é das melhores que existem." },
  { o: 0, p: 4, nota: 5, dias: 21 },

  { o: 1, p: 3, nota: 5, dias: 1, texto: "Não é um disco que você ouve, é um disco em que você entra. Levei anos para entender que a guitarra abafada é o ponto, não um defeito de mixagem." },
  { o: 1, p: 0, nota: 5, dias: 9, texto: "O tipo de gravação que faz o resto da década parecer tímida." },
  { o: 1, p: 2, nota: 4, dias: 17, texto: "Reconheço a importância e gosto de metade. A outra metade eu respeito de longe." },

  { o: 2, p: 3, nota: 4.5, dias: 3, texto: "Se Loveless é uma parede, Souvlaki é uma janela aberta. Alison em repeat por uma semana inteira." },
  { o: 2, p: 1, nota: 4.5, dias: 13 },

  { o: 3, p: 0, nota: 5, dias: 4, texto: "Gravado em Manchester, soa como se tivesse sido gravado dentro de um prédio vazio. A produção do Hannett é metade do disco." },
  { o: 3, p: 4, nota: 4.5, dias: 19, texto: "She's Lost Control é o momento em que o post-punk descobre o que ele queria ser." },

  { o: 4, p: 1, nota: 5, dias: 5, texto: "Uma hora e dez de melancolia bem produzida. Plainsong abrindo o disco é entrada triunfal de tristeza." },
  { o: 4, p: 3, nota: 4.5, dias: 24 },

  { o: 5, p: 2, nota: 4.5, dias: 7, texto: "O disco que mudou a indústria e, por isso mesmo, quase impossível de ouvir sem o peso do contexto. Ainda assim, Drain You continua imbatível." },
  { o: 5, p: 0, nota: 4, dias: 26 },

  { o: 6, p: 2, nota: 5, dias: 8, texto: "Dinâmica alto-baixo antes de virar fórmula. Debaser abre o disco gritando e ninguém reclama." },
  { o: 6, p: 1, nota: 4.5, dias: 22 },

  { o: 7, p: 4, nota: 4.5, dias: 10, texto: "Gravação suja, letra desconcertante, e mesmo assim é um dos discos mais afetuosos que eu conheço." },

  { o: 8, p: 1, nota: 4.5, dias: 11, texto: "Guitarra do Marr fazendo o trabalho de uma orquestra. A letra divide opiniões e eu estou do lado que gosta." },
  { o: 8, p: 0, nota: 4, dias: 28 },

  { o: 9, p: 2, nota: 4.5, dias: 12, texto: "Barulho organizado com precisão. Teen Age Riot é a melhor abertura de disco dos anos 80." },

  { o: 10, p: 3, nota: 5, dias: 6, texto: "A voz é um instrumento e a letra é quase irrelevante — e isso é elogio. Disco mais bonito da 4AD." },
  { o: 10, p: 1, nota: 4.5, dias: 27 },

  { o: 11, p: 4, nota: 4.5, dias: 14, texto: "Compasso quebrado, guitarra limpa e vinte e um anos de idade. Nunca precisou de segundo disco para virar referência." },
  { o: 11, p: 0, nota: 4, dias: 30 },

  { o: 12, p: 4, nota: 4, dias: 16, texto: "Emo antes da palavra virar rótulo de roupa. Seven é o motivo pelo qual metade das bandas dos anos 2000 existe." },

  { o: 13, p: 2, nota: 4.5, dias: 15, texto: "Mais pesado e mais escuro que qualquer coisa que Seattle produziu no mesmo ano. Voz do Layne é o disco inteiro." },

  { o: 14, p: 0, nota: 4.5, dias: 18, texto: "Chamar de cópia de Joy Division é preguiça. O baixo do Carlos D sustenta o disco todo." },
  { o: 14, p: 4, nota: 4, dias: 29 },

  { o: 15, p: 4, nota: 4, dias: 20, texto: "Trinta e cinco minutos sem gordura nenhuma. Envelheceu melhor do que a década que o cercou." },
  { o: 15, p: 2, nota: 3.5, dias: 25, texto: "Divertido, direto, meio igual do começo ao fim. Gosto sem achar que é obra-prima." },

  { o: 17, p: 3, nota: 4, dias: 23, texto: "EP que funciona melhor que muito álbum. Soon é o rascunho do que Loveless viria a ser." },
  { o: 18, p: 3, nota: 4, dias: 31 },
  { o: 20, p: 0, nota: 5, dias: 34, texto: "Um single de três minutos que resume uma vida inteira. Difícil de ouvir sabendo o final." },
  { o: 21, p: 2, nota: 4, dias: 36 },
  { o: 22, p: 1, nota: 4.5, dias: 38, texto: "O riff mais reconhecível do Marr, e o disco onde ele cabia menos. Ainda assim, perfeito." },

  // Obra manual: quem cadastrou ouviu e avaliou.
  { o: 23, p: 0, nota: 4, dias: 5, texto: "Gravado em casa, mixado às pressas e melhor por isso. Não está na MusicBrainz, cadastrei a mão." },
  { o: 23, p: 2, nota: 3.5, dias: 12 },

  // Escuta sem nota: separar escuta de avaliacao e' requisito (§27).
  { o: 9, p: 0, dias: 1 },
  { o: 16, p: 1, dias: 3 },
  { o: 19, p: 4, dias: 4 },

  // Reescutas: a mesma obra aparece mais de uma vez no historico (§33).
  { o: 0, p: 0, dias: 210 },
  { o: 1, p: 3, dias: 165 },
  { o: 3, p: 0, dias: 96 },
];

/** Listas nascem publicas (§35); uma delas e' privada de proposito. */
const LISTAS = [
  {
    p: 0,
    title: "Discos que me pegaram de jeito",
    description: "Ordem de impacto, não de qualidade. Todos ouvidos inteiros, mais de uma vez, sem pular faixa.",
    visibility: "PUBLIC",
    itens: [
      { o: 3, comment: "Soa como um prédio vazio em Manchester." },
      { o: 0, comment: "Chegou adiantado e ninguém avisou." },
      { o: 1, comment: "Não se ouve, se entra." },
      { o: 4, comment: "Uma hora e dez de melancolia bem produzida." },
      { o: 14, comment: "O baixo sustenta tudo." },
    ],
  },
  {
    p: 3,
    title: "Shoegaze para começar",
    description: "Para quem quer entender o gênero e não sabe por onde. Na ordem em que eu apresentaria.",
    visibility: "PUBLIC",
    itens: [
      { o: 2, comment: "Comece por aqui: é o mais acolhedor." },
      { o: 18, comment: "O EP que veio antes, mais cru." },
      { o: 10, comment: "Dream pop puro, para o ouvido descansar." },
      { o: 1, comment: "Agora sim: a parede de som." },
      { o: 17, comment: "O rascunho de Loveless." },
    ],
  },
  {
    p: 2,
    title: "Post-punk essencial",
    description: "Guitarra seca, baixo na frente, bateria alta na mixagem.",
    visibility: "PUBLIC",
    itens: [{ o: 3 }, { o: 20 }, { o: 4 }, { o: 14 }],
  },
  {
    p: 1,
    title: "Rascunho: presentes de fim de ano",
    description: "Ainda escolhendo. Privada até eu decidir.",
    visibility: "PRIVATE",
    itens: [
      { o: 8, comment: "Para a Ju." },
      { o: 15, comment: "Para o Caio, se ele ainda não tiver." },
    ],
  },
];

const FAVORITOS = [
  { p: 0, obras: [3, 0, 1, 4, 14] },
  { p: 1, obras: [4, 8, 0, 22] },
  { p: 2, obras: [6, 9, 13, 5] },
  { p: 3, obras: [1, 10, 2, 17] },
  { p: 4, obras: [11, 7, 15] },
];

const QUERO_OUVIR = [
  { p: 0, obras: [12, 19] },
  { p: 3, obras: [16, 9] },
  { p: 2, obras: [22] },
];

const diasAtras = (dias) => new Date(Date.now() - dias * 86400000);
const paraIsoLocal = (data) =>
  `${data.getFullYear()}-${String(data.getMonth() + 1).padStart(2, "0")}-${String(
    data.getDate()
  ).padStart(2, "0")}`;

async function criarPessoas() {
  const hash = await bcrypt.hash(SENHA_DEMO, ROUNDS_DEMO);
  const criadas = [];

  for (const pessoa of PESSOAS) {
    const linha = await store.users.create({
      username: pessoa.username,
      email: pessoa.email,
      displayName: pessoa.displayName,
      passwordHash: hash,
      isAdmin: Boolean(pessoa.isAdmin),
    });
    await store.users.updateProfile(linha.id, { bio: pessoa.bio });
    criadas.push(linha);
  }
  return criadas;
}

/** Busca as capas em pequenos lotes, para nao abrir 23 conexoes de uma vez. */
async function buscarCapas(obras, tamanhoDoLote = 6) {
  const capas = new Map();

  for (let inicio = 0; inicio < obras.length; inicio += tamanhoDoLote) {
    const lote = obras.slice(inicio, inicio + tamanhoDoLote);
    const resultados = await Promise.all(lote.map((obra) => caa.capaOuNulo(obra.mbid)));
    lote.forEach((obra, indice) => capas.set(obra.mbid, resultados[indice]));
  }
  return capas;
}

async function montarCatalogo(pessoas) {
  const capas = await buscarCapas(CURADORIA);
  const acervo = [];

  for (const obra of CURADORIA) {
    const artista = await store.artists.garantir({
      name: obra.artist.name,
      mbid: obra.artist.mbid,
      origin: "API",
      createdBy: pessoas[0].id,
    });

    const { id } = await store.releases.criar({
      mbid: obra.mbid,
      title: obra.title,
      artistId: artista.id,
      type: obra.type,
      releaseDate: obra.date,
      releaseYear: obra.year,
      coverUrl: capas.get(obra.mbid),
      genres: obra.genres,
      origin: "API",
      createdBy: pessoas[0].id,
    });
    acervo.push(id);
  }

  for (const obra of MANUAIS) {
    const autor = pessoas[obra.p];
    const artista = await store.artists.garantir({
      name: obra.artistName,
      origin: "MANUAL",
      createdBy: autor.id,
    });

    const { id } = await store.releases.criar({
      title: obra.title,
      artistId: artista.id,
      type: obra.type,
      releaseDate: obra.date,
      releaseYear: obra.year,
      coverUrl: obra.coverUrl,
      genres: obra.genres,
      origin: "MANUAL",
      createdBy: autor.id,
    });
    acervo.push(id);
  }

  const comCapa = [...capas.values()].filter(Boolean).length;
  return { acervo, comCapa };
}

/**
 * Datas retroativas nas notas e reviews.
 *
 * Os repositorios reais gravam `now()` e nao aceitam data de criacao — e' assim
 * que tem que ser. Para a demonstracao parecer vivida, ajustamos as linhas em
 * memoria depois de gravar, direto nas tabelas do store. Gambiarra consciente,
 * restrita ao modo demonstracao.
 */
function retroagirNota(userId, releaseId, quando) {
  const linha = store.tabelas.ratings.find(
    (x) => x.user_id === userId && x.release_id === releaseId
  );
  if (linha) {
    linha.created_at = quando;
    linha.updated_at = quando;
  }
}

function retroagirReview(userId, releaseId, quando) {
  const linha = store.tabelas.reviews.find(
    (x) => x.user_id === userId && x.release_id === releaseId
  );
  if (linha) {
    linha.created_at = quando;
    linha.updated_at = quando;
  }
}

function retroagirEscuta(listenId, quando) {
  const linha = store.tabelas.listens.find((x) => x.id === listenId);
  if (linha) linha.created_at = quando;
}

/**
 * Cria escutas, notas e reviews. Como a nota e a review sao uma por obra, as
 * linhas mais recentes da lista mandam no valor final — o que e' exatamente o
 * comportamento do app: avaliar de novo substitui a nota anterior (§29).
 */
async function criarRegistros(pessoas, acervo) {
  const contagem = { escutas: 0, notas: 0, reviews: 0 };

  // Do mais antigo para o mais novo, para a ultima palavra ser a mais recente.
  const ordenados = [...REGISTROS].sort((a, b) => b.dias - a.dias);

  for (const registro of ordenados) {
    const releaseId = acervo[registro.o];
    const pessoa = pessoas[registro.p];
    if (!releaseId || !pessoa) continue;

    const quando = diasAtras(registro.dias);

    const escuta = await store.listens.criar(pessoa.id, releaseId, paraIsoLocal(quando));
    retroagirEscuta(escuta.id, quando);
    contagem.escutas += 1;

    if (registro.nota) {
      await store.ratings.salvar(pessoa.id, releaseId, registro.nota);
      retroagirNota(pessoa.id, releaseId, quando);
      contagem.notas += 1;
    }

    if (registro.texto) {
      await store.reviews.salvar(pessoa.id, releaseId, registro.texto);
      retroagirReview(pessoa.id, releaseId, quando);
      contagem.reviews += 1;
    }
  }
  return contagem;
}

async function criarListas(pessoas, acervo) {
  for (const modelo of LISTAS) {
    const dono = pessoas[modelo.p];
    if (!dono) continue;

    const { id } = await store.lists.criar({
      userId: dono.id,
      title: modelo.title,
      description: modelo.description,
      visibility: modelo.visibility,
    });

    const itens = modelo.itens
      .filter((item) => acervo[item.o])
      .map((item) => ({ releaseId: acervo[item.o], comment: item.comment || "" }));

    if (itens.length > 0) await store.lists.substituirItens(id, itens);
  }
}

async function criarMarcas(pessoas, acervo) {
  for (const grupo of FAVORITOS) {
    const pessoa = pessoas[grupo.p];
    if (!pessoa) continue;
    for (const indice of grupo.obras) {
      if (acervo[indice]) await store.releases.favoritar(pessoa.id, acervo[indice]);
    }
  }

  for (const grupo of QUERO_OUVIR) {
    const pessoa = pessoas[grupo.p];
    if (!pessoa) continue;
    for (const indice of grupo.obras) {
      if (acervo[indice]) await store.releases.adicionarQueroOuvir(pessoa.id, acervo[indice]);
    }
  }
}

/**
 * Popula o acervo. As pessoas nascem primeiro e o login e' liberado na hora; as
 * capas e o resto chegam em segundo plano.
 */
async function semear() {
  const inicio = Date.now();

  try {
    const pessoas = await criarPessoas();
    console.log(`[demo] ${pessoas.length} pessoas criadas (senha: ${SENHA_DEMO})`);
    store.marcarPronto();

    const { acervo, comCapa } = await montarCatalogo(pessoas);
    const contagem = await criarRegistros(pessoas, acervo);
    await criarListas(pessoas, acervo);
    await criarMarcas(pessoas, acervo);

    console.log(
      `[demo] acervo pronto em ${Date.now() - inicio}ms: ${acervo.length} lancamentos ` +
        `(${comCapa} com capa, ${MANUAIS.length} manual), ${contagem.escutas} escutas, ` +
        `${contagem.notas} notas, ${contagem.reviews} reviews, ${LISTAS.length} listas`
    );
  } catch (err) {
    console.error("[demo] falha ao montar o acervo:", err.message);
    store.marcarPronto();
  }
}

module.exports = { semear };
