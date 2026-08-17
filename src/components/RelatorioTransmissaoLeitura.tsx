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

      {(payload?.metragensCabo ?? []).map((cabo, index) => (
        <Secao
          key={cabo.id}
          titulo={`Cabo RE ${index + 1} — ${cabo.tipoCabo || "tipo n/d"} · ${cabo.metragem || "—"}`}
          obs={cabo.obs}
          fotos={[cabo.fotoInicio, cabo.fotoFim].filter((f): f is StoredPhoto => Boolean(f))}
        />
      ))}
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
        titulo="Plaqueta de Identificação"
        obs={payload?.plaquetaIdentificacao.obs}
        fotos={payload?.plaquetaIdentificacao.fotos ?? []}
      />
      <Secao
        titulo="Novo aterramento do poste"
        obs={payload?.novoAterramentoPoste.obs}
        fotos={payload?.novoAterramentoPoste.fotos ?? []}
      />
      <Secao
        titulo="Aterramento - TERROMETRO"
        obs={payload?.aterramentoTerrometro.obs}
        fotos={payload?.aterramentoTerrometro.fotos ?? []}
      />
      <Secao
        titulo="Posição DGO/DIO"
        obs={payload?.posicaoConexaoEstacao.obs}
        fotos={payload?.posicaoConexaoEstacao.fotos ?? []}
      />
      <Secao
        titulo="Etiqueta na estação/PPC"
        obs={payload?.etiquetaIdentificacao.obs}
        fotos={payload?.etiquetaIdentificacao.fotos ?? []}
      />
      <Secao
        titulo="Sobra técnica / Fiberloop"
        obs={payload?.sobraTecnica.obs}
        fotos={payload?.sobraTecnica.fotos ?? []}
      />
      {(payload?.outrasFotos ?? [])
        .filter((item) => item.foto || item.ref || item.obs)
        .map((item) => (
          <Secao
            key={item.id}
            titulo={`Outra (RE) — ${item.ref || "sem REF"}`}
            obs={item.obs}
            fotos={item.foto ? [item.foto] : []}
          />
        ))}

      {payload?.tecnologiaAcesso ? (
        <Campo label="Tecnologia de Acesso" value={payload.tecnologiaAcesso} />
      ) : null}
      {payload?.lancamentoRc === true || payload?.lancamentoRc === false ? (
        <Campo
          label="Lançamento cabos (RC)"
          value={payload.lancamentoRc ? "SIM" : "NÃO"}
        />
      ) : null}
      {(payload?.metragensCaboRc ?? []).map((cabo, index) => (
        <Secao
          key={cabo.id}
          titulo={`Cabo RC ${index + 1} — ${cabo.tipoCabo || "tipo n/d"} · ${cabo.metragem || "—"}`}
          obs={cabo.obs}
          fotos={[cabo.fotoInicio, cabo.fotoFim].filter((f): f is StoredPhoto => Boolean(f))}
        />
      ))}
      <Secao
        titulo="Poste de conexão (Rede cliente com Rede Externa)"
        obs={payload?.rcPosteConexao.obs}
        fotos={payload?.rcPosteConexao.fotos ?? []}
      />
      <Secao
        titulo="Caixa de emenda na acomodação (Rede cliente com Rede Externa)"
        obs={payload?.rcCaixaEmenda.obs}
        fotos={payload?.rcCaixaEmenda.fotos ?? []}
      />
      <Secao
        titulo="Terminação do cabo no cliente (PTO/Roseta - área interna)"
        obs={payload?.rcTerminacaoCabo.obs}
        fotos={payload?.rcTerminacaoCabo.fotos ?? []}
      />
      <Secao
        titulo="Plaqueta de Identificação - Terminação do cabo no cliente"
        obs={payload?.rcPlaquetaIdentificacao.obs}
        fotos={payload?.rcPlaquetaIdentificacao.fotos ?? []}
      />
      <Secao
        titulo="Entrada do cabo no cliente (Área interna)"
        obs={payload?.rcEntradaInterna.obs}
        fotos={payload?.rcEntradaInterna.fotos ?? []}
      />
      <Secao
        titulo="Entrada do cabo no cliente (Área externa)"
        obs={payload?.rcEntradaExterna.obs}
        fotos={payload?.rcEntradaExterna.fotos ?? []}
      />
      {(payload?.outrasFotosRc ?? [])
        .filter((item) => item.foto || item.ref || item.obs)
        .map((item) => (
          <Secao
            key={item.id}
            titulo={`Outra (RC) — ${item.ref || "sem REF"}`}
            obs={item.obs}
            fotos={item.foto ? [item.foto] : []}
          />
        ))}
    </div>
  );
}
