import type { Evidencia } from "./types";

export type EvidenciaMaterial = {
  id: string;
  tipo: string;
  total_utilizado: number;
  metragem: string;
  foto_inicio_url: string;
  foto_fim_url: string;
};

export type EvidenciaEnvioAgrupado = {
  id: string;
  contrato: string;
  wo: string;
  data_registro: string;
  observacao?: string | null;
  materiais: EvidenciaMaterial[];
  tecnico_id?: string;
  tecnico_nome?: string | null;
  tecnico_login?: string | null;
  tecnico_identificacao?: string | null;
};

function formatMetragemDisplay(value: number): string {
  return Number.isInteger(value) ? String(value) : String(value);
}

function groupKey(record: Evidencia): string {
  if (record.envio_grupo_id) return record.envio_grupo_id;
  return `${record.contrato}|${record.wo}|${record.data_registro.slice(0, 16)}`;
}

export function groupEvidenciasPorEnvio(records: Evidencia[]): EvidenciaEnvioAgrupado[] {
  const groups = new Map<string, EvidenciaEnvioAgrupado>();

  for (const record of records) {
    const key = groupKey(record);
    const existing = groups.get(key) ?? {
      id: record.envio_grupo_id ?? record.id,
      contrato: record.contrato,
      wo: record.wo,
      data_registro: record.data_registro,
      observacao: record.observacao,
      materiais: [],
      tecnico_id: record.tecnico_id,
      tecnico_nome: record.tecnico_nome,
      tecnico_login: record.tecnico_login,
      tecnico_identificacao: record.tecnico_identificacao,
    };

    if (!existing.observacao && record.observacao) {
      existing.observacao = record.observacao;
    }
    if (!existing.tecnico_nome && record.tecnico_nome) {
      existing.tecnico_nome = record.tecnico_nome;
    }
    if (!existing.tecnico_login && record.tecnico_login) {
      existing.tecnico_login = record.tecnico_login;
    }
    if (!existing.tecnico_identificacao && record.tecnico_identificacao) {
      existing.tecnico_identificacao = record.tecnico_identificacao;
    }

    existing.materiais.push({
      id: record.id,
      tipo: record.tipo_material?.trim() || "Material",
      total_utilizado: record.total_utilizado,
      metragem: formatMetragemDisplay(record.total_utilizado),
      foto_inicio_url: record.foto_inicio_url,
      foto_fim_url: record.foto_fim_url,
    });

    groups.set(key, existing);
  }

  return [...groups.values()].sort((a, b) =>
    a.data_registro < b.data_registro ? 1 : -1,
  );
}

export function isStoragePublicUrl(url: string): boolean {
  const value = url.trim();
  if (!value) return false;
  if (value.startsWith("blob:") || value.startsWith("data:")) return false;
  return /^https?:\/\//i.test(value);
}
