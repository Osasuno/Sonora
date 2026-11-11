-- 002_rls.sql — Row Level Security em todas as tabelas da aplicacao.
--
-- No Supabase, as tabelas de um schema exposto pela Data API (por padrao,
-- `public`) ficam acessiveis para quem tiver a chave publica (publishable/anon),
-- e essa chave e' publica por definicao. O Sonora nao usa a Data API: o
-- servidor fala direto com o Postgres, como dono das tabelas, e o dono nao e'
-- afetado por RLS.
--
-- Ligar RLS sem nenhuma policy fecha esse acesso externo mesmo que o schema da
-- aplicacao venha a ser exposto, ou que APP_SCHEMA seja `public`. Em um
-- Postgres comum, fora do Supabase, nada muda: o app continua dono das tabelas.

ALTER TABLE schema_migrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
ALTER TABLE artists           ENABLE ROW LEVEL SECURITY;
ALTER TABLE releases          ENABLE ROW LEVEL SECURITY;
ALTER TABLE listens           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ratings           ENABLE ROW LEVEL SECURITY;
ALTER TABLE reviews           ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites         ENABLE ROW LEVEL SECURITY;
ALTER TABLE watchlist         ENABLE ROW LEVEL SECURITY;
ALTER TABLE lists             ENABLE ROW LEVEL SECURITY;
ALTER TABLE list_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE session           ENABLE ROW LEVEL SECURITY;
