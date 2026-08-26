import { ExpandableImage } from "@/components/ExpandableImage";
import {
  type FotoGrupoPorAmbientePayload,
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

function SecaoAmbiente({
  titulo,
  grupo,
}: {
  titulo: string;
  grupo: FotoGrupoPorAmbientePayload | undefined;
}) {
  return (
    <>
      <Secao
        titulo={`${titulo} (Aéreo)`}
        obs={grupo?.aereo.obs}
        fotos={grupo?.aereo.fotos ?? []}
      />
      <Secao
        titulo={`${titulo} (Subterrâneo)`}
        obs={grupo?.subterraneo.obs}
        fotos={grupo?.subterraneo.fotos ?? []}
      />
    </>
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

      {(payload?.lancamentoCabosRe?.aereo.metragens ?? payload?.metragensCabo ?? []).map(
        (cabo, index) => (
        <Secao
          key={`re-aereo-${cabo.id}`}
          titulo={`Cabo RE aéreo ${index + 1} — tipo ${cabo.tipoCabo || "n/d"} · ${cabo.metragem || "—"} m`}
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
      {(payload?.lancamentoCabosRe?.subterraneo.metragens ?? []).map((cabo, index) => (
        <Secao
          key={`re-sub-${cabo.id}`}
          titulo={`Cabo RE subterrâneo ${index + 1} — tipo ${cabo.tipoCabo || "n/d"} · ${cabo.metragem || "—"} m`}
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
      <SecaoAmbiente titulo="Caixa de emenda" grupo={payload?.caixaEmenda} />
      <Secao
        titulo="Const. de duto subterraneio (MD ou MND)"
        obs={payload?.dutoSubterraneo.obs}
        fotos={payload?.dutoSubterraneo.fotos ?? []}
      />
      <SecaoAmbiente
        titulo="Plaqueta de Identificação - Caixa de emenda"
        grupo={payload?.plaquetaIdentificacao}
      />
      <Secao
        titulo="Novo aterramento do poste"
        obs={payload?.novoAterramentoPoste.obs}
        fotos={payload?.novoAterramentoPoste.fotos ?? []}
      />
      <SecaoAmbiente titulo="Sobra técnica / Fiberloop" grupo={payload?.sobraTecnica} />
      {payload?.redeAcesso?.fiberloopInstalado?.isSim != null ? (
        <Campo
          label="Fiberloop instalado (RE)"
          value={payload.redeAcesso.fiberloopInstalado.isSim ? "SIM" : "NÃO"}
        />
      ) : null}
      {payload?.redeAcesso?.fiberloopInstalado?.isSim &&
      payload.redeAcesso.fiberloopInstalado.quantidade != null ? (
        <Campo
          label="Qtd. Fiberloop (RE)"
          value={String(payload.redeAcesso.fiberloopInstalado.quantidade)}
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
      {(payload?.lancamentoCabosRc?.aereo.metragens ?? payload?.metragensCaboRc ?? []).map(
        (cabo, index) => (
        <Secao
          key={`rc-aereo-${cabo.id}`}
          titulo={`Cabo RC aéreo ${index + 1} — tipo ${cabo.tipoCabo || "n/d"} · ${cabo.metragem || "—"} m`}
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
      {(payload?.lancamentoCabosRc?.subterraneo.metragens ?? []).map((cabo, index) => (
        <Secao
          key={`rc-sub-${cabo.id}`}
          titulo={`Cabo RC subterrâneo ${index + 1} — tipo ${cabo.tipoCabo || "n/d"} · ${cabo.metragem || "—"} m`}
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
        titulo="Novo aterramento do poste (RC)"
        obs={payload?.rcNovoAterramentoPoste.obs}
        fotos={payload?.rcNovoAterramentoPoste.fotos ?? []}
      />
      <SecaoAmbiente
        titulo="Caixa de emenda na acomodação (Rede cliente com Rede Externa)"
        grupo={payload?.rcCaixaEmenda}
      />
      <Secao
        titulo="Const. de duto subterrâneo (RC)"
        obs={payload?.rcDutoSubterraneo.obs}
        fotos={payload?.rcDutoSubterraneo.fotos ?? []}
      />
      <Secao
        titulo="Terminação do cabo no cliente (PTO/Roseta - área interna)"
        obs={payload?.rcTerminacaoCabo.obs}
        fotos={payload?.rcTerminacaoCabo.fotos ?? []}
      />
      <SecaoAmbiente
        titulo="Plaqueta de Identificação - Terminação do cabo no cliente"
        grupo={payload?.rcPlaquetaIdentificacao}
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
      <SecaoAmbiente titulo="Sobra técnica / Fiberloop (RC)" grupo={payload?.rcSobraTecnica} />
      {payload?.redeCliente?.fiberloopInstalado?.isSim != null ? (
        <Campo
          label="Fiberloop instalado (RC)"
          value={payload.redeCliente.fiberloopInstalado.isSim ? "SIM" : "NÃO"}
        />
      ) : null}
      {payload?.redeCliente?.fiberloopInstalado?.isSim &&
      payload.redeCliente.fiberloopInstalado.quantidade != null ? (
        <Campo
          label="Qtd. Fiberloop (RC)"
          value={String(payload.redeCliente.fiberloopInstalado.quantidade)}
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
          titulo={`Roseta ${index + 1}${item.tipoEquipamento ? ` — ${item.tipoEquipamento}` : ""}`}
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
      <Secao
        titulo="Posição de conexão na Estação/PPC (DGO/DIO)"
        obs={payload?.posicaoConexaoEstacao.obs}
        fotos={payload?.posicaoConexaoEstacao.fotos ?? []}
      />
      <Secao
        titulo="ETIQUETA DE IDENTIFICAÇÃO NA ESTAÇÃO/PPC"
        obs={payload?.etiquetaIdentificacao.obs}
        fotos={payload?.etiquetaIdentificacao.fotos ?? []}
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
