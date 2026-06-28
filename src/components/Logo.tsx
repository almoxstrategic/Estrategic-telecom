export function Logo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <div className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground font-black text-lg shadow-sm">
        E
      </div>
      <div className="leading-tight">
        <div className="font-black tracking-tight text-foreground">Estrategic</div>
      </div>
    </div>
  );
}
