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
};

export type KpiTopMaterial = {
  descricao: string;
  sku: string;
  total: number;
};

export type KpiTopTecnico = {
  id_tecnico: string;
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
  sla: number;
  celular: string;
};

export type UpsertResult = {
  inserted: number;
  updated: number;
};
