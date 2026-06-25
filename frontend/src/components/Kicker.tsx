/** Editorial section label — monochrome Yeezy style. */
export function Kicker({ children, ka }: { children: string; ka?: string }) {
  return (
    <div className="mb-2.5 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-meama-muted">
      <span aria-hidden="true" className="block h-2 w-2 bg-green-500" />
      {children}
      {ka ? (
        <span className="font-normal normal-case tracking-wide opacity-50">· {ka}</span>
      ) : null}
    </div>
  );
}
