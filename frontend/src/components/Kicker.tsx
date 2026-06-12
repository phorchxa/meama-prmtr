/** Gold section label with a dash, matching the marketing-site kicker. */
export function Kicker({ children, ka }: { children: string; ka?: string }) {
  return (
    <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.18em] text-meama-gold">
      <span aria-hidden="true" className="block h-[2px] w-7 bg-meama-gold" />
      {children}
      {ka ? <span className="font-medium normal-case tracking-wide opacity-75">· {ka}</span> : null}
    </div>
  );
}
