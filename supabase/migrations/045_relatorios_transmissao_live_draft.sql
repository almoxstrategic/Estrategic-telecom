-- Live draft: cabeçalho pode nascer só com OS/WF

ALTER TABLE public.relatorios_transmissao
  ALTER COLUMN cliente DROP NOT NULL,
  ALTER COLUMN endereco DROP NOT NULL,
  ALTER COLUMN cidade DROP NOT NULL,
  ALTER COLUMN equipe_empreiteira DROP NOT NULL,
  ALTER COLUMN responsavel DROP NOT NULL,
  ALTER COLUMN data_inicio_execucao DROP NOT NULL;

ALTER TABLE public.relatorios_transmissao
  ALTER COLUMN cliente SET DEFAULT '',
  ALTER COLUMN endereco SET DEFAULT '',
  ALTER COLUMN cidade SET DEFAULT '',
  ALTER COLUMN equipe_empreiteira SET DEFAULT '',
  ALTER COLUMN responsavel SET DEFAULT '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'relatorios_transmissao'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.relatorios_transmissao;
  END IF;
END $$;
