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
    <div className="mb-7 border-b border-meama-charcoal pb-6">
      {kicker ? <Kicker ka={kickerKa}>{kicker}</Kicker> : null}
      <h1 className="text-[30px] font-bold leading-tight tracking-[-0.02em] text-meama-brown">
        {title}
      </h1>
      {subtitle ? (
        <p className="mt-2 text-[14px] leading-snug text-meama-cream">
          {subtitle}
        </p>
      ) : null}
    </div>
  );
}
