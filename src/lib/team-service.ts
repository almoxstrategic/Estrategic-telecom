import { deleteTecnicoEvidencePhotos } from "./evidencias-service";
import { getSupabaseClient } from "./supabase";

export type TecnicoStatus = "ATIVO" | "DEMITIDO";

export type TecnicoProfile = {
  id: string;
  nome: string;
  identificacao: string | null;
  login: string | null;
  celular: string | null;
  created_at: string | null;
  status: TecnicoStatus;
};

function normalizeStatus(value: unknown): TecnicoStatus {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  if (raw === "DEMITIDO") return "DEMITIDO";
  return "ATIVO";
}

function mapTecnicoRow(row: {
  id: string;
  nome: string;
  identificacao: string | null;
  login: string | null;
  celular: string | null;
  created_at: string | null;
  status?: string | null;
}): TecnicoProfile {
  return {
    id: row.id,
    nome: row.nome,
    identificacao: row.identificacao,
    login: row.login,
    celular: row.celular,
    created_at: row.created_at,
    status: normalizeStatus(row.status),
  };
}

/** Chaves normalizadas (matrícula, login, id, nome) dos técnicos demitidos. */
export function buildTecnicosDemitidosKeys(tecnicos: TecnicoProfile[]): Set<string> {
  const keys = new Set<string>();
  for (const tecnico of tecnicos) {
    if (tecnico.status !== "DEMITIDO") continue;
    for (const raw of [tecnico.identificacao, tecnico.login, tecnico.id, tecnico.nome]) {
      const key = raw?.trim().toUpperCase();
      if (key) keys.add(key);
    }
  }
  return keys;
}

export function isTecnicoDemitido(
  demitidosKeys: Set<string>,
  idTecnico: string,
  nomeTecnico?: string | null,
): boolean {
  if (demitidosKeys.has(idTecnico.trim().toUpperCase())) return true;
  const nome = nomeTecnico?.trim();
  if (nome && demitidosKeys.has(nome.toUpperCase())) return true;
  return false;
}

export async function fetchTecnicos(): Promise<TecnicoProfile[]> {
  const supabase = getSupabaseClient();
  const withStatus = await supabase
    .from("profiles")
    .select("id, nome, identificacao, login, celular, created_at, status")
    .eq("role", "tecnico")
    .order("nome", { ascending: true });

  if (!withStatus.error) {
    return (withStatus.data ?? []).map(mapTecnicoRow);
  }

  // Fallback se a coluna status ainda não existir no banco.
  const fallback = await supabase
    .from("profiles")
    .select("id, nome, identificacao, login, celular, created_at")
    .eq("role", "tecnico")
    .order("nome", { ascending: true });

  if (fallback.error) throw fallback.error;
  return (fallback.data ?? []).map(mapTecnicoRow);
}

export async function updateTecnicoStatus(
  tecnicoId: string,
  status: TecnicoStatus,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("profiles")
    .update({ status })
    .eq("id", tecnicoId)
    .eq("role", "tecnico");

  if (error) throw error;
}

export async function deleteTecnico(tecnicoId: string): Promise<void> {
  await deleteTecnicoEvidencePhotos(tecnicoId);

  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("delete_tecnico", { target_id: tecnicoId });
  if (error) throw error;
}
