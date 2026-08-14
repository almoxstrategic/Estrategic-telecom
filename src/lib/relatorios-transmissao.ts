import { getStoragePublicUrl, getSupabaseClient } from "./supabase";

export type RelatorioStatus = "em_aberto" | "avisado" | "fechado";
export type TipoExecucao = "implantacao" | "empresarial";

export type StoredPhoto = {
  url: string;
  path: string;
};

export type FotoGrupoPayload = {
  fotos: StoredPhoto[];
  obs: string;
};

export type OutraFotoPayload = {
  id: string;
  ref: string;
  foto: StoredPhoto | null;
  obs: string;
};

export type RelatorioPayload = {
  lancamentoRe: boolean | null;
  qntPostesRe: string;
  metragemRe: {
    fotoInicio: StoredPhoto | null;
    fotoFim: StoredPhoto | null;
    metragem: string;
    obs: string;
  };
  posteConexao: FotoGrupoPayload;
  caixaEmenda: FotoGrupoPayload;
  sobraTecnica: FotoGrupoPayload;
  aterramentoTerrometro: FotoGrupoPayload;
  novoAterramentoPoste: FotoGrupoPayload;
  posicaoConexaoEstacao: FotoGrupoPayload;
  etiquetaIdentificacao: FotoGrupoPayload;
  outrasFotos: OutraFotoPayload[];
};

export type RelatorioTransmissao = {
  id: string;
  tecnico_id: string;
  os_wf: string;
  cliente: string;
  endereco: string;
  cidade: string;
  equipe_empreiteira: string;
  responsavel: string;
  data_inicio_execucao: string;
  tipo_execucao: TipoExecucao | null;
  status: RelatorioStatus;
  payload: RelatorioPayload;
  avisado_at: string | null;
  fechado_at: string | null;
  created_at: string;
  updated_at: string;
  tecnico_nome?: string;
};

export type RelatorioDraftPatch = {
  cliente?: string;
  endereco?: string;
  cidade?: string;
  equipe_empreiteira?: string;
  responsavel?: string;
  data_inicio_execucao?: string | null;
  tipo_execucao?: TipoExecucao | null;
  payload?: RelatorioPayload;
};

export function emptyRelatorioPayload(): RelatorioPayload {
  return {
    lancamentoRe: null,
    qntPostesRe: "",
    metragemRe: { fotoInicio: null, fotoFim: null, metragem: "", obs: "" },
    posteConexao: { fotos: [], obs: "" },
    caixaEmenda: { fotos: [], obs: "" },
    sobraTecnica: { fotos: [], obs: "" },
    aterramentoTerrometro: { fotos: [], obs: "" },
    novoAterramentoPoste: { fotos: [], obs: "" },
    posicaoConexaoEstacao: { fotos: [], obs: "" },
    etiquetaIdentificacao: { fotos: [], obs: "" },
    outrasFotos: [],
  };
}

function parsePayload(raw: unknown): RelatorioPayload {
  const base = emptyRelatorioPayload();
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Partial<RelatorioPayload>;
  return {
    ...base,
    ...src,
    metragemRe: { ...base.metragemRe, ...src.metragemRe },
    posteConexao: { ...base.posteConexao, ...src.posteConexao },
    caixaEmenda: { ...base.caixaEmenda, ...src.caixaEmenda },
    sobraTecnica: { ...base.sobraTecnica, ...src.sobraTecnica },
    aterramentoTerrometro: { ...base.aterramentoTerrometro, ...src.aterramentoTerrometro },
    novoAterramentoPoste: { ...base.novoAterramentoPoste, ...src.novoAterramentoPoste },
    posicaoConexaoEstacao: { ...base.posicaoConexaoEstacao, ...src.posicaoConexaoEstacao },
    etiquetaIdentificacao: { ...base.etiquetaIdentificacao, ...src.etiquetaIdentificacao },
    outrasFotos: src.outrasFotos ?? [],
  };
}

type DbRow = {
  id: string;
  tecnico_id: string;
  os_wf: string;
  cliente: string | null;
  endereco: string | null;
  cidade: string | null;
  equipe_empreiteira: string | null;
  responsavel: string | null;
  data_inicio_execucao: string | null;
  tipo_execucao: TipoExecucao | null;
  status: RelatorioStatus;
  payload: unknown;
  avisado_at: string | null;
  fechado_at: string | null;
  created_at: string;
  updated_at: string;
  profiles?: { nome: string } | null;
};

function mapRow(row: DbRow): RelatorioTransmissao {
  return {
    id: row.id,
    tecnico_id: row.tecnico_id,
    os_wf: row.os_wf,
    cliente: row.cliente ?? "",
    endereco: row.endereco ?? "",
    cidade: row.cidade ?? "",
    equipe_empreiteira: row.equipe_empreiteira ?? "",
    responsavel: row.responsavel ?? "",
    data_inicio_execucao: row.data_inicio_execucao ?? "",
    tipo_execucao: row.tipo_execucao,
    status: row.status,
    payload: parsePayload(row.payload),
    avisado_at: row.avisado_at,
    fechado_at: row.fechado_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tecnico_nome: row.profiles?.nome,
  };
}

const SELECT_COLS =
  "id, tecnico_id, os_wf, cliente, endereco, cidade, equipe_empreiteira, responsavel, data_inicio_execucao, tipo_execucao, status, payload, avisado_at, fechado_at, created_at, updated_at, profiles(nome)";

const SELECT_COLS_PLAIN =
  "id, tecnico_id, os_wf, cliente, endereco, cidade, equipe_empreiteira, responsavel, data_inicio_execucao, tipo_execucao, status, payload, avisado_at, fechado_at, created_at, updated_at";

export async function uploadRelatorioPhoto(
  tecnicoId: string,
  file: File,
  tag: string,
): Promise<StoredPhoto> {
  if (typeof window === "undefined") {
    throw new Error("Upload de fotos deve ocorrer no navegador.");
  }
  const supabase = getSupabaseClient();
  const path = `${tecnicoId}/relatorio-${crypto.randomUUID()}-${tag}.jpg`;
  const { error } = await supabase.storage.from("evidencias-fotos").upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: "image/jpeg",
  });
  if (error) throw error;
  return { path, url: getStoragePublicUrl(path) };
}

export async function fetchRelatorioTransmissaoById(
  id: string,
): Promise<RelatorioTransmissao> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .select(SELECT_COLS)
    .eq("id", id)
    .single();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .select(SELECT_COLS_PLAIN)
      .eq("id", id)
      .single();
    if (fallback.error) throw fallback.error;
    return mapRow(fallback.data as DbRow);
  }
  return mapRow(data as DbRow);
}

export async function findRelatorioAbertoPorOsWf(
  osWf: string,
): Promise<RelatorioTransmissao | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .select(SELECT_COLS)
    .eq("os_wf", osWf.trim())
    .in("status", ["em_aberto", "avisado"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .select(SELECT_COLS_PLAIN)
      .eq("os_wf", osWf.trim())
      .in("status", ["em_aberto", "avisado"])
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (fallback.error) throw fallback.error;
    return fallback.data ? mapRow(fallback.data as DbRow) : null;
  }
  return data ? mapRow(data as DbRow) : null;
}

export async function findRelatorioFechadoPorOsWf(osWf: string): Promise<boolean> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .select("id")
    .eq("os_wf", osWf.trim())
    .eq("status", "fechado")
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function iniciarOuRetomarRelatorio(
  tecnicoId: string,
  osWf: string,
): Promise<{ relatorio: RelatorioTransmissao; retomado: boolean }> {
  const os = osWf.trim();
  if (!os) throw new Error("Informe a OS/WF.");

  const existente = await findRelatorioAbertoPorOsWf(os);
  if (existente) {
    return { relatorio: existente, retomado: true };
  }

  if (await findRelatorioFechadoPorOsWf(os)) {
    throw new Error("Esta OS/WF já foi fechada. Peça ao admin para reabrir se necessário.");
  }

  const supabase = getSupabaseClient();
  const insertRow = {
    tecnico_id: tecnicoId,
    os_wf: os,
    status: "em_aberto" as const,
    payload: emptyRelatorioPayload(),
  };

  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .insert(insertRow)
    .select(SELECT_COLS)
    .single();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .insert(insertRow)
      .select(SELECT_COLS_PLAIN)
      .single();
    if (fallback.error) throw fallback.error;
    return { relatorio: mapRow(fallback.data as DbRow), retomado: false };
  }
  return { relatorio: mapRow(data as DbRow), retomado: false };
}

export async function patchRelatorioDraft(
  id: string,
  patch: RelatorioDraftPatch,
): Promise<RelatorioTransmissao> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .update(patch)
    .eq("id", id)
    .neq("status", "fechado")
    .select(SELECT_COLS)
    .single();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .update(patch)
      .eq("id", id)
      .neq("status", "fechado")
      .select(SELECT_COLS_PLAIN)
      .single();
    if (fallback.error) throw fallback.error;
    return mapRow(fallback.data as DbRow);
  }
  return mapRow(data as DbRow);
}

export async function avisarConclusaoRelatorio(id: string): Promise<RelatorioTransmissao> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .update({ status: "avisado", avisado_at: new Date().toISOString() })
    .eq("id", id)
    .neq("status", "fechado")
    .select(SELECT_COLS)
    .single();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .update({ status: "avisado", avisado_at: new Date().toISOString() })
      .eq("id", id)
      .neq("status", "fechado")
      .select(SELECT_COLS_PLAIN)
      .single();
    if (fallback.error) throw fallback.error;
    return mapRow(fallback.data as DbRow);
  }
  return mapRow(data as DbRow);
}

export async function fetchMeusRelatoriosTransmissao(
  tecnicoId: string,
): Promise<RelatorioTransmissao[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .select(SELECT_COLS)
    .eq("tecnico_id", tecnicoId)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as DbRow));
}

export async function fetchRelatoriosTransmissaoAdmin(
  statusGroup: "abertos" | "fechados",
): Promise<RelatorioTransmissao[]> {
  const supabase = getSupabaseClient();
  let query = supabase.from("relatorios_transmissao").select(SELECT_COLS);
  if (statusGroup === "fechados") {
    query = query.eq("status", "fechado");
  } else {
    query = query.in("status", ["em_aberto", "avisado"]);
  }
  const { data, error } = await query.order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as DbRow));
}

export async function fecharRelatorioTransmissao(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("relatorios_transmissao")
    .update({ status: "fechado", fechado_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw error;
}

export function subscribeRelatoriosTransmissao(
  onChange: () => void,
): () => void {
  const supabase = getSupabaseClient();
  const channel = supabase
    .channel("relatorios-transmissao-live")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "relatorios_transmissao" },
      () => {
        onChange();
      },
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
