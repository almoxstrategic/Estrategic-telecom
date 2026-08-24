import { ExpandableImage } from "@/components/ExpandableImage";
import {
  type RelatorioTransmissao,
  type StoredPhoto,
} from "@/lib/relatorios-transmissao";

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
          <ExpandableImage src={foto.url} alt="Evidência" />
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
          titulo={`Cabo RE ${index + 1} — tipo ${cabo.tipoCabo || "n/d"} · ${cabo.metragem || "—"} m`}
          obs={[
            cabo.marcacaoInicial && `Inicial: ${cabo.marcacaoInicial} m`,
            cabo.marcacaoFinal && `Final: ${cabo.marcacaoFinal} m`,
            cabo.obs,
          ]
            .filter(Boolean)
            .join("\n")}
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
        titulo="Const. de duto subterraneio (MD ou MND)"
        obs={payload?.dutoSubterraneo.obs}
        fotos={payload?.dutoSubterraneo.fotos ?? []}
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
      {payload?.redeAcesso?.aterramento?.totalHastes != null ? (
        <Campo
          label="Total de Hastes (5/8)"
          value={String(payload.redeAcesso.aterramento.totalHastes)}
        />
      ) : null}
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
      {payload?.redeAcesso?.qtdFiberloopInstalado != null ? (
        <Campo
          label="Qtd. Fiberloop (RE)"
          value={String(payload.redeAcesso.qtdFiberloopInstalado)}
        />
      ) : null}
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
          titulo={`Cabo RC ${index + 1} — tipo ${cabo.tipoCabo || "n/d"} · ${cabo.metragem || "—"} m`}
          obs={[
            cabo.marcacaoInicial && `Inicial: ${cabo.marcacaoInicial} m`,
            cabo.marcacaoFinal && `Final: ${cabo.marcacaoFinal} m`,
            cabo.obs,
          ]
            .filter(Boolean)
            .join("\n")}
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
      <Secao
        titulo="Sobra técnica / Fiberloop (RC)"
        obs={payload?.rcSobraTecnica.obs}
        fotos={payload?.rcSobraTecnica.fotos ?? []}
      />
      {payload?.redeCliente?.qtdFiberloopInstalado != null ? (
        <Campo
          label="Qtd. Fiberloop (RC)"
          value={String(payload.redeCliente.qtdFiberloopInstalado)}
        />
      ) : null}
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

      <Secao
        titulo="Cliente - (Entrada/Fachada)"
        obs={payload?.eqClienteFachada.obs}
        fotos={payload?.eqClienteFachada.fotos ?? []}
      />
      <Secao
        titulo="Cliente - Ambiente (geral da sala)"
        obs={payload?.eqClienteAmbiente.obs}
        fotos={payload?.eqClienteAmbiente.fotos ?? []}
      />
      <Secao
        titulo="(Rack ou Local)"
        obs={payload?.eqClienteRack.obs}
        fotos={payload?.eqClienteRack.fotos ?? []}
      />
      {(payload?.eqClienteDgo ?? []).map((item, index) => (
        <Secao
          key={item.id}
          titulo={`DGO/Roseta ${index + 1}${item.tipoEquipamento ? ` — ${item.tipoEquipamento}` : ""}`}
          obs={[
            item.modelo && `Modelo: ${item.modelo}`,
            item.fabricante && `Fabricante: ${item.fabricante}`,
            item.sgp && `SGP: ${item.sgp}`,
            item.obs,
          ]
            .filter(Boolean)
            .join("\n")}
          fotos={[item.foto, item.etiqueta].filter((f): f is NonNullable<typeof f> => Boolean(f))}
        />
      ))}
      {(payload?.eqClienteEquipamentos ?? []).map((item, index) => (
        <Secao
          key={item.id}
          titulo={`Equipamento ${index + 1}${item.tipoEquipamento ? ` — ${item.tipoEquipamento}` : ""}`}
          obs={[
            item.modelo && `Modelo: ${item.modelo}`,
            item.fabricante && `Fabricante: ${item.fabricante}`,
            item.sgp && `SGP: ${item.sgp}`,
            item.identificacao && `Identificação: ${item.identificacao}`,
            item.obs,
          ]
            .filter(Boolean)
            .join("\n")}
          fotos={[item.foto, item.etiqueta].filter((f): f is NonNullable<typeof f> => Boolean(f))}
        />
      ))}
      <Secao
        titulo="Identificação SGP no Cliente"
        obs={payload?.eqClienteSgp.obs}
        fotos={payload?.eqClienteSgp.fotos ?? []}
      />
      {(payload?.outrasFotosEqCliente ?? [])
        .filter((item) => item.foto || item.ref || item.obs)
        .map((item) => (
          <Secao
            key={item.id}
            titulo={`Outra (Equip. cliente) — ${item.ref || "sem REF"}`}
            obs={item.obs}
            fotos={item.foto ? [item.foto] : []}
          />
        ))}
      {payload?.relatorioEstacao ? (
        <>
          {payload.estacaoEntregaAcesso ? (
            <Campo label="Estação Entrega de Acesso" value={payload.estacaoEntregaAcesso} />
          ) : null}
          <Secao
            titulo="Estação - (Foto geral da estação/PPC)"
            obs={payload.eqEstacaoGeral.obs}
            fotos={payload.eqEstacaoGeral.fotos ?? []}
          />
          <Secao
            titulo="(Rack ou Local Instalação)"
            obs={payload.eqEstacaoRack.obs}
            fotos={payload.eqEstacaoRack.fotos ?? []}
          />
          {(payload.eqEstacaoEquipamento ?? []).map((item, index) => (
            <Secao
              key={item.id}
              titulo={`Equipamento (Estação) ${index + 1}${item.tipoEquipamento ? ` — ${item.tipoEquipamento}` : ""}`}
              obs={[
                item.modelo && `Modelo: ${item.modelo}`,
                item.fabricante && `Fabricante: ${item.fabricante}`,
                item.sgp && `SGP: ${item.sgp}`,
                item.identificacao && `Identificação: ${item.identificacao}`,
                item.obs,
              ]
                .filter(Boolean)
                .join("\n")}
              fotos={[item.foto, item.etiqueta].filter((f): f is NonNullable<typeof f> => Boolean(f))}
            />
          ))}
          {(payload.eqEstacaoDgo ?? []).map((item, index) => (
            <Secao
              key={item.id}
              titulo={`DGO / DID / ROUTER ${index + 1}${item.tipoEquipamento ? ` — ${item.tipoEquipamento}` : ""}`}
              obs={[
                item.modelo && `Modelo: ${item.modelo}`,
                item.fabricante && `Fabricante: ${item.fabricante}`,
                item.sgp && `SGP: ${item.sgp}`,
                item.obs,
              ]
                .filter(Boolean)
                .join("\n")}
              fotos={[item.foto, item.etiqueta].filter((f): f is NonNullable<typeof f> => Boolean(f))}
            />
          ))}
          {(payload.outrasFotosEqEstacao ?? [])
            .filter((item) => item.foto || item.ref || item.obs)
            .map((item) => (
              <Secao
                key={item.id}
                titulo={`Outra (Estação/PPC) — ${item.ref || "sem REF"}`}
                obs={item.obs}
                fotos={item.foto ? [item.foto] : []}
              />
            ))}
        </>
      ) : null}
    </div>
  );
}
