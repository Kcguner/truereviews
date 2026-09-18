'use client';
import { useEffect, useRef, useState } from 'react';
import { bandColor } from './types';

/** Yarım daire skor göstergesi (0-100). Animasyonlu yay + sayı. */
export default function Gauge({ score, label }: { score: number; label: string }) {
  const [shown, setShown] = useState(0);
  const numRef = useRef<HTMLDivElement>(null);
  const r = 92;
  const len = Math.PI * r;

  useEffect(() => {
    let raf = 0;
    const t0 = performance.now();
    const dur = 1200;
    const tick = (ts: number) => {
      const p = Math.min((ts - t0) / dur, 1);
      const e = 1 - Math.pow(1 - p, 3);
      setShown(score * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [score]);

  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => {
    const a = Math.PI * (1 - f);
    const x1 = 110 + 104 * Math.cos(a);
    const y1 = 118 - 104 * Math.sin(a);
    const x2 = 110 + 113 * Math.cos(a);
    const y2 = 118 - 113 * Math.sin(a);
    return (
      <path
        key={f}
        d={`M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`}
        stroke="var(--line-2)"
        strokeWidth="2"
        strokeLinecap="round"
      />
    );
  });

  return (
    <div className="gauge">
      <svg viewBox="0 0 220 132" role="img" aria-label={`${Math.round(score)}/100`}>
        {ticks}
        <path
          d="M18 118 A92 92 0 0 1 202 118"
          fill="none"
          stroke="var(--track)"
          strokeWidth="15"
          strokeLinecap="round"
        />
        <path
          d="M18 118 A92 92 0 0 1 202 118"
          fill="none"
          stroke={bandColor(score)}
          strokeWidth="15"
          strokeLinecap="round"
          strokeDasharray={len.toFixed(1)}
          strokeDashoffset={(len - (len * Math.max(0, Math.min(100, shown))) / 100).toFixed(1)}
          style={{ transition: 'stroke-dashoffset 0.1s linear' }}
        />
      </svg>
      <div className="gauge__val">
        <div className="gauge__n" ref={numRef}>
          {Math.round(shown)}
          <small>/100</small>
        </div>
        <div className="gauge__cap">{label}</div>
      </div>
    </div>
  );
}
