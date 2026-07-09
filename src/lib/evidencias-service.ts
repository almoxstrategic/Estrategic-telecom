import type { EngajamentoTecnico, HistoricoLancamento } from "./logistica-types";
import { readClientEvidenciaWebhookSecret } from "./evidencia-webhook-secret";
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
  profiles?: { nome: string; login?: string | null; identificacao?: string | null } | null;
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
    enviado_por_admin: Boolean(row.enviado_por_admin),
    tipo_material: row.tipo_material ?? null,
    observacao: row.observacao ?? null,
    envio_grupo_id: row.envio_grupo_id ?? null,
    tecnico_nome: row.profiles?.nome ?? row.tecnico_nome,
    tecnico_login: row.profiles?.login ?? row.tecnico_login ?? undefined,
    tecnico_identificacao:
      row.profiles?.identificacao ?? row.tecnico_identificacao ?? undefined,
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
    .select("id, nome, login, identificacao");

  if (profilesError) throw profilesError;

  const profileById = new Map(
    (profiles ?? []).map((profile) => [
      profile.id,
      {
        nome: profile.nome,
        login: profile.login ?? undefined,
        identificacao: profile.identificacao ?? undefined,
      },
    ]),
  );

  return (data ?? []).map((row) => {
    const profile = profileById.get(row.tecnico_id);
    return mapRow({
      ...(row as DbEvidencia),
      tecnico_nome: profile?.nome,
      tecnico_login: profile?.login,
      tecnico_identificacao: profile?.identificacao,
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

type BatchMaterialInput = {
  tipo: string;
  metragem: string;
  foto_inicio_url: string;
  foto_fim_url: string;
  foto_inicio_path: string;
  foto_fim_path: string;
};

type BatchFormInput = {
  accessToken: string;
  tecnicoId: string;
  contrato: string;
  wo: string;
  envioGrupoId: string;
  observacao?: string;
  materiais: BatchMaterialInput[];
};

export async function notifyEvidenciaEmailBatch(input: BatchFormInput): Promise<void> {
  assertBrowserUpload();

  const webhookSecret = readClientEvidenciaWebhookSecret();
  if (!webhookSecret) {
    console.warn(
      "AVISO: A variável NEXT_PUBLIC_EVIDENCIA_WEBHOOK_SECRET está indefinida no frontend.",
    );
  }

  const response = await fetch("/api/evidencias/notify-email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(webhookSecret ? { "x-evidencia-webhook-secret": webhookSecret } : {}),
    },
    body: JSON.stringify({
      access_token: input.accessToken,
      tecnico_id: input.tecnicoId,
      contrato: input.contrato,
      wo: input.wo,
      observacao: input.observacao,
      webhook_secret: webhookSecret,
      materiais: input.materiais.map((material) => ({
        tipo: material.tipo,
        metragem: material.metragem,
        foto_inicio_url: material.foto_inicio_url,
        foto_fim_url: material.foto_fim_url,
      })),
    }),
  });

  const body = (await response.json().catch(() => null)) as { error?: string } | null;

  if (!response.ok) {
    throw new Error(
      body?.error || "Falha no envio do e-mail. Webhook não autorizado ou indisponível.",
    );
  }
}

export async function saveEvidenciaBatchRecords(
  input: BatchFormInput,
): Promise<{ count: number }> {
  assertBrowserUpload();

  const response = await fetch("/api/evidencias/batch-submit", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      access_token: input.accessToken,
      tecnico_id: input.tecnicoId,
      contrato: input.contrato,
      wo: input.wo,
      envio_grupo_id: input.envioGrupoId,
      observacao: input.observacao,
      materiais: input.materiais,
    }),
  });

  const body = (await response.json().catch(() => null)) as
    | { count?: number; error?: string }
    | null;

  if (!response.ok) {
    throw new Error(body?.error || "Erro ao salvar evidências.");
  }

  return { count: body?.count ?? input.materiais.length };
}

/** @deprecated Use notifyEvidenciaEmailBatch + saveEvidenciaBatchRecords */
export async function submitEvidenciaBatchForm(input: BatchFormInput): Promise<{ count: number }> {
  await notifyEvidenciaEmailBatch(input);
  return saveEvidenciaBatchRecords(input);
}

export async function submitEvidenciaForm(input: {
  accessToken: string;
  tecnicoId: string;
  contrato: string;
  wo: string;
  metragem_inicial: number;
  metragem_final: number;
  total_utilizado: number;
  fotoInicio: File;
  fotoFim: File;
  tipo_material?: string;
  observacao?: string;
}): Promise<Evidencia> {
  assertBrowserUpload();

  const formData = new FormData();
  formData.append("access_token", input.accessToken);
  formData.append("tecnico_id", input.tecnicoId);
  formData.append("contrato", input.contrato);
  formData.append("wo", input.wo);
  formData.append("metragem_inicial", String(input.metragem_inicial));
  formData.append("metragem_final", String(input.metragem_final));
  formData.append("total_utilizado", String(input.total_utilizado));
  formData.append("foto_inicio", input.fotoInicio, input.fotoInicio.name);
  formData.append("foto_fim", input.fotoFim, input.fotoFim.name);
  if (input.tipo_material?.trim()) {
    formData.append("tipo_material", input.tipo_material.trim());
  }
  if (input.observacao?.trim()) {
    formData.append("observacao", input.observacao.trim());
  }

  const response = await fetch("/api/evidencias/submit", {
    method: "POST",
    body: formData,
  });

  const body = (await response.json().catch(() => null)) as
    | (Evidencia & { error?: string })
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(body?.error || "Erro ao enviar evidência.");
  }

  return body as Evidencia;
}

export async function submitEvidenciaFormAsAdmin(input: {
  accessToken: string;
  tecnicoId: string;
  contrato: string;
  wo: string;
  metragem_inicial: number;
  metragem_final: number;
  total_utilizado: number;
  fotoInicio: File;
  fotoFim: File;
}): Promise<Evidencia> {
  assertBrowserUpload();

  const formData = new FormData();
  formData.append("access_token", input.accessToken);
  formData.append("tecnico_id", input.tecnicoId);
  formData.append("contrato", input.contrato);
  formData.append("wo", input.wo);
  formData.append("metragem_inicial", String(input.metragem_inicial));
  formData.append("metragem_final", String(input.metragem_final));
  formData.append("total_utilizado", String(input.total_utilizado));
  formData.append("foto_inicio", input.fotoInicio, input.fotoInicio.name);
  formData.append("foto_fim", input.fotoFim, input.fotoFim.name);

  const response = await fetch("/api/evidencias/admin-submit", {
    method: "POST",
    body: formData,
  });

  const body = (await response.json().catch(() => null)) as
    | (Evidencia & { error?: string })
    | { error?: string }
    | null;

  if (!response.ok) {
    throw new Error(body?.error || "Erro ao enviar evidência.");
  }

  return body as Evidencia;
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

export async function updateEvidenciaWoContrato(
  id: string,
  payload: { wo: string; contrato: string },
): Promise<Evidencia> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("evidencias")
    .update({
      wo: payload.wo.trim(),
      contrato: payload.contrato.trim(),
    })
    .eq("id", id)
    .select("*")
    .single();

  if (error) throw error;
  return mapRow(data as DbEvidencia);
}

export async function fetchEngajamentoEvidencias(): Promise<EngajamentoTecnico[]> {
  const evidencias = await fetchAllEvidencias();
  const byTecnico = new Map<string, EngajamentoTecnico>();

  for (const ev of evidencias) {
    const nome = ev.tecnico_nome?.trim() || "Técnico";
    const current = byTecnico.get(ev.tecnico_id) ?? {
      tecnico_id: ev.tecnico_id,
      nome_tecnico: nome,
      proprias: 0,
      via_admin: 0,
    };

    if (ev.enviado_por_admin) {
      current.via_admin += 1;
    } else {
      current.proprias += 1;
    }

    byTecnico.set(ev.tecnico_id, current);
  }

  return [...byTecnico.values()].sort((a, b) => {
    if (b.via_admin !== a.via_admin) return b.via_admin - a.via_admin;
    return b.proprias - a.proprias;
  });
}

export async function fetchHistoricoLancamentos(): Promise<HistoricoLancamento[]> {
  const evidencias = await fetchAllEvidencias();
  return evidencias.map((ev) => ({
    id: ev.id,
    data_registro: ev.data_registro,
    wo: ev.wo,
    tecnico_id: ev.tecnico_id,
    nome_tecnico: ev.tecnico_nome?.trim() || "Técnico",
    enviado_por_admin: ev.enviado_por_admin,
  }));
}
