-- Atualiza schema Claro com a folha oficial padrao-relatorio-transmissao.pdf

UPDATE public.clientes_relatorio
SET
  template_pdf_storage_path = '/templates/claro/padrao-relatorio-transmissao.pdf',
  template_schema = $json${
  "versao": 2,
  "layout": "claro_padrao",
  "origem": "padrao-relatorio-transmissao.pdf",
  "nota": "Folha padronizada oficial Claro (paisagem 1440×810). Conteúdo do relatório é composto na área central sobre este fundo.",
  "visual": {
    "id": "claro_folha_padrao",
    "orientacao": "landscape",
    "paginaPt": { "largura": 1440, "altura": 810 },
    "proporcao": "16:9",
    "cores": { "primaria": "#E30613", "fundo": "#F3F4F6", "texto": "#1F2937" },
    "faixaTopo": { "cor": "#E30613", "alturaRelativa": 0.055 },
    "marcaDagua": {
      "asset": "/templates/claro/marca-dagua-claro.png",
      "posicao": "esquerda",
      "opacidade": 0.08
    },
    "rodape": {
      "esquerda": {
        "asset": "/templates/claro/logo-estrategic.png",
        "label": "estratégic ENGENHARIA"
      },
      "direita": {
        "asset": "/templates/claro/logo-claro.png",
        "label": "Claro"
      }
    },
    "areaConteudo": {
      "margemTopoRelativa": 0.1,
      "margemBaseRelativa": 0.14,
      "margemLateralRelativa": 0.05
    },
    "assets": {
      "pdfPadrao": "/templates/claro/padrao-relatorio-transmissao.pdf",
      "preview": "/templates/claro/preview.png",
      "logoClaro": "/templates/claro/logo-claro.png",
      "logoEstrategic": "/templates/claro/logo-estrategic.png",
      "marcaDagua": "/templates/claro/marca-dagua-claro.png"
    }
  },
  "secoes": [
    {
      "id": "cabecalho",
      "titulo": "Dados cadastrais",
      "fonte": "colunas",
      "campos": [
        "os_wf", "cliente", "cliente_operadora", "endereco", "cidade",
        "equipe_empreiteira", "responsavel", "data_inicio_execucao",
        "tipo_execucao", "tecnicos_nomes"
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
        "posteConexao", "caixaEmenda", "plaquetaIdentificacao",
        "novoAterramentoPoste", "aterramentoTerrometro",
        "posicaoConexaoEstacao", "etiquetaIdentificacao", "sobraTecnica"
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
        "rcPosteConexao", "rcCaixaEmenda", "rcTerminacaoCabo",
        "rcPlaquetaIdentificacao", "rcEntradaInterna", "rcEntradaExterna"
      ],
      "outrasFotos": "outrasFotosRc"
    },
    {
      "id": "equipamentos_cliente",
      "titulo": "Equipamentos no Cliente",
      "fonte": "payload",
      "gruposFoto": [
        "eqClienteFachada", "eqClienteAmbiente", "eqClienteRack",
        "eqClienteDgo", "eqClienteEquipamentos", "eqClienteEtiqueta",
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
        "eqEstacaoGeral", "eqEstacaoRack", "eqEstacaoEquipamento",
        "eqEstacaoEtiqueta", "eqEstacaoDgo"
      ],
      "outrasFotos": "outrasFotosEqEstacao"
    },
    {
      "id": "testes",
      "titulo": "Testes ópticos e de potência",
      "fonte": "payload",
      "blocos": [
        "testeOptico", "testePotenciaEmpresarial", "testePotenciaImplantacao",
        "testePotencia1550", "testePotencia1330"
      ]
    }
  ]
}$json$::jsonb,
  updated_at = now()
WHERE slug = 'claro';
