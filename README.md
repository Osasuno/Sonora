# Sonora — plataforma social de música

> As pessoas registram o que ouviram, avaliam, escrevem reviews, organizam
> favoritos e listas e constroem uma identidade musical própria.

A plataforma **não reproduz música**. Ela atua na camada complementar ao
streaming: streaming é onde você ouve; aqui é onde você registra e expressa a sua
relação com o que ouviu.

**Estado:** MVP alinhado à especificação oficial (`00 — CONTEXTO MESTRE — SONORA
— ESPECIFICAÇÃO OFICIAL DO MVP.md`). Os 57 critérios de aceitação do §68 estão
atendidos. A persistência oficial é PostgreSQL: em produção, o banco do
**Supabase**, com o servidor publicado no **Render** (veja
[Publicação](#publicação-render--supabase)).

---

## A ideia central: duas perguntas, duas fontes

Esta é a divisão que organiza o projeto inteiro (§14):

| Pergunta | Quem responde |
|---|---|
| "Que obra é essa?" | MusicBrainz e Cover Art Archive |
| "Qual a relação das pessoas com essa obra?" | o Sonora |

Daí decorre a regra que mais afeta o uso (§12, §39):

> **O MusicBrainz é a fonte normal da pesquisa.**

Encontrar um álbum **não depende** de alguém já tê-lo cadastrado aqui. Você
pesquisa, a obra aparece, você abre a página — e nada é salvo. A obra só entra no
banco do Sonora quando alguém interage com ela: registra escuta, avalia,
escreve review, favorita, guarda no Quero ouvir ou coloca numa lista (§13, §15).

Por isso o menu tem dois lugares distintos:

- **Pesquisar** — a fonte externa, catálogo completo, qualquer gênero
- **No Sonora** — o que a comunidade trouxe para dentro, com notas, escutas e reviews para filtrar

---

## Escuta, avaliação e review são três coisas diferentes

Este é o ponto que a especificação trata como refatoração obrigatória (§27, §50):
não existe uma tabela única de "registro". São entidades independentes.

| Entidade | Quantidade | O que significa |
|---|---|---|
| **Escuta** | muitas por usuário/obra | "ouvi isso, nesta data" — sem opinião nenhuma |
| **Avaliação** | uma atual por usuário/obra | nota de 0,5 a 5, de meia em meia (§29) |
| **Review** | uma atual por usuário/obra | texto, alterável, sem histórico de versões (§30) |

Consequências práticas, todas verificadas:

- dá para registrar escuta sem avaliar nada;
- dá para avaliar sem escrever review, e escrever review sem dar nota;
- **excluir a review remove somente a review** — escuta, nota, favorito e listas continuam (§55);
- publicar a **primeira** avaliação ou review registra uma escuta automática; **editar não registra outra** (§28);
- nota e review criadas na mesma ação geram **uma** escuta, não duas.

### Quero ouvir: o sistema pergunta, não decide

Ao registrar escuta de uma obra que está no Quero ouvir, o Sonora **pergunta** se
deve remover (§32). O servidor devolve `perguntarQueroOuvir: true` e a interface
mostra *Remover* ou *Manter*. Nunca remove por conta própria.

---

## Origem da obra

Cada lançamento carrega a origem e ela fica visível (§46):

```
Origem: MusicBrainz        Origem: Cadastro manual
```

É um selo, **nunca um link**: a especificação proíbe apontar para fora, para o
MusicBrainz, na interface (§46, §64). O crédito aparece em texto no rodapé.

---

## Cadastro manual é fallback, não atalho

O formulário nasce bloqueado. Para liberar, a fonte externa precisa **responder e
não encontrar** a obra (§16). Três desfechos:

| Situação | Resultado |
|---|---|
| a fonte encontrou | não libera; aponta a obra que já existe |
| a fonte respondeu e não achou | libera o formulário |
| a fonte está fora do ar | **não libera**; pede para tentar depois |

O terceiro caso é o que importa: liberar cadastro durante uma indisponibilidade
temporária encheria o catálogo de duplicatas. A verificação é refeita no servidor
no momento de gravar — o navegador não é a autoridade.

Campos obrigatórios (§17): título, artista, tipo, data de lançamento e capa (como
URL; upload está fora do escopo). Gênero é opcional de propósito, porque a
própria fonte externa nem sempre tem gênero. País **não** é exigido.

### Data sem inventar precisão

A data entra na precisão que se tem: `2024`, `2024-08` ou `2024-08-09`. Três
colunas sustentam isso, e vale igual para obra da API e obra manual:

| Coluna | Para que serve |
|---|---|
| `release_date_text` | precisão original, que é o que a interface mostra |
| `release_date` | data completa, quando se sabe o dia |
| `release_year` | ano, que é o que o filtro usa |

Mostrar "1 de janeiro de 1997" para uma obra que só informa o ano seria inventar
informação que a fonte não deu.

---

## Filtros e ordenações

Exatamente os do §40, e nenhum além deles:

tipo · artista · ano · gênero · avaliação · popularidade · mais recentes · ordem alfabética

Dois pontos onde a especificação é explícita sobre **não** tratar coisas
diferentes como iguais:

**Avaliação tem duas perspectivas (§41)** — média da comunidade e a minha
avaliação atual. São dois filtros, lado a lado.

**"Mais recentes" são duas ordenações (§43)**

| Ordenação | Critério |
|---|---|
| Lançamentos mais recentes | data de lançamento da obra |
| Recém-adicionados ao Sonora | data em que a obra entrou no catálogo local |

**Popularidade = quantidade de escutas (§42).** Não é número de reviews, nem de
favoritos, nem de avaliações, nem popularidade externa.

---

## Perfil musical

Sete áreas (§24), e são sete porque recortam coisas diferentes: Histórico ·
Obras ouvidas · Avaliações · Reviews · Favoritos · Quero ouvir · Listas.

As estatísticas separam **obras diferentes ouvidas** de **total de escutas** — a
segunda é maior quando a pessoa reouve. Também aparecem avaliações, reviews, nota
média e **contribuições manuais**.

Contribuição é só cadastro manual (§19). Encontrar uma obra pela fonte externa ou
ser a primeira pessoa a interagir com ela **não** conta.

---

## Listas

Nascem **públicas** e podem virar privadas (§35). Cada item aceita um
**comentário textual próprio** (§34) — não existe nota numérica do item, porque a
avaliação oficial é a do usuário para a obra.

Lista privada aparece só para o dono — e, no contexto de moderação, para um
administrador (§24). Listas públicas entram na exploração da comunidade (§36).

---

## Administração

Três frentes, e só estas três (§45):

| Frente | O que o administrador pode |
|---|---|
| Usuários | ver, criar, redefinir senha, conceder/remover admin, excluir |
| Obras manuais | editar e remover o que foi cadastrado à mão |
| Moderação | excluir reviews e listas de qualquer pessoa |

Dados vindos do MusicBrainz **não** são editáveis: a especificação diz que isso
não é requisito. E moderação, nesta versão, significa exatamente essas ações —
não há fila de denúncias, apelação, reputação, strike nem banimento.

---

## Fora do escopo, e por isso ausente

Reprodução de música e player, integração com Spotify/Apple Music/Deezer, feed
social, seguidores, curtidas, comentários em reviews, mensagens, recomendação
algorítmica, upload de capa, link externo para o MusicBrainz, app mobile,
monetização e sistema complexo de denúncias. Nada disso foi implementado.

---

## Como rodar

Passo a passo detalhado, roteiro de navegação e solução de problemas em
**[COMO-RODAR.md](COMO-RODAR.md)**. Versão curta:

```powershell
npm install
Copy-Item .env.example .env    # depois ponha DEMO_MODE=true no arquivo
npm start
```

Abra `http://localhost:8000` e entre com `leo` / `demo1234`.

Preencha no `.env` antes de subir para valer:

- `SESSION_SECRET` — string aleatória longa:
  `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
- `MUSICBRAINZ_CONTACT` — um e-mail de contato (o MusicBrainz exige identificação)
- `DATABASE_URL` — conexão do Postgres
- `ADMIN_BOOTSTRAP_USER` / `ADMIN_BOOTSTRAP_PASSWORD` — primeiro administrador

### Modo demonstração (temporário)

Sem banco disponível, ligue no `.env`:

```
DEMO_MODE=true
```

A aplicação monta em memória 23 obras reais da fonte externa (com capas do Cover
Art Archive), uma obra de cadastro manual, cinco pessoas fictícias, 43 escutas,
37 avaliações, 25 reviews e quatro listas — uma delas privada, para a regra de
visibilidade ter o que mostrar. Entre com **leo / demo1234**.

Isto é **apoio de desenvolvimento e não faz parte da versão alvo** (§61). Três
travas impedem que vaze para produção: exige `DEMO_MODE=true` explícito, desliga
sozinho se existir `DATABASE_URL` e desliga sozinho se `NODE_ENV=production`.

---

## Publicação (Render + Supabase)

O código fica neste repositório, o servidor roda no Render e os dados ficam no
Postgres do Supabase. O GitHub Pages não serve para isto: ele só publica arquivos
estáticos, e o Sonora depende do servidor Node para login, sessão e consultas ao
banco e ao MusicBrainz.

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/Osasuno/Sonora)

1. No Supabase, clique em **Connect**, escolha **Session pooler**, copie a URI e
   troque `[YOUR-PASSWORD]` pela senha do banco. A senha fica em
   **Project Settings → Database**, onde também dá para redefini-la.
2. Clique no botão acima, ou, no Render, use **New → Blueprint** e escolha este
   repositório. O serviço está descrito em [`render.yaml`](render.yaml).
3. O Render pede dois valores: `DATABASE_URL`, que é a URI do passo 1, e
   `ADMIN_BOOTSTRAP_PASSWORD`, a senha do primeiro administrador (mínimo de 8
   caracteres). O `SESSION_SECRET` é gerado pelo próprio Render.
4. Na primeira subida, as migrações criam as tabelas no schema `sonora` e o
   usuário `admin` é criado.

Para conferir, `https://<serviço>.onrender.com/api/status` deve responder com
`"dadosProntos": true`. Cada push na branch `main` publica de novo.

| Variável | Valor em produção |
|---|---|
| `NODE_ENV` | `production` |
| `DATABASE_URL` | URI do Session pooler do Supabase (secreta) |
| `APP_SCHEMA` | `sonora` |
| `DATABASE_SSL` | `require` |
| `SESSION_SECRET` | gerado pelo Render |
| `ADMIN_BOOTSTRAP_USER` / `ADMIN_BOOTSTRAP_PASSWORD` | primeiro administrador |
| `MUSICBRAINZ_CONTACT` | URL deste repositório |

No plano gratuito, o Render desliga o serviço depois de 15 minutos sem acesso, e a
primeira visita seguinte leva cerca de um minuto para abrir.

---

## Banco de dados

A persistência oficial é **PostgreSQL** (§9, §74), lido de `DATABASE_URL`. As
tabelas são criadas na subida, a partir de `migrations/`. Se o banco atrasar, a
aplicação não morre: `/healthz` continua 200 e as rotas de dados respondem 503 até
conectar.

§11 aceita Postgres gratuito, local ou de plano gratuito — não é preciso o banco
corporativo para o MVP funcionar.

### Supabase

Em produção o banco é o Postgres de um projeto Supabase. O servidor conecta
direto no Postgres, com `pg`. Por isso as chaves *publishable* e *secret* do
Supabase **não são usadas**: elas servem para a Data API, que o Sonora não usa.

| Ponto | Como fica |
|---|---|
| Conexão | URI do **Session pooler** (porta 5432), em `DATABASE_URL` |
| Schema | `APP_SCHEMA=sonora`, fora do `public` que a Data API expõe |
| Proteção extra | `002_rls.sql` liga RLS em todas as tabelas, sem policy: a Data API não lê nem grava nada, e o servidor, dono das tabelas, segue normal |
| SSL | `DATABASE_SSL=require` |

O pooler em modo transação (porta 6543) não serve: ele troca a conexão a cada
transação e perde o `search_path` e o lock de migração. A conexão direta
(`db.<ref>.supabase.co`) só funciona em rede com IPv6, e o Render não tem.

### Modelo (§47, §49)

```
users                                conta da plataforma
artists ─┐                           artista; MBID é quem identifica, não o nome
         └─ releases ─┬─ listens     escuta: muitas por usuário/obra
                      ├─ ratings     avaliação: uma atual (PK user+release)
                      ├─ reviews     review: uma atual (UNIQUE user+release)
                      ├─ favorites   favorito
                      ├─ watchlist   Quero ouvir
                      └─ list_items ── lists
session                              sessão de login
```

### Prevenção de duplicidade (§20)

1. `mbid` único em `artists` e `releases` — **mesmo ID externo = mesma obra**;
2. índice único em `(artist_id, título normalizado, tipo)` — cobre a obra sem ID externo;
3. no cadastro manual, verificação de título contra a fonte externa antes de gravar.

Artistas **homônimos são permitidos**: nome sozinho não identifica ninguém (§21),
então o índice de nome existe para busca, mas não é único.

---

## Quem entra

Cadastro é aberto (§21): qualquer pessoa cria a própria conta na tela de entrada e
já entra logada, como usuário comum. Login aceita usuário ou e-mail, e a mensagem
de erro não revela se a conta existe (§23).

O primeiro administrador vem de `ADMIN_BOOTSTRAP_*` na primeira subida; os demais
recebem o perfil de outro administrador.

Senhas sempre com hash bcrypt, nunca em texto claro. Sessão em cookie `httpOnly`,
com o registro no Postgres, então sobrevive a reinício e funciona com mais de uma
réplica. O login tem limite de 5 tentativas por IP a cada 15 minutos, e o
cadastro, 5 contas por IP por hora.

> **Atenção se a aplicação for publicada na plataforma interna da empresa:** a
> diretriz de apps internos proíbe tela de cadastro aberto — lá as contas nascem
> de um administrador. A especificação do Sonora pede o contrário (§21). Aqui o
> cadastro aberto está **ligado**, seguindo a especificação. Para inverter, basta
> remover a rota `POST /api/auth/cadastro` e o botão "criar agora" da tela de
> entrada; a criação de contas pela administração já existe.

---

## De onde vêm os metadados

Nenhuma chave de API é necessária.

- **MusicBrainz** — busca e metadados de lançamento e artista, por *release
  group* (a obra em nível conceitual, não cada reedição).
- **Cover Art Archive** — capas, pelo MBID do release group.

### Duas restrições reais, e como o código lida

O MusicBrainz limita a **1 requisição por segundo por IP** e responde 503
("currently busy") com facilidade quando o IP é compartilhado. Por isso:

- toda chamada passa por uma **fila serializada** com intervalo mínimo de 1,15 s;
- 503, 502, 504, 429 e falha de rede geram **nova tentativa com espera crescente**;
- respostas ficam em **cache** (30 min para busca, 24 h para detalhe);
- se o serviço estiver fora, a tela diz isso claramente e **não** libera cadastro
  manual (§16); a exploração do que já está no Sonora continua funcionando.

Obra sem capa é situação prevista: o campo fica nulo e a interface mostra um
espaço neutro. Se a capa existir mas o Internet Archive falhar no arquivo
específico, a interface cai para o mesmo espaço neutro em vez de imagem quebrada.

---

## Organização do projeto

```
sonora/
├── server.js              entry point: /healthz, segurança, sessão, rotas, SPA
├── render.yaml            publicação no Render (Blueprint)
├── migrations/            SQL numerado, aplicado na subida
├── src/
│   ├── config.js          variáveis de ambiente
│   ├── db.js              pool, migrações resilientes, schema da aplicação
│   ├── dados.js           "dá para ler/gravar agora?" — porta de entrada dos dados
│   ├── auth.js            sessão, senha, primeiro admin, middlewares
│   ├── security.js        helmet + CSP, CORS, limites de requisição
│   ├── repos/             acesso a dados (index.js escolhe a implementação)
│   ├── services/          catalogo.js e interacoes.js — as regras que cruzam entidades
│   ├── routes/            uma rota por assunto
│   ├── music/             MusicBrainz, Cover Art Archive e cache
│   └── demo/              modo demonstração (temporário, nunca em produção)
└── public/                interface: HTML, CSS e JS sem etapa de build
    ├── css/app.css        design system em tokens
    └── js/                roteador, componentes e telas
```

As regras que atravessam mais de uma entidade ficam em `src/services/`, não nos
repositórios: a escuta automática do §28 e a pergunta do §32 são exemplos — elas
tocam escuta, avaliação, review e Quero ouvir ao mesmo tempo.

Front-end e back-end sobem juntos, em um processo só. A interface é JavaScript
puro com módulos nativos: **não há etapa de build**.

---

## Endereços da API

Tudo em `/api` exige sessão, exceto `/api/status` e as rotas de entrada.
`/healthz` é público e não depende do banco.

| Método | Endereço | O que faz |
|---|---|---|
| GET | `/healthz` | probe de saúde (público) |
| GET | `/api/status` | nome, disponibilidade dos dados, modo demonstração |
| POST | `/api/auth/cadastro` | criar conta (§21) |
| POST | `/api/auth/login` `/logout` `/senha` | sessão e troca de senha (§22) |
| GET | `/api/catalogo/pesquisa?q=` | **pesquisa na fonte externa** (§39) |
| GET | `/api/catalogo/pesquisa/artistas?q=` | pesquisa de artistas |
| GET | `/api/catalogo/explorar` | o que está no Sonora, com os filtros do §40 |
| GET | `/api/catalogo/facetas` | gêneros, anos, tipos, origens e artistas |
| GET | `/api/catalogo/lancamentos/:ref` | obra por id local **ou MBID**, sem persistir (§13) |
| GET | `/api/catalogo/artistas/:ref` | artista e discografia, da API (§38) |
| POST | `/api/catalogo/manual/verificar` | porta do cadastro manual (§16) |
| POST | `/api/catalogo/manual` | cadastro manual (§17) |
| POST/DELETE | `/api/interacoes/escutas` | registrar e remover escuta (§26) |
| PUT/DELETE | `/api/interacoes/avaliacoes` | avaliar e remover nota (§29) |
| PUT/DELETE | `/api/interacoes/reviews` | publicar e excluir review (§30) |
| POST | `/api/interacoes/registro` | nota e review juntas, uma escuta só (§28) |
| POST/DELETE | `/api/interacoes/favoritos` | favoritar (§31) |
| POST/DELETE | `/api/interacoes/quero-ouvir` | Quero ouvir (§32) |
| GET | `/api/users/:username` | perfil e estatísticas (§24) |
| GET | `/api/users/:username/area?area=` | as sete áreas do perfil (§24) |
| PATCH | `/api/users/me` | editar nome de exibição e bio (§25) |
| GET | `/api/listas` | listas públicas da comunidade (§36) |
| GET | `/api/listas/minhas/todas` | minhas listas, incluindo privadas |
| GET/POST/PATCH/DELETE | `/api/listas` `/api/listas/:id` | listas (§34, §35) |
| POST | `/api/listas/:id/itens` | adicionar obra a uma lista |
| GET/POST/DELETE | `/api/admin/users` | administração de usuários (§45) |
| GET/PATCH/DELETE | `/api/admin/obras-manuais` | obras cadastradas à mão (§45) |
| GET/DELETE | `/api/admin/reviews` `/api/admin/listas` | moderação (§45) |

`:ref` aceita id local **ou** MBID. É isso que permite abrir e interagir com uma
obra que nunca foi persistida.

---

## Créditos e uso de imagens

Metadados por [MusicBrainz](https://musicbrainz.org) e capas por
[Cover Art Archive](https://coverartarchive.org), ambos da MetaBrainz Foundation.
Os links acima são desta documentação; **na interface o crédito aparece em texto,
sem link**, conforme §46 e §64.

As capas não são copiadas nem armazenadas: a aplicação guarda a URL e o navegador
carrega da fonte. Para publicação pública do projeto, vale revisar as condições de
uso das duas fontes.
