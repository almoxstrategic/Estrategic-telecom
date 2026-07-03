import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

export type EvidenciaEmailData = {
  nome_tecnico: string;
  matricula: string;
  contrato: string;
  wo: string;
  metragem_inicial: string;
  metragem_final: string;
  total_utilizado: string;
  foto_inicio_url: string;
  foto_fim_url: string;
};

type EvidenciaRecord = {
  id?: string;
  contrato?: string;
  wo?: string;
  metragem_inicial?: number | string;
  metragem_final?: number | string;
  total_utilizado?: number | string;
  foto_inicio_url?: string;
  foto_fim_url?: string;
  data_registro?: string;
  tecnico_id?: string;
};

type DatabaseWebhookPayload = {
  type?: string;
  table?: string;
  schema?: string;
  record?: EvidenciaRecord;
  nome_tecnico?: string;
  contrato?: string;
  wo?: string;
  metragem_inicial?: number | string;
  metragem_final?: number | string;
  total_utilizado?: number | string;
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

function formatMetragem(value: unknown): string {
  const num = Number(value);
  if (!Number.isFinite(num)) return String(value ?? "—");
  return `${num} m`;
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

export function extractEvidenciaData(payload: DatabaseWebhookPayload): {
  data: Partial<EvidenciaEmailData>;
  tecnicoId?: string;
} {
  const record = payload.record ?? payload;
  const fotoInicio =
    record.foto_inicio_url ??
    payload.foto_inicio_url ??
    payload.urls_das_fotos?.inicio;
  const fotoFim =
    record.foto_fim_url ?? payload.foto_fim_url ?? payload.urls_das_fotos?.fim;

  return {
    tecnicoId: record.tecnico_id,
    data: {
      nome_tecnico: payload.nome_tecnico,
      contrato: record.contrato ?? payload.contrato,
      wo: record.wo ?? payload.wo,
      metragem_inicial:
        record.metragem_inicial !== undefined
          ? formatMetragem(record.metragem_inicial)
          : payload.metragem_inicial !== undefined
            ? formatMetragem(payload.metragem_inicial)
            : undefined,
      metragem_final:
        record.metragem_final !== undefined
          ? formatMetragem(record.metragem_final)
          : payload.metragem_final !== undefined
            ? formatMetragem(payload.metragem_final)
            : undefined,
      total_utilizado:
        record.total_utilizado !== undefined
          ? formatMetragem(record.total_utilizado)
          : payload.total_utilizado !== undefined
            ? formatMetragem(payload.total_utilizado)
            : undefined,
      foto_inicio_url: fotoInicio,
      foto_fim_url: fotoFim,
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
  if (currentNome?.trim()) return currentNome.trim();
  if (!tecnicoId) throw new Error("nome_tecnico ausente e tecnico_id não informado.");

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
    .select("nome")
    .eq("id", tecnicoId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.nome?.trim()) throw new Error(`Perfil do técnico ${tecnicoId} não encontrado.`);

  return data.nome.trim();
}

export function buildEvidenciaEmail(data: EvidenciaEmailData): { subject: string; html: string } {
  const subject = `Evidência BTP - Contrato: ${data.contrato} / WO: ${data.wo}`;

  const photoBlock = (title: string, imageUrl: string) => `
    <div style="margin-bottom:28px;">
      <p style="margin:0 0 12px;font-size:15px;font-weight:700;color:#0f172a;">${title}</p>
      <img
        src="${imageUrl}"
        alt="${title}"
        style="display:block;max-width:400px;width:100%;height:auto;border-radius:8px;border:1px solid #e2e8f0;"
      />
      <p style="margin:12px 0 0;">
        <a
          href="${imageUrl}"
          target="_blank"
          rel="noopener noreferrer"
          style="display:inline-block;padding:10px 18px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600;"
        >
          Ver foto em tela cheia
        </a>
      </p>
    </div>
  `;

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 28px 12px;background:#0f172a;color:#ffffff;">
                <h1 style="margin:0;font-size:22px;line-height:1.3;">Estrategic Field</h1>
                <p style="margin:8px 0 0;font-size:14px;color:#cbd5e1;">Evidência BTP — Registro de Metragem</p>
              </td>
            </tr>
            <tr>
              <td style="padding:28px;">
                <p style="margin:0 0 20px;font-size:15px;line-height:1.6;">
                  Olá equipe, segue registro de metragem para análise e liberação no sistema SAP.
                </p>

                <h2 style="margin:0 0 12px;font-size:16px;color:#0f172a;">Dados da Operação</h2>
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:24px;border-collapse:collapse;">
                  <tr>
                    <td style="padding:10px 12px;border:1px solid #e2e8f0;background:#f8fafc;width:40%;font-weight:700;">Nome do Técnico</td>
                    <td style="padding:10px 12px;border:1px solid #e2e8f0;">${data.nome_tecnico}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;">Matrícula</td>
                    <td style="padding:10px 12px;border:1px solid #e2e8f0;">${data.matricula}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;">Número do Contrato</td>
                    <td style="padding:10px 12px;border:1px solid #e2e8f0;">${data.contrato}</td>
                  </tr>
                  <tr>
                    <td style="padding:10px 12px;border:1px solid #e2e8f0;background:#f8fafc;font-weight:700;">Número da WO</td>
                    <td style="padding:10px 12px;border:1px solid #e2e8f0;">${data.wo}</td>
                  </tr>
                </table>

                <h2 style="margin:0 0 12px;font-size:16px;color:#0f172a;">Detalhamento da Metragem</h2>
                <div style="margin-bottom:28px;padding:16px;border:1px solid #dbeafe;background:#eff6ff;border-radius:10px;">
                  <p style="margin:0 0 8px;font-size:18px;font-weight:700;color:#1d4ed8;">
                    Total Utilizado: ${data.total_utilizado}
                  </p>
                  <p style="margin:0;font-size:14px;line-height:1.6;color:#334155;">
                    Metragem Inicial: <strong>${data.metragem_inicial}</strong><br />
                    Metragem Final: <strong>${data.metragem_final}</strong>
                  </p>
                </div>

                <h2 style="margin:0 0 16px;font-size:16px;color:#0f172a;">Evidências Fotográficas</h2>
                ${photoBlock("Bobina Inicial", data.foto_inicio_url)}
                ${photoBlock("Bobina Final", data.foto_fim_url)}

                <p style="margin:0;font-size:12px;line-height:1.5;color:#64748b;">
                  Este e-mail foi gerado automaticamente pelo sistema Estrategic Field após o envio da evidência em campo.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();

  return { subject, html };
}

export function finalizeEmailData(
  partial: Partial<EvidenciaEmailData>,
  tecnico: { nome: string; matricula: string },
): EvidenciaEmailData {
  return {
    nome_tecnico: tecnico.nome,
    matricula: tecnico.matricula,
    contrato: asString(partial.contrato, "contrato"),
    wo: asString(partial.wo, "wo"),
    metragem_inicial: asString(partial.metragem_inicial, "metragem_inicial"),
    metragem_final: asString(partial.metragem_final, "metragem_final"),
    total_utilizado: asString(partial.total_utilizado, "total_utilizado"),
    foto_inicio_url: asString(partial.foto_inicio_url, "foto_inicio_url"),
    foto_fim_url: asString(partial.foto_fim_url, "foto_fim_url"),
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

export async function sendResendEmail(input: {
  from: string;
  to: string[];
  subject: string;
  html: string;
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
