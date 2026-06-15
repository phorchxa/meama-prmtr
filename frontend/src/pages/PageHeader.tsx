import { Kicker } from "../components/Kicker";

export function PageHeader({
  title,
  subtitle,
  kicker,
  kickerKa,
}: {
  title: string;
  subtitle?: string;
  kicker?: string;
  kickerKa?: string;
}) {
  return (
    <div className="mb-10 border-b border-meama-charcoal pb-8">
      {kicker ? <Kicker ka={kickerKa}>{kicker}</Kicker> : null}
      <h1 className="font-display text-[56px] uppercase leading-none tracking-[0.06em] text-meama-brown">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.25em] text-meama-muted">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
