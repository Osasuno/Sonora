-- 001_init.sql — estrutura oficial do Sonora.
-- Roda dentro do schema da aplicacao (search_path ajustado pelo runner).
--
-- Referencias da especificacao oficial:
--   §14  dados externos respondem "que obra e' essa?"; o Sonora responde
--        "qual a relacao das pessoas com essa obra?"
--   §27  escuta, avaliacao e review sao entidades INDEPENDENTES
--   §49  modelo de tabelas sugerido
--   §50  refatoracao obrigatoria: a tabela unica `entries` foi substituida
--        por listens + ratings + reviews

CREATE TABLE IF NOT EXISTS users (
  id            SERIAL PRIMARY KEY,
  username      TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT NOT NULL,
  password_hash TEXT,
  is_admin      BOOLEAN NOT NULL DEFAULT false,
  bio           TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS users_email_idx ON users (lower(email));

-- ─── Catalogo ───────────────────────────────────────────────────────────────
--
-- Origem (§15, §46): API quando veio do MusicBrainz, MANUAL quando foi
-- cadastrada a mao. O usuario ve essa distincao por um badge.

CREATE TABLE IF NOT EXISTS artists (
  id         SERIAL PRIMARY KEY,
  mbid       UUID UNIQUE,
  name       TEXT NOT NULL,
  sort_name  TEXT,
  origin     TEXT NOT NULL DEFAULT 'MANUAL',
  created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT artists_origem_valida CHECK (origin IN ('API', 'MANUAL'))
);

-- Artistas homonimos sao permitidos (§21): nome sozinho nao identifica
-- ninguem. Quem distingue e' o identificador externo. Por isso o indice de
-- nome existe para busca, mas nao e' unico.
CREATE INDEX IF NOT EXISTS artists_nome_idx ON artists (lower(name));

-- Data de lancamento em tres colunas, de proposito (§17): a especificacao pede
-- para representar a informacao disponivel sem inventar precisao.
--   release_date      data completa, quando se sabe o dia (serve para ordenar)
--   release_year      ano, sempre que houver qualquer data (serve para filtrar)
--   release_date_text precisao original: "1997", "1997-05" ou "1997-05-21"
-- A fonte externa tambem devolve datas parciais, entao isso vale para as obras
-- de API e para as manuais.
CREATE TABLE IF NOT EXISTS releases (
  id                SERIAL PRIMARY KEY,
  mbid              UUID UNIQUE,
  title             TEXT NOT NULL,
  artist_id         INTEGER NOT NULL REFERENCES artists(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,
  release_date      DATE,
  release_year      INTEGER,
  release_date_text TEXT,
  cover_url    TEXT,
  genres       TEXT[] NOT NULL DEFAULT '{}',
  origin       TEXT NOT NULL DEFAULT 'MANUAL',
  created_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT releases_tipo_valido CHECK (type IN ('ALBUM', 'EP', 'SINGLE')),
  CONSTRAINT releases_origem_valida CHECK (origin IN ('API', 'MANUAL')),
  CONSTRAINT releases_ano_plausivel CHECK (release_year IS NULL OR release_year BETWEEN 1860 AND 2200),
  CONSTRAINT releases_precisao_valida
    CHECK (release_date_text IS NULL OR release_date_text ~ '^\d{4}(-\d{2}(-\d{2})?)?$')
);

CREATE INDEX IF NOT EXISTS releases_artista_idx  ON releases (artist_id);
CREATE INDEX IF NOT EXISTS releases_titulo_idx   ON releases (lower(title));
CREATE INDEX IF NOT EXISTS releases_tipo_idx     ON releases (type);
CREATE INDEX IF NOT EXISTS releases_ano_idx      ON releases (release_year);
-- Os dois "mais recentes" do §43, que sao ordenacoes diferentes e precisam de
-- indices diferentes: data de lancamento da obra x entrada no catalogo.
CREATE INDEX IF NOT EXISTS releases_data_idx     ON releases (release_date_text DESC);
CREATE INDEX IF NOT EXISTS releases_entrada_idx  ON releases (created_at DESC);
CREATE INDEX IF NOT EXISTS releases_genero_idx   ON releases USING gin (genres);

-- Duplicidade (§20): o MBID unico acima resolve o caso principal. Este indice
-- cobre a segunda verificacao, por titulo normalizado, que e' o que sobra
-- quando a obra nao tem identificador externo.
CREATE UNIQUE INDEX IF NOT EXISTS releases_sem_duplicata
  ON releases (artist_id, lower(btrim(title)), type);

-- ─── Dados do Sonora: a relacao das pessoas com as obras ───────────────────

-- Escuta (§26): entidade propria. O mesmo usuario pode registrar a mesma obra
-- varias vezes, e cada ocorrencia entra no historico.
CREATE TABLE IF NOT EXISTS listens (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id  INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  listened_on DATE NOT NULL DEFAULT current_date,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS listens_user_idx    ON listens (user_id, listened_on DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS listens_release_idx ON listens (release_id);

-- Avaliacao (§29): no maximo UMA atual por usuario e obra, alteravel.
-- Sem historico de versoes de nota no MVP.
CREATE TABLE IF NOT EXISTS ratings (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  rating     NUMERIC(2, 1) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, release_id),
  CONSTRAINT ratings_escala_oficial
    CHECK (rating >= 0.5 AND rating <= 5.0 AND (rating * 2) = floor(rating * 2))
);

CREATE INDEX IF NOT EXISTS ratings_release_idx ON ratings (release_id);

-- Review (§30): no maximo UMA atual por usuario e obra. Excluir a review
-- remove somente a review — escuta, nota, favorito e listas continuam.
CREATE TABLE IF NOT EXISTS reviews (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  review     TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reviews_uma_por_obra UNIQUE (user_id, release_id)
);

CREATE INDEX IF NOT EXISTS reviews_release_idx ON reviews (release_id, created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_user_idx    ON reviews (user_id, created_at DESC);

-- Favoritos (§31) e Quero ouvir (§32): no maximo um vinculo ativo cada.
CREATE TABLE IF NOT EXISTS favorites (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, release_id)
);

CREATE TABLE IF NOT EXISTS watchlist (
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, release_id)
);

-- Listas (§34, §35): nascem publicas e podem virar privadas.
CREATE TABLE IF NOT EXISTS lists (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  visibility  TEXT NOT NULL DEFAULT 'PUBLIC',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT lists_visibilidade_valida CHECK (visibility IN ('PUBLIC', 'PRIVATE'))
);

CREATE INDEX IF NOT EXISTS lists_user_idx       ON lists (user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS lists_publicas_idx   ON lists (visibility, updated_at DESC);

-- Item da lista (§34): posicao e comentario textual pessoal. Nao existe nota
-- numerica propria do item — a avaliacao oficial e' a do usuario para a obra.
CREATE TABLE IF NOT EXISTS list_items (
  list_id    INTEGER NOT NULL REFERENCES lists(id) ON DELETE CASCADE,
  release_id INTEGER NOT NULL REFERENCES releases(id) ON DELETE CASCADE,
  position   SMALLINT NOT NULL,
  comment    TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (list_id, release_id)
);

CREATE INDEX IF NOT EXISTS list_items_ordem_idx ON list_items (list_id, position);

-- Sessoes de login (express-session + connect-pg-simple).
CREATE TABLE IF NOT EXISTS session (
  sid    TEXT PRIMARY KEY,
  sess   JSON NOT NULL,
  expire TIMESTAMP(6) NOT NULL
);

CREATE INDEX IF NOT EXISTS session_expire_idx ON session (expire);
