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

const IMG_STYLE =
  "width:100%;max-width:250px;height:auto;border-radius:6px;border:1px solid #ccc;display:block;margin:0 auto;";

function renderCabecalhoEmpresa(): string {
  return `
  <table role="presentation" width="100%" style="width:100%;max-width:600px;border-collapse:collapse;margin:0 0 24px 0;">
    <tr>
      <td style="background-color:#047857;padding:20px;text-align:center;color:#ffffff;">
        <span style="font-size:20px;font-weight:bold;letter-spacing:0.3px;color:#ffffff;">Estrategic Engenharia</span>
      </td>
    </tr>
  </table>
  `;
}

function renderMaterialBlock(material: MaterialEmailData): string {
  const tipo = escapeHtml(material.tipo_material);
  const metragem = escapeHtml(material.total_utilizado);
  const urlFotoInicio = escapeHtml(material.foto_inicio_url);
  const urlFotoFim = escapeHtml(material.foto_fim_url);

  return `
  <h3 style="margin:0 0 12px 0;font-size:18px;font-weight:bold;color:#0f172a;">Detalhe do item: ${tipo}</h3>

  <div style="background-color:#f4f7f9;border-radius:8px;padding:15px;margin-bottom:20px;text-align:center;">
    <span style="color:#0d6efd;font-weight:bold;font-size:16px;">Total utilizado: ${metragem} metros</span>
  </div>

  <table role="presentation" width="100%" style="width:100%;table-layout:fixed;border-collapse:separate;border-spacing:10px;margin:0 0 8px 0;">
    <tr>
      <td width="50%" style="width:50%;vertical-align:top;text-align:center;">
        <p style="margin:0 0 8px 0;font-weight:bold;color:#0f172a;">Início:</p>
        <img src="${urlFotoInicio}" alt="Foto Início — ${tipo}" style="${IMG_STYLE}" />
      </td>
      <td width="50%" style="width:50%;vertical-align:top;text-align:center;">
        <p style="margin:0 0 8px 0;font-weight:bold;color:#0f172a;">Fim:</p>
        <img src="${urlFotoFim}" alt="Foto Fim — ${tipo}" style="${IMG_STYLE}" />
      </td>
    </tr>
  </table>

  <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0;" />
  `;
}

function renderObservacao(observacao: string): string {
  const texto = escapeHtml(observacao);
  return `
  <div style="background-color:#f4f7f9;border-radius:8px;padding:15px;margin-top:8px;">
    <p style="margin:0 0 6px 0;font-weight:bold;color:#0f172a;">Observação do Técnico:</p>
    <p style="margin:0;color:#334155;line-height:1.5;">${texto}</p>
  </div>
  `;
}

function renderDadosOperacao(data: EvidenciaEmailData): string {
  const rows: [string, string][] = [
    ["Nome do Técnico", data.nome_tecnico],
    ["Id TOA", data.matricula],
    ["Número do Contrato", data.contrato],
    ["Número da WO", data.wo],
  ];

  const rowsHtml = rows
    .map(
      ([label, value]) => `
      <tr>
        <td style="padding:10px;border-bottom:1px solid #d1d5db;font-weight:bold;background-color:#f3f4f6;width:40%;color:#0f172a;">
          ${escapeHtml(label)}
        </td>
        <td style="padding:10px;border-bottom:1px solid #d1d5db;color:#0f172a;">
          ${escapeHtml(value)}
        </td>
      </tr>`,
    )
    .join("");

  return `
  <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:bold;color:#0f172a;">Dados da Operação</h2>
  <table style="border-collapse:collapse;width:100%;max-width:600px;border:1px solid #d1d5db;">
    ${rowsHtml}
  </table>
  `;
}

export function buildEvidenciaEmail(data: EvidenciaEmailData): { subject: string; html: string } {
  const subject = `Evidência BTP - Contrato: ${data.contrato} / WO: ${data.wo}`;
  const materiaisHtml = data.materiais.map(renderMaterialBlock).join("");
  const observacaoHtml = data.observacao ? renderObservacao(data.observacao) : "";

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
  <body style="margin:0;padding:16px;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background-color:#ffffff;">
    ${renderCabecalhoEmpresa()}
    ${renderDadosOperacao(data)}

    <div style="margin-top:28px;">
      ${materiaisHtml}
    </div>
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
