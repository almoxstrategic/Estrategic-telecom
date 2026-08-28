import { getSupabaseClient } from "./supabase";
import { normalizeUserRole } from "./roles";
import type { TecnicoProfile, TecnicoStatus } from "./team-service";

export type EquipeTransmissao = {
  id: string;
  nome: string;
  created_at: string;
  updated_at: string;
  tecnicos: TecnicoProfile[];
};

type DbEquipeRow = {
  id: string;
  nome: string;
  created_at: string;
  updated_at: string;
  equipe_transmissao_tecnicos?: Array<{
    tecnico_id: string;
    profiles?:
      | {
          id: string;
          nome: string;
          identificacao: string | null;
          login: string | null;
          celular: string | null;
          created_at: string | null;
          status?: string | null;
          role?: string | null;
        }
      | Array<{
          id: string;
          nome: string;
          identificacao: string | null;
          login: string | null;
          celular: string | null;
          created_at: string | null;
          status?: string | null;
          role?: string | null;
        }>
      | null;
  }> | null;
};

const EQUIPE_SELECT = `
  id,
  nome,
  created_at,
  updated_at,
  equipe_transmissao_tecnicos (
    tecnico_id,
    profiles:tecnico_id (
      id,
      nome,
      identificacao,
      login,
      celular,
      created_at,
      status,
      role
    )
  )
`;

function normalizeStatus(value: unknown): TecnicoStatus {
  const raw = String(value ?? "")
    .trim()
    .toUpperCase();
  return raw === "DEMITIDO" ? "DEMITIDO" : "ATIVO";
}

function mapTecnicoFromJoin(
  row: NonNullable<DbEquipeRow["equipe_transmissao_tecnicos"]>[number],
): TecnicoProfile | null {
  const rawProfile = row.profiles;
  const profile = Array.isArray(rawProfile) ? rawProfile[0] : rawProfile;
  if (!profile?.id) return null;
  return {
    id: profile.id,
    nome: profile.nome,
    identificacao: profile.identificacao,
    login: profile.login,
    celular: profile.celular,
    created_at: profile.created_at,
    status: normalizeStatus(profile.status),
    role: normalizeUserRole(profile.role),
  };
}

function mapEquipeRow(row: DbEquipeRow): EquipeTransmissao {
  const tecnicos = (row.equipe_transmissao_tecnicos ?? [])
    .map(mapTecnicoFromJoin)
    .filter((tecnico): tecnico is TecnicoProfile => tecnico !== null)
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
  return {
    id: row.id,
    nome: row.nome,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tecnicos,
  };
}

function normalizeNome(nome: string): string {
  const trimmed = nome.trim();
  if (!trimmed) throw new Error("Informe o nome da equipe.");
  return trimmed;
}

function uniqueTecnicos(tecnicos: TecnicoProfile[]): TecnicoProfile[] {
  const map = new Map<string, TecnicoProfile>();
  for (const tecnico of tecnicos) {
    if (tecnico.id) map.set(tecnico.id, tecnico);
  }
  return [...map.values()];
}

async function syncEquipeTecnicos(equipeId: string, tecnicos: TecnicoProfile[]): Promise<void> {
  const supabase = getSupabaseClient();
  const unique = uniqueTecnicos(tecnicos);

  const { error: deleteError } = await supabase
    .from("equipe_transmissao_tecnicos")
    .delete()
    .eq("equipe_id", equipeId);
  if (deleteError) throw deleteError;

  if (unique.length === 0) return;

  const { error: insertError } = await supabase.from("equipe_transmissao_tecnicos").insert(
    unique.map((tecnico) => ({
      equipe_id: equipeId,
      tecnico_id: tecnico.id,
    })),
  );
  if (insertError) throw insertError;
}

async function fetchEquipeById(id: string): Promise<EquipeTransmissao> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("equipes_transmissao")
    .select(EQUIPE_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Equipe não encontrada.");
  return mapEquipeRow(data as unknown as DbEquipeRow);
}

export async function fetchEquipesTransmissao(): Promise<EquipeTransmissao[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("equipes_transmissao")
    .select(EQUIPE_SELECT)
    .order("nome", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => mapEquipeRow(row as unknown as DbEquipeRow));
}

export async function createEquipeTransmissao(input: {
  nome: string;
  tecnicos: TecnicoProfile[];
}): Promise<EquipeTransmissao> {
  const nome = normalizeNome(input.nome);
  const tecnicos = uniqueTecnicos(input.tecnicos);
  if (tecnicos.length === 0) {
    throw new Error("Selecione ao menos um técnico de transmissão.");
  }

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("equipes_transmissao")
    .insert({ nome })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") {
      throw new Error("Já existe uma equipe com este nome.");
    }
    throw error;
  }

  try {
    await syncEquipeTecnicos(data.id, tecnicos);
    return fetchEquipeById(data.id);
  } catch (err) {
    await supabase.from("equipes_transmissao").delete().eq("id", data.id);
    throw err;
  }
}

export async function updateEquipeTransmissao(
  id: string,
  input: { nome: string; tecnicos: TecnicoProfile[] },
): Promise<EquipeTransmissao> {
  const nome = normalizeNome(input.nome);
  const tecnicos = uniqueTecnicos(input.tecnicos);
  if (tecnicos.length === 0) {
    throw new Error("Selecione ao menos um técnico de transmissão.");
  }

  const supabase = getSupabaseClient();
  const { error } = await supabase.from("equipes_transmissao").update({ nome }).eq("id", id);
  if (error) {
    if (error.code === "23505") {
      throw new Error("Já existe uma equipe com este nome.");
    }
    throw error;
  }

  await syncEquipeTecnicos(id, tecnicos);
  return fetchEquipeById(id);
}

export async function deleteEquipeTransmissao(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("equipes_transmissao").delete().eq("id", id);
  if (error) throw error;
}

export function findEquipeByNome(
  equipes: EquipeTransmissao[],
  nome: string | null | undefined,
): EquipeTransmissao | undefined {
  const key = nome?.trim().toLowerCase();
  if (!key) return undefined;
  return equipes.find((equipe) => equipe.nome.trim().toLowerCase() === key);
}
