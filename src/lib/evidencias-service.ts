import { getStoragePublicUrl, getSupabaseClient } from "./supabase";
import type { Evidencia, EvidenciaInsert } from "./types";

const EVIDENCIAS_BUCKET = "evidencias-fotos";

function assertBrowserUpload(): void {
  if (typeof window === "undefined") {
    throw new Error("Upload de fotos deve ocorrer no navegador, não no servidor.");
  }
}

type PhotoPathsRow = {
  foto_inicio_path?: string | null;
  foto_fim_path?: string | null;
};

export function collectPhotoPaths(rows: PhotoPathsRow[]): string[] {
  return rows
    .flatMap((row) => [row.foto_inicio_path, row.foto_fim_path])
    .filter((path): path is string => typeof path === "string" && path.trim() !== "");
}

export async function removeEvidencePhotos(paths: string[]): Promise<void> {
  if (paths.length === 0) return;

  const supabase = getSupabaseClient();
  const { error } = await supabase.storage.from(EVIDENCIAS_BUCKET).remove(paths);
  if (error) throw error;
}

export async function deleteTecnicoEvidencePhotos(tecnicoId: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("evidencias")
    .select("foto_inicio_path, foto_fim_path")
    .eq("tecnico_id", tecnicoId);

  if (error) throw error;
  await removeEvidencePhotos(collectPhotoPaths(data ?? []));
}

type DbEvidencia = Evidencia & {
  profiles?: { nome: string; login?: string | null } | null;
};

function mapRow(row: DbEvidencia): Evidencia {
  return {
    id: row.id,
    contrato: row.contrato,
    wo: row.wo,
    metragem_inicial: Number(row.metragem_inicial),
    metragem_final: Number(row.metragem_final),
    total_utilizado: Number(row.total_utilizado),
    foto_inicio_url: row.foto_inicio_url,
    foto_fim_url: row.foto_fim_url,
    foto_inicio_path: row.foto_inicio_path,
    foto_fim_path: row.foto_fim_path,
    data_registro: row.data_registro,
    tecnico_id: row.tecnico_id,
    tecnico_nome: row.profiles?.nome ?? row.tecnico_nome,
    tecnico_login: row.profiles?.login ?? row.tecnico_login ?? undefined,
  };
}

export async function fetchMyEvidencias(tecnicoId: string): Promise<Evidencia[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("evidencias")
    .select("*")
    .eq("tecnico_id", tecnicoId)
    .order("data_registro", { ascending: false });

  if (error) throw error;
  return (data ?? []).map(mapRow);
}

export async function fetchAllEvidencias(): Promise<Evidencia[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("evidencias")
    .select("*")
    .order("data_registro", { ascending: false });

  if (error) throw error;

  const { data: profiles, error: profilesError } = await supabase
    .from("profiles")
    .select("id, nome, login");

  if (profilesError) throw profilesError;

  const profileById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      { nome: profile.nome, login: profile.login ?? undefined },
    ]),
  );

  return (data ?? []).map((row) => {
    const profile = profileById.get(row.tecnico_id);
    return mapRow({
      ...(row as DbEvidencia),
      tecnico_nome: profile?.nome,
      tecnico_login: profile?.login,
    });
  });
}

/** Upload direto browser → Supabase Storage (sem passar pelo Vercel/serverless). */
export async function uploadEvidencePhoto(
  tecnicoId: string,
  file: File,
  suffix: "inicio" | "fim",
): Promise<{ path: string; publicUrl: string }> {
  assertBrowserUpload();

  const supabase = getSupabaseClient();
  const path = `${tecnicoId}/${crypto.randomUUID()}-${suffix}.jpg`;

  const { error } = await supabase.storage.from(EVIDENCIAS_BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: "image/jpeg",
  });

  if (error) throw error;

  return { path, publicUrl: getStoragePublicUrl(path) };
}

export async function insertEvidencia(payload: EvidenciaInsert): Promise<Evidencia> {
  assertBrowserUpload();

  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("evidencias")
    .insert(payload)
    .select("*")
    .single();

  if (error) throw error;
  return mapRow(data as DbEvidencia);
}

export async function deleteEvidenciasWithPhotos(ids: string[]): Promise<void> {
  if (ids.length === 0) return;

  const supabase = getSupabaseClient();
  const { data: rows, error: fetchError } = await supabase
    .from("evidencias")
    .select("id, foto_inicio_path, foto_fim_path")
    .in("id", ids);

  if (fetchError) throw fetchError;

  await removeEvidencePhotos(collectPhotoPaths(rows ?? []));

  const { error: deleteError } = await supabase.from("evidencias").delete().in("id", ids);
  if (deleteError) throw deleteError;
}
