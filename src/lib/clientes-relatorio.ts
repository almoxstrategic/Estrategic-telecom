/**
 * Catálogo de clientes/operadoras para geração de PDF multi-tenant.
 * MVP: seed "Claro" com folha oficial `padrao-relatorio-transmissao.pdf`.
 * Futuro: + Adicionar Cliente com upload de modelo PDF próprio.
 */

export type ClienteRelatorioTemplateSecao = {
  id: string;
  titulo: string;
  fonte: "colunas" | "payload";
  campos?: string[];
  flags?: string[];
  metragens?: string;
  quantidades?: string;
  tecnologia?: string;
  gruposFoto?: string[];
  outrasFotos?: string;
  blocos?: string[];
};

/** Layout visual da folha padronizada (capa/fundo do PDF). */
export type ClienteRelatorioLayoutVisual = {
  id: string;
  orientacao: "landscape" | "portrait";
  /** Dimensões do PDF oficial Claro (pt). */
  paginaPt: { largura: number; altura: number };
  proporcao: string;
  cores: {
    /** Faixa superior Claro. */
    primaria: string;
    fundo: string;
    texto: string;
  };
  faixaTopo: {
    cor: string;
    /** Altura relativa aproximada no template oficial. */
    alturaRelativa: number;
  };
  marcaDagua: {
    asset: string;
    posicao: "esquerda" | "centro" | "direita";
    opacidade: number;
  };
  rodape: {
    esquerda: { asset: string; label: string };
    direita: { asset: string; label: string };
  };
  /** Área livre onde o conteúdo do relatório será composto. */
  areaConteudo: {
    margemTopoRelativa: number;
    margemBaseRelativa: number;
    margemLateralRelativa: number;
  };
  /** Arquivos em /public/templates/claro/ */
  assets: {
    pdfPadrao: string;
    preview: string;
    logoClaro: string;
    logoEstrategic: string;
    marcaDagua: string;
  };
};

export type ClienteRelatorioTemplateSchema = {
  versao: number;
  layout: string;
  origem?: string;
  nota?: string;
  /** Descrição da folha padronizada (branding). */
  visual: ClienteRelatorioLayoutVisual;
  /** Seções de dados a renderizar sobre a folha. */
  secoes: ClienteRelatorioTemplateSecao[];
};

export type ClienteRelatorio = {
  id: string;
  slug: string;
  nome: string;
  ativo: boolean;
  is_sistema: boolean;
  template_pdf_storage_path: string | null;
  template_schema: ClienteRelatorioTemplateSchema | Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

const CLARO_ASSETS_BASE = "/templates/claro";

export const CLARO_LAYOUT_VISUAL: ClienteRelatorioLayoutVisual = {
  id: "claro_folha_padrao",
  orientacao: "landscape",
  paginaPt: { largura: 1440, altura: 810 },
  proporcao: "16:9",
  cores: {
    primaria: "#E30613",
    fundo: "#F3F4F6",
    texto: "#1F2937",
  },
  faixaTopo: {
    cor: "#E30613",
    alturaRelativa: 0.055,
  },
  marcaDagua: {
    asset: `${CLARO_ASSETS_BASE}/marca-dagua-claro.png`,
    posicao: "esquerda",
    opacidade: 0.08,
  },
  rodape: {
    esquerda: {
      asset: `${CLARO_ASSETS_BASE}/logo-estrategic.png`,
      label: "estratégic ENGENHARIA",
    },
    direita: {
      asset: `${CLARO_ASSETS_BASE}/logo-claro.png`,
      label: "Claro",
    },
  },
  areaConteudo: {
    margemTopoRelativa: 0.1,
    margemBaseRelativa: 0.14,
    margemLateralRelativa: 0.05,
  },
  assets: {
    pdfPadrao: `${CLARO_ASSETS_BASE}/padrao-relatorio-transmissao.pdf`,
    preview: `${CLARO_ASSETS_BASE}/preview.png`,
    logoClaro: `${CLARO_ASSETS_BASE}/logo-claro.png`,
    logoEstrategic: `${CLARO_ASSETS_BASE}/logo-estrategic.png`,
    marcaDagua: `${CLARO_ASSETS_BASE}/marca-dagua-claro.png`,
  },
};

/** Schema Claro: folha oficial + seções do payload de campo. */
export const CLARO_TEMPLATE_SCHEMA: ClienteRelatorioTemplateSchema = {
  versao: 2,
  layout: "claro_padrao",
  origem: "padrao-relatorio-transmissao.pdf",
  nota:
    "Folha padronizada oficial Claro (paisagem 1440×810). Conteúdo do relatório é composto na área central sobre este fundo.",
  visual: CLARO_LAYOUT_VISUAL,
  secoes: [
    {
      id: "cabecalho",
      titulo: "Dados cadastrais",
      fonte: "colunas",
      campos: [
        "os_wf",
        "cliente",
        "cliente_operadora",
        "endereco",
        "cidade",
        "equipe_empreiteira",
        "responsavel",
        "data_inicio_execucao",
        "tipo_execucao",
        "tecnicos_nomes",
      ],
    },
    {
      id: "rede_externa",
      titulo: "Rede Externa (RE)",
      fonte: "payload",
      flags: ["lancamentoRe"],
      metragens: "metragensCabo",
      quantidades: "redeAcesso",
      gruposFoto: [
        "posteConexao",
        "caixaEmenda",
        "plaquetaIdentificacao",
        "novoAterramentoPoste",
        "aterramentoTerrometro",
        "posicaoConexaoEstacao",
        "etiquetaIdentificacao",
        "sobraTecnica",
      ],
      outrasFotos: "outrasFotos",
    },
    {
      id: "rede_cliente",
      titulo: "Rede Cliente (RC)",
      fonte: "payload",
      flags: ["lancamentoRc"],
      metragens: "metragensCaboRc",
      quantidades: "redeCliente",
      tecnologia: "tecnologiaAcesso",
      gruposFoto: [
        "rcPosteConexao",
        "rcCaixaEmenda",
        "rcTerminacaoCabo",
        "rcPlaquetaIdentificacao",
        "rcEntradaInterna",
        "rcEntradaExterna",
      ],
      outrasFotos: "outrasFotosRc",
    },
    {
      id: "equipamentos_cliente",
      titulo: "Equipamentos no Cliente",
      fonte: "payload",
      gruposFoto: [
        "eqClienteFachada",
        "eqClienteAmbiente",
        "eqClienteRack",
        "eqClienteSgp",
      ],
      outrasFotos: "outrasFotosEqCliente",
    },
    {
      id: "equipamentos_estacao",
      titulo: "Equipamentos na Estação",
      fonte: "payload",
      flags: ["relatorioEstacao"],
      campos: ["estacaoEntregaAcesso"],
      gruposFoto: [
        "eqEstacaoGeral",
        "eqEstacaoRack",
        "eqEstacaoEquipamento",
        "eqEstacaoEtiqueta",
        "eqEstacaoDgo",
      ],
      outrasFotos: "outrasFotosEqEstacao",
    },
    {
      id: "testes",
      titulo: "Testes ópticos e de potência",
      fonte: "payload",
      blocos: [
        "testeOptico",
        "testePotenciaEmpresarial",
        "testePotenciaImplantacao",
        "testePotencia1550",
        "testePotencia1330",
      ],
    },
  ],
};
