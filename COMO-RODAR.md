# Como rodar o Sonora

Manual prático, do zero até a aplicação aberta no navegador. Se você só quer ver
funcionando, siga a **Parte 1** e pare ali: dá cerca de três minutos.

---

## Parte 0 — O que você precisa

Só uma coisa: **Node.js 18 ou mais novo** (recomendado 20 ou 22).

Para conferir se já tem, abra o PowerShell e rode:

```powershell
node --version
npm --version
```

Se aparecerem duas versões (algo como `v22.11.0` e `10.9.0`), está pronto. Se der
"não é reconhecido como nome de cmdlet", instale a versão LTS em
[nodejs.org](https://nodejs.org) e **feche e reabra o PowerShell** depois.

Não precisa de banco de dados, Docker, chave de API nem cadastro em serviço
nenhum para a Parte 1.

---

## Parte 1 — Rodar em modo demonstração

É o caminho mais curto. A aplicação sobe com 24 obras — 23 reais vindas da fonte
externa, com capa, e uma de cadastro manual — e com escutas, notas, reviews e
listas fictícias para você navegar.

A pesquisa, essa sim, consulta o catálogo externo de verdade: você vai encontrar
qualquer álbum, não só os 24 que já estão aqui.

### 1. Entre na pasta do projeto

```powershell
cd c:\Users\leonardo.araujo\Downloads\fabrica-de-software\sonora
```

### 2. Instale as dependências (uma vez só)

```powershell
npm install
```

Leva alguns segundos e cria a pasta `node_modules`. Ao final aparece algo como
`added 93 packages`.

Se você vir um aviso sobre `NODE_TLS_REJECT_UNAUTHORIZED`, ele vem de uma
configuração da sua máquina, não do projeto. Não impede nada.

### 3. Crie o arquivo de configuração

```powershell
Copy-Item .env.example .env
```

> Se você recebeu o projeto já com um `.env` dentro, **pule este passo** — ele já
> está configurado. Rode `Test-Path .env` para conferir: se responder `True`, siga
> para o passo 5.

### 4. Ajuste duas linhas no `.env`

Abra o `.env` em qualquer editor de texto e mude:

```env
DEMO_MODE=true
MUSICBRAINZ_CONTACT=seu.email@exemplo.com
```

- **`DEMO_MODE=true`** é o que faz a aplicação subir com dados de exemplo em vez
  de exigir um banco.
- **`MUSICBRAINZ_CONTACT`** é um e-mail qualquer, seu. O MusicBrainz exige que
  quem usa a API dele se identifique. Sem isso, a busca por obras novas pode ser
  recusada — o resto funciona igual.

Recomendado também, embora a aplicação suba sem: gere um segredo de sessão e cole
em `SESSION_SECRET`.

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

Sem ele, a aplicação sobe e avisa no log que está usando um segredo temporário —
o efeito prático é que você é desconectado a cada reinício.

### 5. Suba a aplicação

```powershell
npm start
```

Você vai ver algo assim:

```
[Sonora] ouvindo em http://localhost:8000
┌──────────────────────────────────────────────────────────────┐
│  MODO DEMONSTRACAO ATIVO                                     │
│  Dados ficticios, em memoria, perdidos a cada reinicio.      │
│  Entre com  usuario: leo   senha: demo1234                   │
└──────────────────────────────────────────────────────────────┘
[demo] 5 pessoas criadas (senha: demo1234)
[demo] acervo pronto em 18281ms: 24 lancamentos (23 com capa, 1 manual), 43 escutas, 37 notas, 25 reviews, 4 listas
```

**Espere a última linha aparecer.** Ela leva de 10 a 30 segundos, porque a
aplicação busca as 23 capas no Cover Art Archive. Antes disso a tela **No Sonora**
aparece vazia — mas o login e a pesquisa já funcionam.

### 6. Abra no navegador

```
http://localhost:8000
```

O acesso já vem preenchido. Se não vier, use:

| Usuário | Senha | Perfil |
|---|---|---|
| `leo` | `demo1234` | administrador |
| `marina` | `demo1234` | comum |
| `caio` | `demo1234` | comum |
| `ju` | `demo1234` | comum |
| `rafa` | `demo1234` | comum |

Você também pode clicar em **"Não tenho conta — criar agora"** e criar a sua.

### 7. Para parar

No PowerShell onde a aplicação está rodando, aperte **Ctrl + C**.

---

## Parte 2 — Roteiro de 5 minutos para conhecer

Depois de entrar, vale seguir esta ordem. Ela percorre os comportamentos que mais
diferenciam o projeto.

### Pesquisar vale para qualquer obra, não só para o que está aqui

1. Vá em **Pesquisar** e procure algo bem fora do acervo: `kind of blue`,
   `thriller`, `baduizm`. Os resultados vêm do catálogo externo, com capa e ano.
2. Abra um deles. No alto, uma faixa avisa que **a obra ainda não está no
   Sonora** — porque abrir não salva nada.
3. Clique em **Registrar escuta**. Agora sim ela entra no catálogo. Volte em
   **No Sonora** e confira que o total subiu.

### Escuta, nota e review são independentes

4. Abra **Loveless** (está em **No Sonora**). Clique em **Registrar escuta** duas
   vezes: o painel **Suas escutas** passa a listar as duas, separadas.
5. Clique em **Avaliar e escrever**. Dê uma nota — a metade esquerda de cada
   estrela vale meia — e escreva uma review. Salve.
6. Clique em **Excluir review** e confirme. Repare: a **nota continua** e as
   **escutas continuam**. Só o texto saiu.

### O Quero ouvir pergunta, não decide

7. Em qualquer obra, clique em **Quero ouvir** e depois em **Registrar escuta**.
8. Aparece um diálogo: **Remover** ou **Manter**. Escolha *Manter* e confira que
   a obra ficou na lista. O sistema nunca remove sozinho.

### Filtros: os dois "recentes" e as duas avaliações

9. Em **No Sonora**, mude a ordenação para **Lançamentos mais recentes** e depois
   para **Recém-adicionados ao Sonora**. São ordens diferentes de propósito.
10. Experimente **Popularidade (escutas)** — popularidade aqui é escuta, não
    favorito nem review.
11. Compare **Média da comunidade: 4,5 ou mais** com **Minha avaliação: 4,5 ou
    mais**. São duas perspectivas distintas.

### Origem da obra

12. Procure em **No Sonora** a obra **Som do Porão**, de *Fita Virgem*. Ela tem o
    selo **manual** na capa e, na página, **Origem: Cadastro manual**. As outras
    mostram **Origem: MusicBrainz**.

### Cadastro manual só abre quando a fonte não acha

13. Vá em **Pesquisar** e procure uma obra que exista, como `ok computer`. Não há
    oferta de cadastro manual — e não deveria haver.
14. Agora procure algo inexistente, como `fita cassete do porão 1988`. A tela
    oferece **Cadastrar à mão**. Clique, verifique e preencha: a data aceita
    `2024`, `2024-08` ou `2024-08-09`.

### Perfil e listas

15. Abra seu nome no canto superior direito → **Meu perfil**. Percorra as sete
    áreas e repare que **obras ouvidas** e **escutas** são números diferentes.
16. Menu **Listas** → **Nova lista**. Dê um título, clique **Adicionar obras**,
    escreva um comentário em cada item, reordene com as setas e salve. Marque
    **Lista privada** e veja o selo aparecer.

### Administração (com o usuário `leo`)

17. Menu do seu nome → **Administração**. Nas três abas: usuários, obras manuais
    (só as cadastradas à mão são editáveis) e moderação de reviews e listas.

---

## Parte 3 — Rodar com banco de dados de verdade

O modo demonstração guarda tudo em memória: **ao reiniciar, tudo que você
registrou desaparece**. Para dados que persistem, é preciso um PostgreSQL.

### 1. Pegue a conexão do Supabase

O banco do projeto é o Postgres do Supabase. No painel do projeto:

1. Clique em **Connect**, no alto da página.
2. Escolha **Session pooler** e copie a URI. Ela tem este formato:
   `postgresql://postgres.<ref>:[YOUR-PASSWORD]@aws-<n>-<regiao>.pooler.supabase.com:5432/postgres`
3. Troque `[YOUR-PASSWORD]` pela senha do banco. Se não lembrar, redefina em
   **Database → Settings**.

Use o **Session pooler**, e não o *Transaction pooler* (porta 6543) nem a conexão
direta. O modo transação perde o `search_path` e o lock de migração, e a conexão
direta só funciona em redes com IPv6.

As chaves *publishable* e *secret* do Supabase não entram aqui: o servidor fala
direto com o Postgres e não usa a Data API.

### 2. Ajuste o `.env`

```env
DATABASE_URL=postgresql://postgres.<ref>:SENHA@aws-<n>-<regiao>.pooler.supabase.com:5432/postgres
APP_SCHEMA=sonora
DATABASE_SSL=require

# Apague esta linha, ou deixe false:
DEMO_MODE=false

ADMIN_BOOTSTRAP_USER=admin
ADMIN_BOOTSTRAP_PASSWORD=escolha-uma-senha-forte
```

Detalhes que evitam dor de cabeça:

- **`APP_SCHEMA=sonora`** põe as tabelas num schema próprio, que a aplicação cria
  sozinha. No Supabase isso as deixa fora do `public`, que a Data API expõe.
- **`DATABASE_SSL=require`** é necessário na maioria dos bancos gerenciados. Não
  acrescente `?sslmode=require` à URI: com o driver `pg`, isso passa a exigir a
  verificação completa do certificado e a conexão com o Supabase falha.
- Se a senha tiver caracteres especiais (`@`, `:`, `/`, `#`), eles precisam ser
  codificados na URL. Gere a URL correta com:

  ```powershell
  node -e "console.log('postgresql://' + encodeURIComponent('USUARIO') + ':' + encodeURIComponent('SENHA') + '@HOST:5432/BANCO')"
  ```

- **`DEMO_MODE` é ignorado** quando existe `DATABASE_URL`. Banco real sempre
  ganha, então não há risco de misturar dados fictícios com dados de verdade.

### 3. Suba

```powershell
npm start
```

O esperado no log:

```
[Sonora] ouvindo em http://localhost:8000
[db] migracao aplicada: 001_init.sql
[db] migracao aplicada: 002_rls.sql
[db] pronto (schema "sonora")
[auth] administrador inicial criado: admin
```

As tabelas são criadas automaticamente na primeira subida. Não há comando de
migração para rodar à mão.

### 4. Entre e comece a usar

Entre com o usuário e a senha que você pôs em `ADMIN_BOOTSTRAP_*` (ou crie a sua
conta na tela de entrada).

**Não existe etapa de "montar o catálogo".** A tela **No Sonora** começa vazia, e
isso é o comportamento correto: ela mostra só as obras com que alguém já
interagiu. Vá em **Pesquisar**, encontre um álbum e registre uma escuta — ele
entra no catálogo nesse momento.

> Rodando local com a `DATABASE_URL` do Supabase, você usa o mesmo banco do site
> publicado. Para testar sem mexer nos dados reais, use o modo demonstração.

---

## Parte 4 — Publicar no Render

O site publicado roda no Render e usa o mesmo banco do Supabase. O passo a passo
está no [README](README.md#publicação-render--supabase): botão **Deploy to
Render**, a URI do Session pooler em `DATABASE_URL` e uma senha para o primeiro
administrador. Depois disso, cada push na branch `main` publica de novo.

---

## Durante o desenvolvimento

Para reiniciar sozinho a cada arquivo salvo:

```powershell
npm run dev
```

Trocar a porta, se a 8000 estiver ocupada — no `.env`:

```env
WEB_PORT=8080
```

Conferir se está tudo de pé, sem abrir o navegador:

```powershell
curl.exe -s http://localhost:8000/healthz
curl.exe -s http://localhost:8000/api/status
```

O primeiro responde `ok`. O segundo devolve um JSON dizendo se os dados estão
disponíveis e se o modo demonstração está ligado:

```json
{"app":"Sonora","dadosProntos":true,"demo":true}
```

> Use `curl.exe`, com a extensão. No PowerShell, `curl` sozinho é apelido de
> `Invoke-WebRequest`, que aceita outros parâmetros e devolve outro formato.

Não existe etapa de build. O front-end é JavaScript puro com módulos nativos:
salvar o arquivo e recarregar a página já mostra a mudança.

---

## Quando algo dá errado

### `Error: listen EADDRINUSE: address already in use :::8000`

Já tem algo na porta 8000 — provavelmente outra instância da aplicação. Descubra
quem é e encerre:

```powershell
Get-NetTCPConnection -LocalPort 8000 -State Listen | Select-Object OwningProcess
Stop-Process -Id COLOQUE_O_ID_AQUI
```

Ou simplesmente mude `WEB_PORT` no `.env`.

### `Cannot find module 'express'`

Faltou instalar as dependências. Rode `npm install` dentro da pasta `sonora`.

### A tela "No Sonora" aparece vazia no modo demonstração

Você abriu antes da semente terminar. Espere a linha `[demo] acervo pronto`
aparecer no log e recarregue a página.

Com banco de verdade, essa tela vazia é o esperado no começo: ela lista só as
obras com que alguém já interagiu. Use **Pesquisar**.

### A tela mostra "Este ambiente ainda não tem banco de dados configurado"

Nem `DATABASE_URL` nem `DEMO_MODE=true` estão definidos. Escolha um dos dois: o
modo demonstração (Parte 1) ou o banco de verdade (Parte 3).

### "A fonte externa está temporariamente indisponível"

Normal e esperado. O MusicBrainz aceita **1 requisição por segundo por IP**, e
quando muita gente sai pelo mesmo endereço ele recusa com frequência. A aplicação
já tenta de novo automaticamente, com espera crescente.

O que fazer: espere alguns segundos e busque de novo. A exploração do que já está
em **No Sonora** continua funcionando.

Repare que nessa situação o **cadastro manual fica bloqueado**, e isso é
intencional: liberá-lo durante uma queda criaria obras duplicadas no catálogo.
O cadastro só abre quando a fonte responde e de fato não encontra a obra.

### As capas não carregam

Confira se a máquina alcança `coverartarchive.org` e `archive.org`. Alguns
firewalls corporativos bloqueiam. Obra sem capa é situação prevista: a interface
mostra um espaço neutro em vez de imagem quebrada.

### Fui desconectado ao reiniciar o servidor

Acontece quando `SESSION_SECRET` está vazio (a aplicação gera um temporário a
cada subida) ou quando não há banco (as sessões ficam em memória). Preencha
`SESSION_SECRET` no `.env` para resolver o primeiro caso.

### O log reclama de `NODE_TLS_REJECT_UNAUTHORIZED`

É uma variável de ambiente da sua máquina que desliga a verificação de
certificado TLS de qualquer programa Node. Não vem do projeto. Vale remover das
suas variáveis de ambiente, porque enfraquece a segurança de tudo que você roda
em Node.

---

## Resumo em quatro comandos

```powershell
cd c:\Users\leonardo.araujo\Downloads\fabrica-de-software\sonora
npm install
Copy-Item .env.example .env    # depois ponha DEMO_MODE=true no arquivo
npm start
```

Abra `http://localhost:8000` e entre com `leo` / `demo1234`.
