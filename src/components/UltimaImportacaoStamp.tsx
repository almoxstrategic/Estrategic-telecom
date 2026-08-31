import {
  useUltimaImportacao,
  type UltimaImportacaoSource,
} from "@/lib/ultima-importacao";

type UltimaImportacaoStampProps = {
  source: UltimaImportacaoSource;
  className?: string;
};

/** Carimbo discreto da última importação (Consolidado de Consumo ou TOA). */
export function UltimaImportacaoStamp({
  source,
  className = "",
}: UltimaImportacaoStampProps) {
  const { label } = useUltimaImportacao(source);
  if (!label) return null;
  return (
    <span
      className={`text-sm font-medium text-gray-500 ${className}`.trim()}
    >
      {label}
    </span>
  );
}
