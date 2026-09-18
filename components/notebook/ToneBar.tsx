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

  return (
    <>
      <div className="split">
        <i style={{ width: `${w.pos}%` }} />
        <i style={{ width: `${w.neu}%` }} />
        <i style={{ width: `${w.neg}%` }} />
      </div>
      <ul className="legend">
        <li>
          <span className="sw" style={{ background: 'var(--moss)' }} />
          {labels.pos} <b>%{tone.pos}</b>
        </li>
        <li>
          <span className="sw" style={{ background: 'var(--amber)' }} />
          {labels.neu} <b>%{tone.neu}</b>
        </li>
        <li>
          <span className="sw" style={{ background: 'var(--clay)' }} />
          {labels.neg} <b>%{tone.neg}</b>
        </li>
      </ul>
    </>
  );
}
