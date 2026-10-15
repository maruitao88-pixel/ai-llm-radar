"use client";

import { useRef, useState, useCallback } from "react";

export interface Series {
  label: string;
  color: string;
  data: number[];
}

interface Props {
  labels: string[];
  series: Series[];
  height?: number;
}

export default function LineChart({ labels, series, height = 220 }: Props) {
  if (labels.length === 0) return null;

  const svgRef = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 640;
  const H = height;
  const PAD_L = 40;
  const PAD_R = 16;
  const PAD_T = 16;
  const PAD_B = 32;
  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  const allValues = series.flatMap((s) => s.data);
  const maxRaw = Math.max(...allValues, 1);
  const yStep = Math.ceil(maxRaw / 4) || 1;
  const yMax = yStep * 4;

  const xStep = chartW / Math.max(labels.length - 1, 1);

  const px = (i: number) => PAD_L + i * xStep;
  const py = (v: number) => PAD_T + chartH - (v / yMax) * chartH;

  function toPath(data: number[]): string {
    return data.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
  }

  function toAreaPath(data: number[]): string {
    const line = data.map((v, i) => `${i === 0 ? "M" : "L"}${px(i).toFixed(1)},${py(v).toFixed(1)}`).join(" ");
    const bottom = PAD_T + chartH;
    return `${line} L${px(data.length - 1).toFixed(1)},${bottom} L${px(0).toFixed(1)},${bottom} Z`;
  }

  const yLabels = Array.from({ length: 5 }, (_, i) => i * yStep);
  const showEvery = Math.max(1, Math.ceil(labels.length / 8));

  const onMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      const svg = svgRef.current;
      if (!svg) return;
      const rect = svg.getBoundingClientRect();
      const mouseX = ((e.clientX - rect.left) / rect.width) * W;
      const idx = Math.round((mouseX - PAD_L) / xStep);
      if (idx >= 0 && idx < labels.length) {
        setHover(idx);
      } else {
        setHover(null);
      }
    },
    [xStep, labels.length],
  );

  const hoverX = hover !== null ? px(hover) : 0;

  return (
    <div className="relative">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto select-none"
        role="img"
        aria-label="趋势折线图"
        onMouseMove={onMouseMove}
        onMouseLeave={() => setHover(null)}
      >
        {/* Y grid */}
        {yLabels.map((v) => {
          const y = py(v);
          return (
            <g key={v}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="currentColor" className="text-gray-200 dark:text-gray-700" strokeWidth="0.5" strokeDasharray={v > 0 ? "4 3" : "0"} />
              <text x={PAD_L - 6} y={y + 3.5} textAnchor="end" className="fill-gray-400 dark:fill-gray-500" style={{ fontSize: 10 }}>
                {v}
              </text>
            </g>
          );
        })}

        {/* X labels */}
        {labels.map((l, i) =>
          i % showEvery === 0 ? (
            <text key={i} x={px(i)} y={H - 6} textAnchor="middle" className="fill-gray-400 dark:fill-gray-500" style={{ fontSize: 9 }}>
              {l.slice(5)}
            </text>
          ) : null,
        )}

        {/* Area fills */}
        {series.map((s) => (
          <path key={s.label + "-area"} d={toAreaPath(s.data)} fill={s.color} fillOpacity="0.08" />
        ))}

        {/* Lines */}
        {series.map((s) => (
          <path key={s.label} d={toPath(s.data)} fill="none" stroke={s.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        ))}

        {/* Hover vertical line */}
        {hover !== null && (
          <line x1={hoverX} x2={hoverX} y1={PAD_T} y2={PAD_T + chartH} stroke="currentColor" className="text-gray-300 dark:text-gray-600" strokeWidth="1" strokeDasharray="3 2" />
        )}

        {/* Hover dots */}
        {hover !== null &&
          series.map((s) => (
            <circle key={s.label + "-hover"} cx={hoverX} cy={py(s.data[hover])} r="4.5" fill={s.color} stroke="white" className="dark:stroke-gray-900" strokeWidth="2" />
          ))}

        {/* Invisible hit areas for each data point column */}
        {labels.map((_, i) => (
          <rect key={i} x={px(i) - xStep / 2} y={PAD_T} width={xStep} height={chartH} fill="transparent" />
        ))}
      </svg>

      {/* Tooltip */}
      {hover !== null && (
        <div
          className="absolute z-10 pointer-events-none"
          style={{
            left: `${(hoverX / W) * 100}%`,
            top: 0,
            transform: hoverX > W * 0.7 ? "translateX(-110%)" : "translateX(8px)",
          }}
        >
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg px-3 py-2 text-xs min-w-[120px]">
            <div className="font-medium text-gray-800 dark:text-gray-100 mb-1.5">{labels[hover]}</div>
            {series.map((s) => (
              <div key={s.label} className="flex items-center justify-between gap-3 py-0.5">
                <span className="flex items-center gap-1.5 text-gray-600 dark:text-gray-300">
                  <span className="w-2 h-2 rounded-full inline-block" style={{ background: s.color }} />
                  {s.label}
                </span>
                <span className="font-semibold text-gray-800 dark:text-gray-100 tabular-nums">{s.data[hover]}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
