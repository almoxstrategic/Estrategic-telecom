import { useUltimaImportacao } from "@/lib/ultima-importacao";

type UltimaImportacaoStampProps = {
  className?: string;
};

/** Carimbo discreto da última importação TOA (Supabase). */
export function UltimaImportacaoStamp({
  className = "",
}: UltimaImportacaoStampProps) {
  const { label } = useUltimaImportacao();
  if (!label) return null;
  return (
    <span
      className={`text-sm font-medium text-gray-500 ${className}`.trim()}
    >
      {label}
    </span>
  );
}
