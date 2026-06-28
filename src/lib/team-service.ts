import { deleteTecnicoEvidencePhotos } from "./evidencias-service";
import { getSupabaseClient } from "./supabase";

export type TecnicoProfile = {
  id: string;
  nome: string;
  identificacao: string | null;
  login: string | null;
};

export async function fetchTecnicos(): Promise<TecnicoProfile[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, nome, identificacao, login")
    .eq("role", "tecnico")
    .order("nome", { ascending: true });

  if (error) throw error;
  return data ?? [];
}

export async function deleteTecnico(tecnicoId: string): Promise<void> {
  await deleteTecnicoEvidencePhotos(tecnicoId);

  const supabase = getSupabaseClient();
  const { error } = await supabase.rpc("delete_tecnico", { target_id: tecnicoId });
  if (error) throw error;
}
