-- Catálogo multi-tenant de clientes/operadoras + template PDF (MVP: Claro)

ALTER TABLE public.relatorios_transmissao
  DROP CONSTRAINT IF EXISTS relatorios_transmissao_cliente_operadora_check;

CREATE TABLE IF NOT EXISTS public.clientes_relatorio (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE,
  nome text NOT NULL,
  ativo boolean NOT NULL DEFAULT true,
  is_sistema boolean NOT NULL DEFAULT false,
  /** Caminho futuro no Storage do modelo PDF enviado pelo gestor. */
  template_pdf_storage_path text,
  /**
   * Mapa estrutural do relatório/PDF por cliente.
   * MVP Claro espelha as seções já coletadas em relatorios_transmissao.payload.
   * Clientes futuros: schema dinâmico após upload do modelo.
   */
  template_schema jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS clientes_relatorio_ativo_idx
  ON public.clientes_relatorio (ativo, nome);

COMMENT ON TABLE public.clientes_relatorio IS
  'Clientes/operadoras de relatório (multi-tenant). Claro é o seed do MVP; novos clientes via + Adicionar Cliente.';

COMMENT ON COLUMN public.clientes_relatorio.template_schema IS
  'Estrutura de seções/campos/fotos para geração de PDF por operadora.';

COMMENT ON COLUMN public.clientes_relatorio.template_pdf_storage_path IS
  'Path no Storage do PDF modelo (futuro: upload em + Adicionar Cliente).';

ALTER TABLE public.relatorios_transmissao
  ADD COLUMN IF NOT EXISTS cliente_relatorio_id uuid
    REFERENCES public.clientes_relatorio (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS relatorios_transmissao_cliente_relatorio_idx
  ON public.relatorios_transmissao (cliente_relatorio_id);

-- Seed Claro (idempotente) com schema alinhado ao payload atual de campo
INSERT INTO public.clientes_relatorio (slug, nome, ativo, is_sistema, template_schema)
VALUES (
  'claro',
  'Claro',
  true,
  true,
  '{
    "versao": 1,
    "layout": "claro_padrao",
    "origem": "mvp_payload_relatorios_transmissao",
    "nota": "Schema inicial derivado do app de campo. Refinar com o PDF oficial Claro quando disponível.",
    "secoes": [
      {
        "id": "cabecalho",
        "titulo": "Dados cadastrais",
        "fonte": "colunas",
        "campos": [
          "os_wf",
          "cliente",
          "cliente_operadora",
          "endereco",
          "cidade",
          "equipe_empreiteira",
          "responsavel",
          "data_inicio_execucao",
          "tipo_execucao",
          "tecnicos_nomes"
        ]
      },
      {
        "id": "rede_externa",
        "titulo": "Rede Externa (RE)",
        "fonte": "payload",
        "flags": ["lancamentoRe"],
        "metragens": "metragensCabo",
        "quantidades": "redeAcesso",
        "gruposFoto": [
          "posteConexao",
          "caixaEmenda",
          "plaquetaIdentificacao",
          "novoAterramentoPoste",
          "aterramentoTerrometro",
          "posicaoConexaoEstacao",
          "etiquetaIdentificacao",
          "sobraTecnica"
        ],
        "outrasFotos": "outrasFotos"
      },
      {
        "id": "rede_cliente",
        "titulo": "Rede Cliente (RC)",
        "fonte": "payload",
        "flags": ["lancamentoRc"],
        "metragens": "metragensCaboRc",
        "quantidades": "redeCliente",
        "tecnologia": "tecnologiaAcesso",
        "gruposFoto": [
          "rcPosteConexao",
          "rcCaixaEmenda",
          "rcTerminacaoCabo",
          "rcPlaquetaIdentificacao",
          "rcEntradaInterna",
          "rcEntradaExterna"
        ],
        "outrasFotos": "outrasFotosRc"
      },
      {
        "id": "equipamentos_cliente",
        "titulo": "Equipamentos no Cliente",
        "fonte": "payload",
        "gruposFoto": [
          "eqClienteFachada",
          "eqClienteAmbiente",
          "eqClienteRack",
          "eqClienteDgo",
          "eqClienteEquipamentos",
          "eqClienteEtiqueta",
          "eqClienteSgp"
        ],
        "outrasFotos": "outrasFotosEqCliente"
      },
      {
        "id": "equipamentos_estacao",
        "titulo": "Equipamentos na Estação",
        "fonte": "payload",
        "flags": ["relatorioEstacao"],
        "campos": ["estacaoEntregaAcesso"],
        "gruposFoto": [
          "eqEstacaoGeral",
          "eqEstacaoRack",
          "eqEstacaoEquipamento",
          "eqEstacaoEtiqueta",
          "eqEstacaoDgo"
        ],
        "outrasFotos": "outrasFotosEqEstacao"
      },
      {
        "id": "testes",
        "titulo": "Testes ópticos e de potência",
        "fonte": "payload",
        "blocos": [
          "testeOptico",
          "testePotenciaEmpresarial",
          "testePotenciaImplantacao",
          "testePotencia1550",
          "testePotencia1330"
        ]
      }
    ]
  }'::jsonb
)
ON CONFLICT (slug) DO UPDATE SET
  nome = EXCLUDED.nome,
  ativo = true,
  is_sistema = true,
  template_schema = EXCLUDED.template_schema,
  updated_at = now();

UPDATE public.relatorios_transmissao r
SET
  cliente_operadora = 'Claro',
  cliente_relatorio_id = c.id
FROM public.clientes_relatorio c
WHERE c.slug = 'claro'
  AND (
    r.cliente_relatorio_id IS NULL
    OR r.cliente_operadora IS DISTINCT FROM 'Claro'
    OR r.cliente_operadora IN ('TIM', 'Vivo', 'Outro')
  );

ALTER TABLE public.relatorios_transmissao
  ALTER COLUMN cliente_operadora SET DEFAULT 'Claro';

COMMENT ON COLUMN public.relatorios_transmissao.cliente_operadora IS
  'Nome/display da operadora (MVP: Claro). Preferir cliente_relatorio_id para FK.';

COMMENT ON COLUMN public.relatorios_transmissao.cliente_relatorio_id IS
  'FK para clientes_relatorio (template PDF / schema multi-tenant).';

ALTER TABLE public.clientes_relatorio ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS clientes_relatorio_select ON public.clientes_relatorio;
CREATE POLICY clientes_relatorio_select
  ON public.clientes_relatorio FOR SELECT
  TO authenticated
  USING (ativo = true OR public.is_painel_reader());

DROP POLICY IF EXISTS clientes_relatorio_admin_write ON public.clientes_relatorio;
CREATE POLICY clientes_relatorio_admin_write
  ON public.clientes_relatorio FOR ALL
  TO authenticated
  USING (public.is_painel_reader())
  WITH CHECK (public.is_painel_reader());
