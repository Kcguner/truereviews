'use client';
import { useEffect, useState } from 'react';

function colorFor(score: number): string {
  if (score >= 7) return '#10b981'; // emerald-500
  if (score >= 4) return '#f59e0b'; // amber-500
  return '#f43f5e'; // rose-500
}

/** Animasyonlu skor halkası (0-10). */
export default function ScoreRing({ score, size = 148 }: { score: number; size?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(score));
    return () => cancelAnimationFrame(id);
  }, [score]);

  const stroke = size / 13;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(10, shown)) / 10;
  const color = colorFor(score);
  const gid = `sg-${Math.round(size)}`;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`${score.toFixed(1)} / 10`}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          <linearGradient id={gid} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color} />
            <stop offset="100%" stopColor={color} stopOpacity={0.55} />
          </linearGradient>
        </defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} className="stroke-slate-200 dark:stroke-slate-800" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 1.1s cubic-bezier(0.22, 1, 0.36, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-black tabular-nums tracking-tight" style={{ color }}>
          {score.toFixed(1)}
        </span>
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">/ 10</span>
      </div>
    </div>
  );
}
