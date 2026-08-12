import { useEffect, useState } from "react";
import { format, isValid, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { getSupabaseClient } from "@/lib/supabase";
import { useKpiUltimaImportacao } from "@/lib/kpi-importacao-meta-store";

/** Busca o `imported_at` mais recente em `toa_importacoes`. */
export async function fetchUltimaImportacaoAt(): Promise<string | null> {
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
 * Hook leve: consulta o banco e reconsulta quando há nova marcação local de importação.
 */
export function useUltimaImportacao(): {
  iso: string | null;
  label: string | null;
  loading: boolean;
} {
  const markLocal = useKpiUltimaImportacao();
  const [iso, setIso] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void fetchUltimaImportacaoAt()
      .then((value) => {
        if (!cancelled) setIso(value);
      })
      .catch((err) => {
        console.error("[ultima-importacao]", err);
        if (!cancelled) setIso(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [markLocal]);

  return {
    iso,
    label: formatUltimaImportacaoLabel(iso),
    loading,
  };
}
