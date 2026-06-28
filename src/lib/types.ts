export type UserRole = "admin" | "tecnico";

export type AppUser = {
  id: string;
  email: string;
  identificacao?: string;
  login?: string;
  nome: string;
  role: UserRole;
};

export type Evidencia = {
  id: string;
  contrato: string;
  wo: string;
  metragem_inicial: number;
  metragem_final: number;
  total_utilizado: number;
  foto_inicio_url: string;
  foto_fim_url: string;
  foto_inicio_path: string;
  foto_fim_path: string;
  data_registro: string;
  tecnico_id: string;
  tecnico_nome?: string;
  tecnico_login?: string;
};

/** Foto já comprimida e enviada direto ao Supabase Storage (browser). */
export type EvidencePhotoRef = {
  path: string;
  publicUrl: string;
};

export type EvidenciaInsert = {
  contrato: string;
  wo: string;
  metragem_inicial: number;
  metragem_final: number;
  total_utilizado: number;
  foto_inicio_url: string;
  foto_fim_url: string;
  foto_inicio_path: string;
  foto_fim_path: string;
  tecnico_id: string;
};
