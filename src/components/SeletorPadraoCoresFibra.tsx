import { ChoiceButton } from "@/components/RelatorioRedeAcesso";
import {
  fiberColorsForPadrao,
  type PadraoCoresFibra,
} from "@/lib/fiber-colors";

/**
 * Seletor BR/EUA (+ legenda opcional das 12 cores).
 * Compartilhado entre Teste Óptico e Teste de Potência.
 */
export function SeletorPadraoCoresFibra({
  value,
  onChange,
  readOnly = false,
  showLegenda = true,
}: {
  value: PadraoCoresFibra;
  onChange?: (next: PadraoCoresFibra) => void;
  readOnly?: boolean;
  /** Exibe texto + badges das 12 cores (mantido no Teste de Potência). */
  showLegenda?: boolean;
}) {
  const padrao = value === "eua" ? "eua" : "br";
  const cores = fiberColorsForPadrao(padrao);
  const titulo =
    padrao === "br"
      ? "Padrão de cores da fibra (Telebrás/ABNT) — repete a cada 12 fibras"
      : "Padrão de cores da fibra (EIA598-A / EUA) — repete a cada 12 fibras";

  return (
    <div className="my-2 flex w-full flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center print:my-1">
      <div
        className={`grid w-full max-w-sm grid-cols-2 gap-2 ${showLegenda ? "mb-3" : ""}`}
        role="radiogroup"
        aria-label="Padrão de cores da fibra"
      >
        <ChoiceButton
          active={padrao === "br"}
          disabled={readOnly || !onChange}
          onClick={() => onChange?.("br")}
        >
          Padrão BR
        </ChoiceButton>
        <ChoiceButton
          active={padrao === "eua"}
          disabled={readOnly || !onChange}
          onClick={() => onChange?.("eua")}
        >
          Padrão EUA
        </ChoiceButton>
      </div>
      {showLegenda ? (
        <>
          <p className="mb-2 text-xs font-semibold text-gray-700">{titulo}</p>
          <div className="flex flex-wrap justify-center gap-2">
            {cores.map((cor, index) => (
              <span
                key={`${padrao}-${cor.sigla}-${index}`}
                title={`${String(index + 1).padStart(2, "0")} · ${cor.label}`}
                className={`inline-flex h-7 min-w-7 items-center justify-center rounded-sm px-1.5 text-[10px] font-bold ${cor.bg}`}
              >
                {cor.sigla}
              </span>
            ))}
          </div>
        </>
      ) : null}
    </div>
  );
}
