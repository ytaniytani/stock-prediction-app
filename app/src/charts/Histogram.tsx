import { useMemo, useRef, useState } from "react";

interface Props {
  values: number[]; // 騰落率(%)の配列
  height?: number;
  bins?: number;
}

const PADDING = { top: 10, right: 10, bottom: 26, left: 10 };

export function Histogram({ values, height = 160, bins = 16 }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useMemo(() => {
    if (ref.current) setWidth(ref.current.clientWidth);
  }, [values]);

  if (values.length === 0) {
    return <div style={{ color: "var(--text-muted)", fontSize: 12 }}>データがありません</div>;
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const binWidth = range / bins;
  const counts = new Array(bins).fill(0);
  for (const v of values) {
    const idx = Math.min(bins - 1, Math.floor((v - min) / binWidth));
    counts[idx]++;
  }
  const maxCount = Math.max(...counts);

  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;
  const barW = innerW / bins;

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={width} height={height}>
        <line x1={PADDING.left} x2={width - PADDING.right} y1={height - PADDING.bottom} y2={height - PADDING.bottom} stroke="var(--baseline)" strokeWidth={1} />
        {counts.map((c, i) => {
          const binStart = min + i * binWidth;
          const h = maxCount ? (c / maxCount) * innerH : 0;
          const x = PADDING.left + i * barW;
          const y = height - PADDING.bottom - h;
          const isNeg = binStart + binWidth / 2 < 0;
          return (
            <g key={i}>
              <rect
                x={x + 1}
                y={y}
                width={Math.max(barW - 2, 1)}
                height={h}
                rx={2}
                fill={isNeg ? "var(--down-color)" : "var(--up-color)"}
                opacity={0.85}
              >
                <title>
                  {binStart.toFixed(1)}%〜{(binStart + binWidth).toFixed(1)}%: {c}件
                </title>
              </rect>
            </g>
          );
        })}
        <text x={PADDING.left} y={height - 6} fontSize={10} fill="var(--text-muted)">
          {min.toFixed(1)}%
        </text>
        <text x={width - PADDING.right} y={height - 6} fontSize={10} fill="var(--text-muted)" textAnchor="end">
          {max.toFixed(1)}%
        </text>
      </svg>
    </div>
  );
}
