'use client';
import { useEffect, useState } from 'react';
import type { NbTone } from './types';

/** Övgü / nötr / şikayet dağılım çubuğu. */
export default function ToneBar({
  tone,
  labels
}: {
  tone: NbTone;
  labels: { pos: string; neu: string; neg: string };
}) {
  const [w, setW] = useState({ pos: 0, neu: 0, neg: 0 });
  useEffect(() => {
    const id = setTimeout(() => setW(tone), 260);
    return () => clearTimeout(id);
  }, [tone]);

  const rows = [
    { v: tone.pos, bg: 'var(--moss)', label: labels.pos },
    { v: tone.neu, bg: 'var(--amber)', label: labels.neu },
    { v: tone.neg, bg: 'var(--clay)', label: labels.neg }
  ].filter((r) => r.v > 0);

  return (
    <>
      <div className="split">
        <i style={{ width: `${w.pos}%` }} />
        <i style={{ width: `${w.neu}%` }} />
        <i style={{ width: `${w.neg}%` }} />
      </div>
      <ul className="legend">
        {rows.map((r) => (
          <li key={r.label}>
            <span className="sw" style={{ background: r.bg }} />
            {r.label} <b>%{r.v}</b>
          </li>
        ))}
      </ul>
    </>
  );
}
