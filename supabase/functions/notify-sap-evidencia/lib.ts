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

const CONTAINER_STYLE =
  "width:100%;max-width:600px;margin:0 auto;box-sizing:border-box;";

const IMG_STYLE =
  "width:100%;max-width:250px;height:auto;border-radius:6px;border:1px solid #ccc;display:block;margin:0 auto;";

function renderCabecalhoEmpresa(): string {
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${CONTAINER_STYLE}border-collapse:collapse;margin:0 auto;">
    <tr>
      <td style="background-color:#047857;padding:25px 20px;text-align:center;color:#ffffff;">
        <span style="font-size:20px;font-weight:bold;letter-spacing:0.3px;color:#ffffff;">Estrategic Engenharia</span>
      </td>
    </tr>
  </table>
  `;
}

type MaterialEmailRender = {
  tipo_material: string;
  total_utilizado: string;
  foto_inicio_cid: string;
  foto_fim_cid: string;
};

function renderMaterialBlock(material: MaterialEmailRender): string {
  const tipo = escapeHtml(material.tipo_material);
  const metragem = escapeHtml(material.total_utilizado);
  const cidInicio = escapeHtml(material.foto_inicio_cid);
  const cidFim = escapeHtml(material.foto_fim_cid);

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${CONTAINER_STYLE}margin:24px auto 0 auto;">
    <tr>
      <td style="padding:0;text-align:left;">
        <h3 style="margin:0 0 12px 0;font-size:18px;font-weight:bold;color:#0f172a;">Detalhe do item: ${tipo}</h3>

        <div style="width:100%;max-width:600px;margin:0 auto 20px auto;box-sizing:border-box;background-color:#f4f7f9;border-radius:8px;padding:15px;text-align:center;">
          <span style="color:#0d6efd;font-weight:bold;font-size:16px;">Total utilizado: ${metragem} metros</span>
        </div>

        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;table-layout:fixed;border-collapse:separate;border-spacing:10px;box-sizing:border-box;">
          <tr>
            <td width="50%" style="width:50%;vertical-align:top;text-align:center;">
              <p style="margin:0 0 8px 0;font-weight:bold;color:#0f172a;">Início:</p>
              <img src="cid:${cidInicio}" alt="Foto Início — ${tipo}" style="${IMG_STYLE}" />
            </td>
            <td width="50%" style="width:50%;vertical-align:top;text-align:center;">
              <p style="margin:0 0 8px 0;font-weight:bold;color:#0f172a;">Fim:</p>
              <img src="cid:${cidFim}" alt="Foto Fim — ${tipo}" style="${IMG_STYLE}" />
            </td>
          </tr>
        </table>

        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0 0 0;width:100%;" />
      </td>
    </tr>
  </table>
  `;
}

function renderObservacao(observacao: string): string {
  const texto = escapeHtml(observacao);
  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${CONTAINER_STYLE}margin:16px auto 0 auto;">
    <tr>
      <td style="background-color:#f4f7f9;border-radius:8px;padding:15px;">
        <p style="margin:0 0 6px 0;font-weight:bold;color:#0f172a;">Observação do Técnico:</p>
        <p style="margin:0;color:#334155;line-height:1.5;">${texto}</p>
      </td>
    </tr>
  </table>
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
      ([label, value], index) => `
      <tr>
        <td width="30%" style="padding:10px;border-bottom:1px solid #d1d5db;font-weight:bold;background-color:#f3f4f6;width:30%;color:#0f172a;${index === rows.length - 1 ? "border-bottom:none;" : ""}">
          ${escapeHtml(label)}
        </td>
        <td width="70%" style="padding:10px;border-bottom:1px solid #d1d5db;width:70%;color:#0f172a;${index === rows.length - 1 ? "border-bottom:none;" : ""}">
          ${escapeHtml(value)}
        </td>
      </tr>`,
    )
    .join("");

  return `
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="${CONTAINER_STYLE}margin:20px auto 0 auto;">
    <tr>
      <td style="padding:0;text-align:left;">
        <h2 style="margin:0 0 12px 0;font-size:18px;font-weight:bold;color:#0f172a;">Dados da Operação</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;margin:0 auto;table-layout:fixed;border-collapse:collapse;border:1px solid #d1d5db;box-sizing:border-box;">
          ${rowsHtml}
        </table>
      </td>
    </tr>
  </table>
  `;
}

export type ResendInlineAttachment = {
  filename: string;
  /** Content-ID referenciado no HTML como cid:... */
  content_id: string;
  content_type: string;
  /** Base64 limpo (sem prefixo data:) — obrigatório para inline CID no Resend. */
  content: string;
};

async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Falha ao baixar imagem para CID (${response.status}).`);
  }
  const buffer = new Uint8Array(await response.arrayBuffer());
  let binary = "";
  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]!);
  }
  return btoa(binary);
}

function resolveAnexoContent(
  anexo: EmailAnexo | undefined,
  fallbackUrl: string,
): Promise<string> {
  if (anexo?.content) return Promise.resolve(anexo.content);
  return fetchImageAsBase64(fallbackUrl);
}

/**
 * Monta HTML com imagens via cid: e anexos Resend com content_id correspondente.
 * Nenhuma tag <img> usa http(s) externo nem data: URI.
 */
export async function buildEvidenciaEmail(
  data: EvidenciaEmailData,
  anexos: EmailAnexo[] = [],
): Promise<{ subject: string; html: string; attachments: ResendInlineAttachment[] }> {
  const subject = `Evidência BTP - Contrato: ${data.contrato} / WO: ${data.wo}`;
  const attachments: ResendInlineAttachment[] = [];
  let fotoSeq = 0;

  const materiaisRender: MaterialEmailRender[] = [];

  for (let materialIndex = 0; materialIndex < data.materiais.length; materialIndex++) {
    const material = data.materiais[materialIndex]!;
    const inicioCid = `evidencia${++fotoSeq}`;
    const fimCid = `evidencia${++fotoSeq}`;

    const anexoInicio = anexos[materialIndex * 2];
    const anexoFim = anexos[materialIndex * 2 + 1];

    const [inicioContent, fimContent] = await Promise.all([
      resolveAnexoContent(anexoInicio, material.foto_inicio_url),
      resolveAnexoContent(anexoFim, material.foto_fim_url),
    ]);

    attachments.push({
      filename: anexoInicio?.filename || `${inicioCid}_Inicio.jpg`,
      content: inicioContent,
      content_id: inicioCid,
      content_type: "image/jpeg",
    });
    attachments.push({
      filename: anexoFim?.filename || `${fimCid}_Fim.jpg`,
      content: fimContent,
      content_id: fimCid,
      content_type: "image/jpeg",
    });

    materiaisRender.push({
      tipo_material: material.tipo_material,
      total_utilizado: material.total_utilizado,
      foto_inicio_cid: inicioCid,
      foto_fim_cid: fimCid,
    });
  }

  const materiaisHtml = materiaisRender.map(renderMaterialBlock).join("");
  const observacaoHtml = data.observacao ? renderObservacao(data.observacao) : "";

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#0f172a;background-color:#ffffff;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;background-color:#ffffff;">
      <tr>
        <td align="center" style="padding:16px 8px;text-align:center;">
          ${renderCabecalhoEmpresa()}
          ${renderDadosOperacao(data)}
          ${materiaisHtml}
          ${observacaoHtml}
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();

  return { subject, html, attachments };
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
  /** Texto simples (teste mínimo). Não combinar com html/attachments no teste. */
  text?: string;
  html?: string;
  attachments?: ResendInlineAttachment[];
}): Promise<{ id?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  if (!apiKey) throw new Error("RESEND_API_KEY não configurada.");

  const hasText = typeof input.text === "string";
  const hasHtml = typeof input.html === "string" && input.html.trim().length > 0;

  if (!hasText && !hasHtml) {
    throw new Error("Informe text ou html para o e-mail.");
  }

  // API REST do Resend: content_id embute a imagem (inline).
  // HTML deve usar src="cid:<content_id>" — nunca http(s) nem data: URI.
  const attachments = (input.attachments ?? []).map((attachment) => {
    if (!attachment.content?.trim()) {
      throw new Error(`Anexo CID sem content Base64: ${attachment.content_id}`);
    }
    if (!attachment.content_id?.trim()) {
      throw new Error(`Anexo sem content_id: ${attachment.filename}`);
    }
    return {
      filename: attachment.filename,
      content: attachment.content,
      content_id: attachment.content_id,
      content_type: attachment.content_type || "image/jpeg",
    };
  });

  // Payload mínimo: from / to / subject / html|text / attachments.
  // Sem reply_to, cc ou bcc (sandbox Resend rejeita outros destinatários).
  const bodyPayload: Record<string, unknown> = {
    from: input.from,
    to: input.to,
    subject: input.subject,
  };

  if (hasText) {
    bodyPayload.text = input.text;
  }
  if (hasHtml) {
    bodyPayload.html = input.html;
  }
  if (attachments.length > 0) {
    // Anexos com content (Base64) + content_id para CID no HTML.
    bodyPayload.attachments = attachments;
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(bodyPayload),
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
