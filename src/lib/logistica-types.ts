export type WoCabecalhoRow = {
  work_order_id: string;
  id_tecnico: string;
  status: number;
  sla: number;
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

export type PendenciaEvidencia = {
  work_order_id: string;
  id_tecnico: string;
  nome_tecnico: string;
  login_tecnico: string;
  sla: number;
  celular: string;
  tem_evidencia: boolean;
  evidencia_data_registro: string | null;
};

export type UpsertResult = {
  inserted: number;
  updated: number;
};
