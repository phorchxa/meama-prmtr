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
    <div className="mb-6">
      {kicker ? <Kicker ka={kickerKa}>{kicker}</Kicker> : null}
      <h1 className="text-[26px] font-extrabold tracking-tight text-meama-brown">{title}</h1>
      {subtitle ? <p className="mt-1 text-sm text-meama-muted">{subtitle}</p> : null}
    </div>
  );
}
