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
    <div className="mb-7">
      {kicker ? <Kicker ka={kickerKa}>{kicker}</Kicker> : null}
      <h1 className="font-display text-[30px] font-bold tracking-tight text-meama-cream">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-meama-cream/55">{subtitle}</p> : null}
    </div>
  );
}
