export type WoCabecalhoRow = {
  work_order_id: string;
  id_tecnico: string;
  status: number;
  sla: number;
  dataAtendimento: string | null;
};

export type WoConsumoRow = {
  work_order_id: string;
  id_tecnico: string;
  material: string;
  descr_material: string;
  qtd_baixada: number;
  data_atendimento: string | null;
};

export type KpisFiltro = {
  mes: number | null;
  ano: number | null;
};

export type ConsumoTecnicoItem = {
  material: string;
  descr_material: string;
  qtd_baixada: number;
};

export type ConsumoItemCritico = {
  material: string;
  descr_material: string;
  total: number;
};

export type DimMaterialRow = {
  material: string;
  descr_material: string;
};

export type DimMaterial = DimMaterialRow;

export type EstoqueFisicoRow = {
  material: string;
  descricao_material: string;
  quantidade_fisica: number;
  quantidade_campo: number;
};

export type PeriodoConsumo = {
  mes: number;
  ano: number;
};

export type KpiTopMaterial = {
  descricao: string;
  sku: string;
  total: number;
};

export type KpiTopTecnico = {
  id_tecnico: string;
  nome_tecnico: string;
  total: number;
};

export type TopConsumidorMaterial = {
  id_tecnico: string;
  nome_tecnico: string;
  total: number;
};

export type KpisConsumo = {
  total_itens: number;
  total_wos: number;
  top_materiais: KpiTopMaterial[];
  top_tecnicos: KpiTopTecnico[];
};

export type KpisDetalheWo = {
  work_order_id: string;
  id_tecnico: string;
  nome_tecnico: string;
  total_itens: number;
  data_atendimento: string | null;
};

export type KpisDetalheItem = {
  material: string;
  descr_material: string;
  total: number;
};

export type KpisDetalheWoMaterial = {
  material: string;
  descr_material: string;
  qtd_baixada: number;
};

export type KpisDetalheWoSelecionada = {
  work_order_id: string;
  id_tecnico: string;
  nome_tecnico: string;
};

export type PendenciaEvidencia = {
  work_order_id: string;
  id_tecnico: string;
  nome_tecnico: string;
  login_tecnico: string;
  sla: number;
  celular: string;
  tem_evidencia: boolean;
  evidencia_data_registro: string | null;
  numero_cobrancas: number;
  ultima_data_cobranca: string | null;
  dataAtendimento: string | null;
};

export type UpsertResult = {
  inserted: number;
  updated: number;
};

export type EngajamentoTecnico = {
  tecnico_id: string;
  nome_tecnico: string;
  proprias: number;
  via_admin: number;
};

export type HistoricoLancamento = {
  id: string;
  data_registro: string;
  wo: string;
  tecnico_id: string;
  nome_tecnico: string;
  enviado_por_admin: boolean;
};

export type MediaBaixaTecnicoFiltro = {
  mes: number | null;
  ano: number | null;
};

export type MediaBaixaTecnicoItem = {
  id_tecnico: string;
  nome_tecnico: string;
  material: string;
  descr_material: string;
  estoque_tecnico: number;
  media_consumo: number;
  autonomia_dias: number | null;
};
