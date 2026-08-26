import { useMemo, useState } from "react";
import {
  buildResumoCaderno,
  formatResumoNumero,
  type ResumoCadernoLinha,
} from "@/lib/resumo-caderno";
import type { RelatorioPayload } from "@/lib/relatorios-transmissao";
import { cn } from "@/lib/utils";

type LadoView = "re" | "total" | "rc";

const BLOCO_TITULO: Record<ResumoCadernoLinha["bloco"], string> = {
  aereo: "Infraestrutura Aérea",
  aterramento: "Aterramento",
  subterraneo: "Infraestrutura Subterrânea",
  acessos: "Acessos, Caixas e Equipamentos",
};

const BLOCOS: ResumoCadernoLinha["bloco"][] = [
  "aereo",
  "aterramento",
  "subterraneo",
  "acessos",
];

function ValorComUnidade({
  value,
  unidade,
  destaque = false,
}: {
  value: number;
  unidade: ResumoCadernoLinha["unidade"];
  destaque?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex h-full min-h-[2.75rem] items-stretch",
        destaque ? "bg-gray-100" : "",
      )}
    >
      <div className="flex flex-1 items-center justify-center px-2 text-sm font-bold tabular-nums text-gray-900">
        {formatResumoNumero(value, unidade)}
      </div>
      <div className="flex w-[4.25rem] shrink-0 items-center justify-center border-l border-gray-300 px-1 text-center text-[11px] text-gray-600">
        {unidade}
      </div>
    </div>
  );
}

function TabelaBlocoDesktop({
  bloco,
  linhas,
}: {
  bloco: ResumoCadernoLinha["bloco"];
  linhas: ResumoCadernoLinha[];
}) {
  const rows = linhas.filter((l) => l.bloco === bloco);
  if (!rows.length) return null;

  return (
    <section className="overflow-hidden rounded-lg border border-gray-300 bg-white shadow-sm">
      <h3 className="border-b border-gray-300 bg-gray-100 px-3 py-2 text-sm font-bold text-gray-900">
        {BLOCO_TITULO[bloco]}
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[780px] border-collapse text-sm">
          <thead>
            <tr className="bg-gray-200 text-xs font-bold text-gray-800">
              <th className="border border-gray-300 px-2 py-2 text-left">
                Resumo REDE DE ACESSO (RE)
              </th>
              <th className="w-[8rem] border border-gray-300 px-1 py-2 text-center">Valor</th>
              <th className="w-[8rem] border border-gray-300 px-1 py-2 text-center">TOTAL</th>
              <th className="w-[8rem] border border-gray-300 px-1 py-2 text-center">Valor</th>
              <th className="border border-gray-300 px-2 py-2 text-left">
                Resumo REDE CLIENTE (RC)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => {
              const labelRc = row.labelRc ?? row.label;
              const zebra = idx % 2 === 1 ? "bg-gray-50" : "bg-white";
              return (
                <tr key={row.id} className={zebra}>
                  <td className="border border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-800 sm:text-sm">
                    {row.label}
                  </td>
                  <td className="border border-gray-300 p-0 align-middle">
                    <ValorComUnidade value={row.re} unidade={row.unidade} />
                  </td>
                  <td className="border border-gray-300 p-0 align-middle">
                    <ValorComUnidade value={row.total} unidade={row.unidade} destaque />
                  </td>
                  <td className="border border-gray-300 p-0 align-middle">
                    <ValorComUnidade value={row.rc} unidade={row.unidade} />
                  </td>
                  <td className="border border-gray-300 px-3 py-2 text-left text-xs font-medium text-gray-800 sm:text-sm">
                    {labelRc}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CardLadoMobile({
  lado,
  titulo,
  linhas,
  getValue,
  destaque = false,
}: {
  lado: LadoView;
  titulo: string;
  linhas: ResumoCadernoLinha[];
  getValue: (row: ResumoCadernoLinha) => number;
  destaque?: boolean;
}) {
  return (
    <div
      className={cn(
        "overflow-hidden rounded-xl border shadow-sm",
        destaque ? "border-primary/30 bg-primary/5" : "border-gray-200 bg-white",
      )}
    >
      <div
        className={cn(
          "px-3 py-2 text-sm font-bold",
          destaque ? "bg-primary/10 text-primary" : "bg-gray-100 text-gray-900",
        )}
      >
        {titulo}
      </div>
      <div className="divide-y divide-gray-200">
        {BLOCOS.map((bloco) => {
          const rows = linhas.filter((l) => l.bloco === bloco);
          return (
            <div key={`${lado}-${bloco}`} className="p-3">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-wide text-gray-500">
                {BLOCO_TITULO[bloco]}
              </p>
              <ul className="space-y-2">
                {rows.map((row) => {
                  const label = lado === "rc" && row.labelRc ? row.labelRc : row.label;
                  return (
                    <li
                      key={row.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                    >
                      <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-gray-800">
                        {label}
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-gray-900">
                        {formatResumoNumero(getValue(row), row.unidade)}{" "}
                        <span className="text-[11px] font-normal text-gray-500">
                          {row.unidade}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AbaMedicoes({
  payload,
  clienteNome,
}: {
  payload?: RelatorioPayload | null;
  clienteNome?: string | null;
}) {
  const { linhas } = useMemo(() => buildResumoCaderno(payload), [payload]);
  const [ladoMobile, setLadoMobile] = useState<LadoView>("re");
  const cliente = clienteNome?.trim() || "—";

  return (
    <div className="space-y-4">
      <header className="rounded-2xl border border-border bg-card px-4 py-4 shadow-sm sm:px-5">
        <h2 className="text-base font-bold text-gray-900 sm:text-lg">
          Resumo do caderno - cliente: {cliente}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Valores somente leitura, calculados automaticamente a partir das abas RE e RC.
        </p>
      </header>

      <div className="hidden space-y-4 lg:block">
        {BLOCOS.map((bloco) => (
          <TabelaBlocoDesktop key={bloco} bloco={bloco} linhas={linhas} />
        ))}
      </div>

      <div className="space-y-3 lg:hidden">
        <div className="grid grid-cols-3 gap-2" role="tablist" aria-label="Visão do resumo">
          {(
            [
              ["re", "RE"],
              ["total", "TOTAL"],
              ["rc", "RC"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={ladoMobile === id}
              onClick={() => setLadoMobile(id)}
              className={cn(
                "rounded-lg border px-2 py-2 text-sm font-semibold transition",
                ladoMobile === id
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-white text-muted-foreground hover:bg-muted",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {ladoMobile === "re" ? (
          <CardLadoMobile
            lado="re"
            titulo="Resumo REDE DE ACESSO (RE)"
            linhas={linhas}
            getValue={(r) => r.re}
          />
        ) : null}
        {ladoMobile === "total" ? (
          <CardLadoMobile
            lado="total"
            titulo="TOTAL (RE + RC)"
            linhas={linhas}
            getValue={(r) => r.total}
            destaque
          />
        ) : null}
        {ladoMobile === "rc" ? (
          <CardLadoMobile
            lado="rc"
            titulo="Resumo REDE CLIENTE (RC)"
            linhas={linhas}
            getValue={(r) => r.rc}
          />
        ) : null}
      </div>
    </div>
  );
}
