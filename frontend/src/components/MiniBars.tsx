// Inline-SVG bar chart (monthly history). No charting library (per conventions).
export function MiniBars({
  data,
  width = 120,
  height = 32,
  color = "var(--meama-gold)",
  highlightLast = true,
}: {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  highlightLast?: boolean;
}) {
  if (data.length === 0) return <svg width={width} height={height} aria-hidden="true" />;
  const max = Math.max(...data, 1);
  const gap = 2;
  const barW = (width - gap * (data.length - 1)) / data.length;
  return (
    <svg width={width} height={height} role="img" aria-label="monthly history">
      {data.map((v, i) => {
        const h = Math.max((v / max) * height, 1.5);
        const last = highlightLast && i === data.length - 1;
        return (
          <rect
            key={i}
            x={i * (barW + gap)}
            y={height - h}
            width={barW}
            height={h}
            rx={1}
            fill={color}
            opacity={last ? 1 : 0.45}
          />
        );
      })}
    </svg>
  );
}
