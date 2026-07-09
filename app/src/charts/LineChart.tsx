import { useMemo, useRef, useState } from "react";

export interface LinePoint {
  x: string; // 日付ラベル
  y: number;
}

interface Props {
  data: LinePoint[];
  height?: number;
  color?: string;
  zeroLine?: boolean;
  formatY?: (v: number) => string;
  markers?: { x: string; label: string; color: string }[];
}

const PADDING = { top: 12, right: 12, bottom: 22, left: 46 };

export function LineChart({ data, height = 220, color = "var(--series-blue)", zeroLine, formatY, markers }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  const [hover, setHover] = useState<{ idx: number; x: number } | null>(null);

  useMemo(() => {
    if (ref.current) setWidth(ref.current.clientWidth);
  }, [data]);

  const innerW = width - PADDING.left - PADDING.right;
  const innerH = height - PADDING.top - PADDING.bottom;

  const ys = data.map((d) => d.y);
  let min = Math.min(...ys, zeroLine ? 0 : Infinity);
  let max = Math.max(...ys, zeroLine ? 0 : -Infinity);
  if (min === max) {
    min -= 1;
    max += 1;
  }
  const pad = (max - min) * 0.08;
  min -= pad;
  max += pad;

  const xFor = (i: number) => PADDING.left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const yFor = (v: number) => PADDING.top + innerH - ((v - min) / (max - min)) * innerH;

  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${xFor(i)},${yFor(d.y)}`).join(" ");

  const fmt = formatY ?? ((v: number) => v.toFixed(2));

  function handleMove(e: React.MouseEvent<SVGRectElement>) {
    const rect = (e.target as SVGRectElement).getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const ratio = Math.min(1, Math.max(0, relX / innerW));
    const idx = Math.round(ratio * (data.length - 1));
    setHover({ idx, x: xFor(idx) });
  }

  return (
    <div ref={ref} style={{ width: "100%" }}>
      <svg width={width} height={height} role="img">
        {/* グリッド線（控えめ） */}
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const v = min + (max - min) * (1 - t);
          const y = PADDING.top + t * innerH;
          return (
            <g key={t}>
              <line x1={PADDING.left} x2={width - PADDING.right} y1={y} y2={y} stroke="var(--gridline)" strokeWidth={1} />
              <text x={PADDING.left - 8} y={y + 4} fontSize={10} fill="var(--text-muted)" textAnchor="end">
                {fmt(v)}
              </text>
            </g>
          );
        })}
        {zeroLine && (
          <line
            x1={PADDING.left}
            x2={width - PADDING.right}
            y1={yFor(0)}
            y2={yFor(0)}
            stroke="var(--baseline)"
            strokeWidth={1}
            strokeDasharray="3,3"
          />
        )}
        <path d={path} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {markers?.map((m, i) => {
          const idx = data.findIndex((d) => d.x === m.x);
          if (idx < 0) return null;
          return <circle key={i} cx={xFor(idx)} cy={yFor(data[idx].y)} r={4} fill={m.color} stroke="var(--surface-1)" strokeWidth={1.5} />;
        })}
        {hover && data[hover.idx] && (
          <>
            <line x1={hover.x} x2={hover.x} y1={PADDING.top} y2={height - PADDING.bottom} stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="2,2" />
            <circle cx={hover.x} cy={yFor(data[hover.idx].y)} r={3.5} fill={color} />
          </>
        )}
        <rect
          x={PADDING.left}
          y={PADDING.top}
          width={innerW}
          height={innerH}
          fill="transparent"
          onMouseMove={handleMove}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {hover && data[hover.idx] && (
        <div style={{ fontSize: 12, color: "var(--text-secondary)", textAlign: "center" }}>
          {data[hover.idx].x}: <strong style={{ color: "var(--text-primary)" }}>{fmt(data[hover.idx].y)}</strong>
        </div>
      )}
    </div>
  );
}
