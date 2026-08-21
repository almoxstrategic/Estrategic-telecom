function AbaPlaceholder({ titulo }: { titulo: string }) {
  return (
    <div className="space-y-3 rounded-2xl border border-dashed border-border bg-card p-8 text-center shadow-sm">
      <h2 className="text-base font-bold">{titulo}</h2>
      <p className="text-sm text-muted-foreground">Em desenvolvimento</p>
    </div>
  );
}

export function AbaConfiguracao() {
  return <AbaPlaceholder titulo="Configuração / Conexões" />;
}

export function AbaInfraestrutura() {
  return <AbaPlaceholder titulo="Infraestrutura" />;
}

export function AbaMedicoes() {
  return <AbaPlaceholder titulo="Medições" />;
}

export function AbaContatos() {
  return <AbaPlaceholder titulo="Contatos" />;
}
