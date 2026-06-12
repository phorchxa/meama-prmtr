/** Capsule intensity 1–12 rendered as filled dots. */
export function IntensityDots({ value, max = 12 }: { value: number; max?: number }) {
  return (
    <span
      className="inline-flex items-center gap-[3px]"
      role="img"
      aria-label={`intensity ${value} of ${max}`}
      title={`Intensity ${value}/${max}`}
    >
      {Array.from({ length: max }, (_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`inline-block h-[7px] w-[7px] rounded-full ${
            i < value ? "bg-meama-brown" : "bg-meama-brown/15"
          }`}
        />
      ))}
      <span className="tabular ml-1.5 text-xs font-semibold text-meama-brown">{value}</span>
    </span>
  );
}
