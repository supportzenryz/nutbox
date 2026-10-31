export function PageHead({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold">{title}</h1>
        {sub && <p className="mt-1 text-sm text-muted">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </div>
  );
}

export function Kpi({ label, value, note, tone = "default" }: { label: string; value: string; note?: string; tone?: "default" | "warn" }) {
  return (
    <div className={`panel p-4 ${tone === "warn" ? "border-saffron/60" : ""}`}>
      <p className="text-sm text-muted">{label}</p>
      <p className="num mt-1 text-2xl font-semibold">{value}</p>
      {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
    </div>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="panel p-8 text-center text-sm text-muted">{children}</div>;
}
