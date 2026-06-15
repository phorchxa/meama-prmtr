/** Capsule intensity 1–12 rendered as filled squares — editorial style. */
export function IntensityDots({ value, max = 12 }: { value: number; max?: number }) {
  return (
    <span
      className="inline-flex items-center gap-[2px]"
      role="img"
      aria-label={`intensity ${value} of ${max}`}
      title={`Intensity ${value}/${max}`}
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`inline-block h-[5px] w-[5px] ${
            i < value ? "bg-meama-brown" : "bg-meama-charcoal"
          }`}
        />
      ))}
      <span className="tabular ml-2 font-mono text-[10px] font-medium text-meama-cream">{value}</span>
    </span>
  );
}
