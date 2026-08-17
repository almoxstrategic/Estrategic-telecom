import { getStoragePublicUrl, getSupabaseClient } from "./supabase";

export type RelatorioStatus = "em_aberto" | "avisado" | "fechado" | "pendente";
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

export type CaboMetragemPayload = {
  id: string;
  tipoCabo: string;
  metragem: string;
  fotoInicio: StoredPhoto | null;
  fotoFim: StoredPhoto | null;
  obs: string;
};

export type RelatorioFotoGrupoKeyRe =
  | "posteConexao"
  | "caixaEmenda"
  | "plaquetaIdentificacao"
  | "novoAterramentoPoste"
  | "aterramentoTerrometro"
  | "posicaoConexaoEstacao"
  | "etiquetaIdentificacao"
  | "sobraTecnica";

export type RelatorioFotoGrupoKeyRc =
  | "rcPosteConexao"
  | "rcCaixaEmenda"
  | "rcTerminacaoCabo"
  | "rcPlaquetaIdentificacao"
  | "rcEntradaInterna"
  | "rcEntradaExterna";

export type RelatorioFotoGrupoKey = RelatorioFotoGrupoKeyRe | RelatorioFotoGrupoKeyRc;

export type RelatorioPayload = {
  lancamentoRe: boolean | null;
  metragensCabo: CaboMetragemPayload[];
  posteConexao: FotoGrupoPayload;
  caixaEmenda: FotoGrupoPayload;
  plaquetaIdentificacao: FotoGrupoPayload;
  novoAterramentoPoste: FotoGrupoPayload;
  aterramentoTerrometro: FotoGrupoPayload;
  posicaoConexaoEstacao: FotoGrupoPayload;
  etiquetaIdentificacao: FotoGrupoPayload;
  sobraTecnica: FotoGrupoPayload;
  outrasFotos: OutraFotoPayload[];
  tecnologiaAcesso: string;
  lancamentoRc: boolean | null;
  metragensCaboRc: CaboMetragemPayload[];
  rcPosteConexao: FotoGrupoPayload;
  rcCaixaEmenda: FotoGrupoPayload;
  rcTerminacaoCabo: FotoGrupoPayload;
  rcPlaquetaIdentificacao: FotoGrupoPayload;
  rcEntradaInterna: FotoGrupoPayload;
  rcEntradaExterna: FotoGrupoPayload;
  outrasFotosRc: OutraFotoPayload[];
};

export function emptyCaboMetragem(): CaboMetragemPayload {
  return {
    id: crypto.randomUUID(),
    tipoCabo: "",
    metragem: "",
    fotoInicio: null,
    fotoFim: null,
    obs: "",
  };
}

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
  motivo_pendencia: string | null;
  data_pendencia: string | null;
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

function emptyFotoGrupo(): FotoGrupoPayload {
  return { fotos: [], obs: "" };
}

export function emptyRelatorioPayload(): RelatorioPayload {
  return {
    lancamentoRe: null,
    metragensCabo: [],
    posteConexao: emptyFotoGrupo(),
    caixaEmenda: emptyFotoGrupo(),
    plaquetaIdentificacao: emptyFotoGrupo(),
    novoAterramentoPoste: emptyFotoGrupo(),
    aterramentoTerrometro: emptyFotoGrupo(),
    posicaoConexaoEstacao: emptyFotoGrupo(),
    etiquetaIdentificacao: emptyFotoGrupo(),
    sobraTecnica: emptyFotoGrupo(),
    outrasFotos: [],
    tecnologiaAcesso: "",
    lancamentoRc: null,
    metragensCaboRc: [],
    rcPosteConexao: emptyFotoGrupo(),
    rcCaixaEmenda: emptyFotoGrupo(),
    rcTerminacaoCabo: emptyFotoGrupo(),
    rcPlaquetaIdentificacao: emptyFotoGrupo(),
    rcEntradaInterna: emptyFotoGrupo(),
    rcEntradaExterna: emptyFotoGrupo(),
    outrasFotosRc: [],
  };
}

type LegacyMetragemRe = {
  fotoInicio?: StoredPhoto | null;
  fotoFim?: StoredPhoto | null;
  metragem?: string;
  obs?: string;
};

function parseCabosList(raw: unknown): CaboMetragemPayload[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  return raw.map((item) => {
    const cabo = (item ?? {}) as Partial<CaboMetragemPayload>;
    return {
      id: cabo.id || crypto.randomUUID(),
      tipoCabo: cabo.tipoCabo ?? "",
      metragem: cabo.metragem ?? "",
      fotoInicio: cabo.fotoInicio ?? null,
      fotoFim: cabo.fotoFim ?? null,
      obs: cabo.obs ?? "",
    };
  });
}

function parseCabos(raw: unknown): CaboMetragemPayload[] {
  if (!raw || typeof raw !== "object") return [];
  const src = raw as Partial<RelatorioPayload> & { metragemRe?: LegacyMetragemRe };
  const fromArray = parseCabosList(src.metragensCabo);
  if (fromArray.length > 0) return fromArray;
  const old = src.metragemRe;
  if (old && (old.fotoInicio || old.fotoFim || old.metragem || old.obs)) {
    return [
      {
        id: crypto.randomUUID(),
        tipoCabo: "",
        metragem: old.metragem ?? "",
        fotoInicio: old.fotoInicio ?? null,
        fotoFim: old.fotoFim ?? null,
        obs: old.obs ?? "",
      },
    ];
  }
  return [];
}

function parseOutrasFotos(raw: unknown): OutraFotoPayload[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const foto = (item ?? {}) as Partial<OutraFotoPayload>;
    return {
      id: foto.id || crypto.randomUUID(),
      ref: foto.ref ?? "",
      foto: foto.foto ?? null,
      obs: foto.obs ?? "",
    };
  });
}

function parseFotoGrupo(
  base: FotoGrupoPayload,
  raw: FotoGrupoPayload | undefined,
): FotoGrupoPayload {
  return { ...base, ...raw, fotos: raw?.fotos ?? [], obs: raw?.obs ?? "" };
}

function parsePayload(raw: unknown): RelatorioPayload {
  const base = emptyRelatorioPayload();
  if (!raw || typeof raw !== "object") return base;
  const src = raw as Partial<RelatorioPayload>;
  return {
    ...base,
    ...src,
    lancamentoRe: src.lancamentoRe ?? null,
    metragensCabo: parseCabos(raw),
    posteConexao: parseFotoGrupo(base.posteConexao, src.posteConexao),
    caixaEmenda: parseFotoGrupo(base.caixaEmenda, src.caixaEmenda),
    plaquetaIdentificacao: parseFotoGrupo(base.plaquetaIdentificacao, src.plaquetaIdentificacao),
    novoAterramentoPoste: parseFotoGrupo(base.novoAterramentoPoste, src.novoAterramentoPoste),
    aterramentoTerrometro: parseFotoGrupo(base.aterramentoTerrometro, src.aterramentoTerrometro),
    posicaoConexaoEstacao: parseFotoGrupo(base.posicaoConexaoEstacao, src.posicaoConexaoEstacao),
    etiquetaIdentificacao: parseFotoGrupo(base.etiquetaIdentificacao, src.etiquetaIdentificacao),
    sobraTecnica: parseFotoGrupo(base.sobraTecnica, src.sobraTecnica),
    outrasFotos: parseOutrasFotos(src.outrasFotos),
    tecnologiaAcesso: src.tecnologiaAcesso ?? "",
    lancamentoRc: src.lancamentoRc ?? null,
    metragensCaboRc: parseCabosList(src.metragensCaboRc),
    rcPosteConexao: parseFotoGrupo(base.rcPosteConexao, src.rcPosteConexao),
    rcCaixaEmenda: parseFotoGrupo(base.rcCaixaEmenda, src.rcCaixaEmenda),
    rcTerminacaoCabo: parseFotoGrupo(base.rcTerminacaoCabo, src.rcTerminacaoCabo),
    rcPlaquetaIdentificacao: parseFotoGrupo(base.rcPlaquetaIdentificacao, src.rcPlaquetaIdentificacao),
    rcEntradaInterna: parseFotoGrupo(base.rcEntradaInterna, src.rcEntradaInterna),
    rcEntradaExterna: parseFotoGrupo(base.rcEntradaExterna, src.rcEntradaExterna),
    outrasFotosRc: parseOutrasFotos(src.outrasFotosRc),
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
  motivo_pendencia: string | null;
  data_pendencia: string | null;
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
    motivo_pendencia: row.motivo_pendencia ?? null,
    data_pendencia: row.data_pendencia ?? null,
    avisado_at: row.avisado_at,
    fechado_at: row.fechado_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    tecnico_nome: row.profiles?.nome,
  };
}

const SELECT_COLS =
  "id, tecnico_id, os_wf, cliente, endereco, cidade, equipe_empreiteira, responsavel, data_inicio_execucao, tipo_execucao, status, payload, motivo_pendencia, data_pendencia, avisado_at, fechado_at, created_at, updated_at, profiles(nome)";

const SELECT_COLS_PLAIN =
  "id, tecnico_id, os_wf, cliente, endereco, cidade, equipe_empreiteira, responsavel, data_inicio_execucao, tipo_execucao, status, payload, motivo_pendencia, data_pendencia, avisado_at, fechado_at, created_at, updated_at";

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
    .in("status", ["em_aberto", "avisado", "pendente"])
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .select(SELECT_COLS_PLAIN)
      .eq("os_wf", osWf.trim())
      .in("status", ["em_aberto", "avisado", "pendente"])
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
    .update({
      status: "avisado",
      avisado_at: new Date().toISOString(),
      motivo_pendencia: null,
      data_pendencia: null,
    })
    .eq("id", id)
    .neq("status", "fechado")
    .select(SELECT_COLS)
    .single();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .update({
      status: "avisado",
      avisado_at: new Date().toISOString(),
      motivo_pendencia: null,
      data_pendencia: null,
    })
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

export async function fetchRelatoriosTransmissaoAdmin(): Promise<RelatorioTransmissao[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .select(SELECT_COLS)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => mapRow(row as DbRow));
}

export async function fecharRelatorioTransmissao(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("relatorios_transmissao")
    .update({
      status: "fechado",
      fechado_at: new Date().toISOString(),
      motivo_pendencia: null,
      data_pendencia: null,
    })
    .eq("id", id);
  if (error) throw error;
}

export async function sinalizarPendenciaRelatorio(
  id: string,
  motivo: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("relatorios_transmissao")
    .update({
      status: "pendente",
      motivo_pendencia: motivo.trim() || "Pendência sinalizada pela supervisão.",
      data_pendencia: new Date().toISOString(),
    })
    .eq("id", id)
    .neq("status", "fechado");
  if (error) throw error;
}

export async function patchRelatorioPayloadAdmin(
  id: string,
  payload: RelatorioPayload,
): Promise<RelatorioTransmissao> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("relatorios_transmissao")
    .update({ payload })
    .eq("id", id)
    .select(SELECT_COLS)
    .single();
  if (error) {
    const fallback = await supabase
      .from("relatorios_transmissao")
      .update({ payload })
      .eq("id", id)
      .select(SELECT_COLS_PLAIN)
      .single();
    if (fallback.error) throw fallback.error;
    return mapRow(fallback.data as DbRow);
  }
  return mapRow(data as DbRow);
}

export async function excluirRelatorioTransmissao(id: string): Promise<void> {
  const supabase = getSupabaseClient();
  const { error } = await supabase.from("relatorios_transmissao").delete().eq("id", id);
  if (error) throw error;
}

export type RelatorioFotoCategoria =
  | RelatorioFotoGrupoKey
  | "metragensCabo"
  | "outrasFotos"
  | "metragensCaboRc"
  | "outrasFotosRc";

export function appendStoredPhotoToPayload(
  payload: RelatorioPayload,
  categoria: RelatorioFotoCategoria,
  stored: StoredPhoto,
): RelatorioPayload {
  if (categoria === "metragensCabo" || categoria === "metragensCaboRc") {
    const list = (payload[categoria].length
      ? payload[categoria].map((item) => ({ ...item }))
      : [emptyCaboMetragem()]);
    const last = list[list.length - 1];
    if (!last.fotoInicio) last.fotoInicio = stored;
    else if (!last.fotoFim) last.fotoFim = stored;
    else list.push({ ...emptyCaboMetragem(), fotoInicio: stored });
    return { ...payload, [categoria]: list };
  }
  if (categoria === "outrasFotos" || categoria === "outrasFotosRc") {
    return {
      ...payload,
      [categoria]: [
        ...payload[categoria],
        { id: crypto.randomUUID(), ref: "Admin", foto: stored, obs: "" },
      ],
    };
  }
  const grupo = payload[categoria];
  return {
    ...payload,
    [categoria]: { ...grupo, fotos: [...grupo.fotos, stored] },
  };
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
