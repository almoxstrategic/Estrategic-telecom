import { useEffect, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getSupabaseClient } from "@/lib/supabase";
import {
  useKpiUltimaImportacao,
  type KpiImportacaoSource,
} from "@/lib/kpi-importacao-meta-store";

export type UltimaImportacaoSource = KpiImportacaoSource;

/** Busca o `imported_at` mais recente em `toa_importacoes`. */
export async function fetchUltimaImportacaoToaAt(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("toa_importacoes")
    .select("imported_at")
    .order("imported_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const raw = data?.imported_at;
  return raw != null && String(raw).trim() ? String(raw) : null;
}

/** Busca a última gravação do Consolidado de Consumo (`wos_consumo`). */
export async function fetchUltimaImportacaoConsumoAt(): Promise<string | null> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("wos_consumo")
    .select("updated_at, imported_at")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const raw = data?.updated_at ?? data?.imported_at;
  return raw != null && String(raw).trim() ? String(raw) : null;
}

async function fetchUltimaImportacaoAtBySource(
  source: UltimaImportacaoSource,
): Promise<string | null> {
  return source === "consumo"
    ? fetchUltimaImportacaoConsumoAt()
    : fetchUltimaImportacaoToaAt();
}

/**
 * Formato: "Ultima importação: 12 de Agosto - 2026 as 16:26"
 */
export function formatUltimaImportacaoLabel(
  iso: string | null | undefined,
): string | null {
  if (!iso) return null;
  let d = parseISO(iso);
  if (!isValid(d)) d = new Date(iso);
  if (!isValid(d)) return null;
  const dia = format(d, "dd", { locale: ptBR });
  const mes = format(d, "MMMM", { locale: ptBR });
  const mesCap = mes.charAt(0).toUpperCase() + mes.slice(1);
  const ano = format(d, "yyyy", { locale: ptBR });
  const hora = format(d, "HH:mm", { locale: ptBR });
  return `Ultima importação: ${dia} de ${mesCap} - ${ano} as ${hora}`;
}

/**
 * Consulta o banco conforme a fonte e reconsulta após nova marcação local de importação.
 */
export function useUltimaImportacao(source: UltimaImportacaoSource): {
  iso: string | null;
  label: string | null;
  loading: boolean;
} {
  const markLocal = useKpiUltimaImportacao(source);
  const [iso, setIso] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchUltimaImportacaoAtBySource(source)
      .then((value) => {
        if (!cancelled) setIso(value);
      })
      .catch((err) => {
        console.error(`[ultima-importacao/${source}]`, err);
        if (!cancelled) setIso(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [markLocal, source]);

  return {
    iso,
    label: formatUltimaImportacaoLabel(iso),
    loading,
  };
}

/** @deprecated Use fetchUltimaImportacaoToaAt */
export async function fetchUltimaImportacaoAt(): Promise<string | null> {
  return fetchUltimaImportacaoToaAt();
}
