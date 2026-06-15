/** Editorial section label — monochrome Yeezy style. */
export function Kicker({ children, ka }: { children: string; ka?: string }) {
  return (
    <div className="mb-3 flex items-center gap-2.5 font-mono text-[9.5px] uppercase tracking-[0.32em] text-meama-muted">
      <span aria-hidden="true" className="block h-px w-5 bg-meama-charcoal" />
      {children}
      {ka ? (
        <span className="font-normal normal-case tracking-wide opacity-50">· {ka}</span>
      ) : null}
    </div>
  );
}
