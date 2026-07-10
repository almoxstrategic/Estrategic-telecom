import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

export type MaterialEmailData = {
  tipo_material: string;
  total_utilizado: string;
  foto_inicio_url: string;
  foto_fim_url: string;
};

export type EvidenciaEmailData = {
  nome_tecnico: string;
  matricula: string;
  contrato: string;
  wo: string;
  materiais: MaterialEmailData[];
  observacao?: string;
};

type EvidenciaRecord = {
  id?: string;
  contrato?: string;
  wo?: string;
  metragem_inicial?: number | string;
  metragem_final?: number | string;
  total_utilizado?: number | string;
  tipo_material?: string | null;
  observacao?: string | null;
  foto_inicio_url?: string;
  foto_fim_url?: string;
  data_registro?: string;
  tecnico_id?: string;
};

type MaterialPayload = {
  tipo_material?: string;
  total_utilizado?: number | string;
  metragem?: number | string;
  foto_inicio_url?: string;
  foto_fim_url?: string;
};

type DatabaseWebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: EvidenciaRecord;
  tecnico_id?: string;
  nome_tecnico?: string;
  contrato?: string;
  wo?: string;
  observacao?: string;
  materiais?: MaterialPayload[];
  metragem_inicial?: number | string;
  metragem_final?: number | string;
  total_utilizado?: number | string;
  tipo_material?: string;
  data_registro?: string;
  foto_inicio_url?: string;
  foto_fim_url?: string;
  urls_das_fotos?: {
    inicio?: string;
    fim?: string;
  };
};

function asString(value: unknown, field: string): string {
  if (value === null || value === undefined || value === "") {
    throw new Error(`Campo obrigatório ausente: ${field}`);
  }
  return String(value);
}

/** Valor exibido no e-mail — sem cálculo de subtração, apenas o informado. */
export function formatMetrosUtilizados(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string") return value.trim();
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value);
  return String(num);
}

export function formatDataRegistro(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapMaterialPayload(material: MaterialPayload): Partial<MaterialEmailData> {
  return {
    tipo_material: material.tipo_material?.trim() || "Material",
    total_utilizado: formatMetrosUtilizados(material.metragem ?? material.total_utilizado),
    foto_inicio_url: material.foto_inicio_url,
    foto_fim_url: material.foto_fim_url,
  };
}

function mapRecordToMaterial(
  record: EvidenciaRecord,
  payload: DatabaseWebhookPayload,
): Partial<MaterialEmailData> {
  const fotoInicio =
    record.foto_inicio_url ??
    payload.foto_inicio_url ??
    payload.urls_das_fotos?.inicio;
  const fotoFim =
    record.foto_fim_url ?? payload.foto_fim_url ?? payload.urls_das_fotos?.fim;

  return {
    tipo_material:
      record.tipo_material?.trim() ||
      payload.tipo_material?.trim() ||
      "Material",
    total_utilizado: formatMetrosUtilizados(
      record.total_utilizado ?? payload.total_utilizado,
    ),
    foto_inicio_url: fotoInicio,
    foto_fim_url: fotoFim,
  };
}

export function extractEvidenciaData(payload: DatabaseWebhookPayload): {
  data: Partial<EvidenciaEmailData>;
  tecnicoId?: string;
} {
  const record = payload.record ?? payload;
  const contrato = record.contrato ?? payload.contrato;
  const wo = record.wo ?? payload.wo;
  const observacao =
    (typeof payload.observacao === "string" ? payload.observacao : undefined) ??
    (typeof record.observacao === "string" ? record.observacao : undefined);

  if (Array.isArray(payload.materiais) && payload.materiais.length > 0) {
    return {
      tecnicoId: payload.tecnico_id ?? record.tecnico_id,
      data: {
        nome_tecnico: payload.nome_tecnico,
        contrato,
        wo,
        observacao: observacao?.trim() || undefined,
        materiais: payload.materiais.map(mapMaterialPayload),
      },
    };
  }

  return {
    tecnicoId: record.tecnico_id ?? payload.tecnico_id,
    data: {
      nome_tecnico: payload.nome_tecnico,
      contrato,
      wo,
      observacao: observacao?.trim() || undefined,
      materiais: [mapRecordToMaterial(record, payload)],
    },
  };
}

export async function resolveTecnicoInfo(
  tecnicoId: string | undefined,
  currentNome?: string,
): Promise<{ nome: string; matricula: string }> {
  if (!tecnicoId) {
    return {
      nome: currentNome?.trim() || "—",
      matricula: "—",
    };
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurados na Edge Function.");
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data, error } = await supabase
    .from("profiles")
    .select("nome, identificacao, login")
    .eq("id", tecnicoId)
    .maybeSingle();

  if (error) throw error;

  const nome = currentNome?.trim() || data?.nome?.trim();
  if (!nome) throw new Error(`Perfil do técnico ${tecnicoId} não encontrado.`);

  const matricula =
    data?.identificacao?.trim() || data?.login?.trim() || "—";

  return { nome, matricula };
}

/** @deprecated Use resolveTecnicoInfo */
export async function resolveNomeTecnico(
  tecnicoId: string | undefined,
  currentNome?: string,
): Promise<string> {
  const tecnico = await resolveTecnicoInfo(tecnicoId, currentNome);
  return tecnico.nome;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMaterialBlock(material: MaterialEmailData): string {
  const tipo = escapeHtml(material.tipo_material);
  const metragem = escapeHtml(material.total_utilizado);
  const urlFotoInicio = escapeHtml(material.foto_inicio_url);
  const urlFotoFim = escapeHtml(material.foto_fim_url);

  return `
  <p><strong>${tipo}</strong></p>
  <ul>
    <li><strong>Total utilizado:</strong> ${metragem} metros</li>
    <li><strong>Evidências Fotográficas:</strong></li>
  </ul>
  <div style="margin-left: 20px;">
    <p><strong>Foto Início:</strong> <br> <img src="${urlFotoInicio}" alt="Foto Início" width="300" /></p>
    <p><strong>Foto Fim:</strong> <br> <img src="${urlFotoFim}" alt="Foto Fim" width="300" /></p>
  </div>
  <hr>
  `;
}

function renderObservacao(observacao: string): string {
  const texto = escapeHtml(observacao);
  return `<p><strong>Observação do Técnico:</strong><br>${texto}</p>`;
}

export function buildEvidenciaEmail(data: EvidenciaEmailData): { subject: string; html: string } {
  const subject = `Evidência BTP - Contrato: ${data.contrato} / WO: ${data.wo}`;
  const materiaisHtml = data.materiais.map(renderMaterialBlock).join("");
  const observacaoHtml = data.observacao ? renderObservacao(data.observacao) : "";

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
  <body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <p><strong>Nome do Técnico:</strong> ${escapeHtml(data.nome_tecnico)}</p>
    <p><strong>ID TOA:</strong> ${escapeHtml(data.matricula)}</p>
    <p><strong>Número do Contrato:</strong> ${escapeHtml(data.contrato)}</p>
    <p><strong>Número da WO:</strong> ${escapeHtml(data.wo)}</p>

    <p><strong>Detalhamento:</strong></p>

    ${materiaisHtml}
    ${observacaoHtml}
  </body>
</html>
  `.trim();

  return { subject, html };
}

export function finalizeEmailData(
  partial: Partial<EvidenciaEmailData>,
  tecnico: { nome: string; matricula: string },
): EvidenciaEmailData {
  if (!partial.materiais || partial.materiais.length === 0) {
    throw new Error("Nenhum material informado para o e-mail.");
  }

  return {
    nome_tecnico: tecnico.nome,
    matricula: tecnico.matricula,
    contrato: asString(partial.contrato, "contrato"),
    wo: asString(partial.wo, "wo"),
    materiais: partial.materiais.map((material, index) => ({
      tipo_material: asString(material.tipo_material, `materiais[${index}].tipo_material`),
      total_utilizado: asString(
        material.total_utilizado,
        `materiais[${index}].total_utilizado`,
      ),
      foto_inicio_url: asString(
        material.foto_inicio_url,
        `materiais[${index}].foto_inicio_url`,
      ),
      foto_fim_url: asString(
        material.foto_fim_url,
        `materiais[${index}].foto_fim_url`,
      ),
    })),
    observacao: partial.observacao?.trim() || undefined,
  };
}

export function parseRecipients(raw: string): string[] {
  return raw
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
}

export function assertWebhookSecret(req: Request): void {
  const expected = Deno.env.get("EVIDENCIA_WEBHOOK_SECRET");
  if (!expected) return;

  const received = req.headers.get("x-evidencia-webhook-secret");
  if (received !== expected) {
    throw new Error("Webhook não autorizado.");
  }
}

export type EmailAnexo = {
  filename: string;
  content: string;
};

export function parseAnexos(value: unknown): EmailAnexo[] {
  if (value == null) return [];
  if (!Array.isArray(value)) return [];

  const anexos: EmailAnexo[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const filename =
      "filename" in item && typeof item.filename === "string" ? item.filename.trim() : "";
    const content =
      "content" in item && typeof item.content === "string" ? item.content.trim() : "";
    if (!filename || !content) continue;
    anexos.push({ filename, content });
  }
  return anexos;
}

export async function sendResendEmail(input: {
  from: string;
  to: string[];
  subject: string;
  html: string;
  attachments?: EmailAnexo[];
}): Promise<{ id?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada.");

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: input.from,
      to: input.to,
      subject: input.subject,
      html: input.html,
      ...(input.attachments && input.attachments.length > 0
        ? { attachments: input.attachments }
        : {}),
    }),
  });

  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message =
      typeof body === "object" && body && "message" in body
        ? String((body as { message?: string }).message)
        : `Resend retornou HTTP ${response.status}`;
    throw new Error(message);
  }

  return body as { id?: string };
}
