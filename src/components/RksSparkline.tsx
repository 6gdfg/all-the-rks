import { formatRks } from "@/lib/format";
import type { RksHistoryPoint } from "@/lib/rks";

type RksSparklineProps = {
  points: RksHistoryPoint[];
  className?: string;
};

export function RksSparkline({ points, className }: RksSparklineProps) {
  const latest = points.at(-1);

  if (points.length === 0 || !latest) {
    return null;
  }

  const width = 128;
  const height = 34;
  const padding = 3;
  const values = points.map((point) => point.rks);
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 0.001);
  const range = Math.max(max - min, 0.001);
  const coordinates = points.map((point, index) => {
    const x =
      points.length === 1
        ? width - padding
        : padding + (index / (points.length - 1)) * (width - padding * 2);
    const y = height - padding - ((point.rks - min) / range) * (height - padding * 2);

    return { x, y };
  });
  const last = coordinates.at(-1) ?? { x: width - padding, y: height - padding };

  return (
    <div className={`rks-sparkline${className ? ` ${className}` : ""}`}>
      <svg
        aria-label={`RKS 历史趋势，当前 ${formatRks(latest.rks)}`}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        <polyline
          className="rks-sparkline-grid"
          points={`${padding},${height - padding} ${width - padding},${height - padding}`}
        />
        <polyline
          className="rks-sparkline-line"
          points={coordinates
            .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
            .join(" ")}
        />
        <circle
          className="rks-sparkline-dot"
          cx={last.x}
          cy={last.y}
          r="2.6"
        />
      </svg>
      <span>{formatRks(latest.rks)}</span>
    </div>
  );
}
