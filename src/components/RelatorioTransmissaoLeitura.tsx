import { ExpandableImage } from "@/components/ExpandableImage";
import type { RelatorioTransmissao, StoredPhoto } from "@/lib/relatorios-transmissao";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function tipoLabel(tipo: RelatorioTransmissao["tipo_execucao"]) {
  if (tipo === "implantacao") return "Implantação";
  if (tipo === "empresarial") return "Empresarial";
  return "Ainda não informado";
}

function fotosRe(row: RelatorioTransmissao): StoredPhoto[] {
  const re = row.payload?.metragemRe;
  return [re?.fotoInicio, re?.fotoFim, ...(re?.fotosExtras ?? [])].filter(
    (f): f is StoredPhoto => Boolean(f),
  );
}

function PhotoGrid({ fotos }: { fotos: StoredPhoto[] }) {
  if (!fotos.length) {
    return <p className="text-sm text-muted-foreground">Sem fotos nesta seção.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      {fotos.map((foto) => (
        <div key={foto.path} className="overflow-hidden rounded-lg border">
          <ExpandableImage src={foto.url} alt="Evidência" className="h-28" />
        </div>
      ))}
    </div>
  );
}

function Campo({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="text-base font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Secao({
  titulo,
  obs,
  fotos,
}: {
  titulo: string;
  obs?: string | null;
  fotos: StoredPhoto[];
}) {
  if (!fotos.length && !obs) return null;
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{titulo}</h3>
      {obs ? <p className="text-sm text-muted-foreground">{obs}</p> : null}
      <PhotoGrid fotos={fotos} />
    </section>
  );
}

export function RelatorioTransmissaoLeitura({ row }: { row: RelatorioTransmissao }) {
  const payload = row.payload;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-3">
        <Campo label="Endereço" value={`${row.endereco || "—"} · ${row.cidade || "—"}`} />
        <Campo label="Cliente" value={row.cliente || "—"} />
        <Campo label="Responsável" value={row.responsavel || "—"} />
        <Campo label="Equipe" value={row.equipe_empreiteira || "—"} />
        <Campo label="Início" value={formatDate(row.data_inicio_execucao)} />
        <Campo label="Tipo" value={tipoLabel(row.tipo_execucao)} />
      </div>

      {payload?.lancamentoRe === true ? (
        <Secao
          titulo={`Postes e metragem — RE (${payload.qntPostesRe || "—"} postes · ${payload.metragemRe.metragem || "—"})`}
          obs={payload.metragemRe.obs}
          fotos={fotosRe(row)}
        />
      ) : null}
      <Secao
        titulo="Poste de conexão"
        obs={payload?.posteConexao.obs}
        fotos={payload?.posteConexao.fotos ?? []}
      />
      <Secao
        titulo="Caixa de emenda"
        obs={payload?.caixaEmenda.obs}
        fotos={payload?.caixaEmenda.fotos ?? []}
      />
      <Secao
        titulo="Sobra técnica"
        obs={payload?.sobraTecnica.obs}
        fotos={payload?.sobraTecnica.fotos ?? []}
      />
      <Secao
        titulo="Terrometro"
        obs={payload?.aterramentoTerrometro.obs}
        fotos={payload?.aterramentoTerrometro.fotos ?? []}
      />
      <Secao
        titulo="Novo aterramento"
        obs={payload?.novoAterramentoPoste.obs}
        fotos={payload?.novoAterramentoPoste.fotos ?? []}
      />
      <Secao
        titulo="Posição DGO/DIO"
        obs={payload?.posicaoConexaoEstacao.obs}
        fotos={payload?.posicaoConexaoEstacao.fotos ?? []}
      />
      <Secao
        titulo="Etiqueta"
        obs={payload?.etiquetaIdentificacao.obs}
        fotos={payload?.etiquetaIdentificacao.fotos ?? []}
      />
      {(payload?.outrasFotos ?? [])
        .filter((item) => item.foto || item.ref || item.obs)
        .map((item) => (
          <Secao
            key={item.id}
            titulo={`Outra — ${item.ref || "sem REF"}`}
            obs={item.obs}
            fotos={item.foto ? [item.foto] : []}
          />
        ))}
    </div>
  );
}
