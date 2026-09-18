'use client';
import type { NbTheme } from './types';

export default function ThemeRow({
  item,
  max,
  kind,
  inreviewLabel,
  origLabel
}: {
  item: NbTheme;
  max: number;
  kind: 'pos' | 'neg';
  inreviewLabel: string;
  origLabel: string;
}) {
  const pct = Math.max(6, Math.round((item.count / Math.max(max, 1)) * 100));
  return (
    <li className={`theme theme--${kind}`}>
      <div className="theme__top">
        <span className="theme__t">{item.topic}</span>
        <span className="theme__c">
          <b>{item.count}</b> {inreviewLabel}
        </span>
      </div>
      <div className="theme__meter">
        <i style={{ width: `${pct}%` }} />
      </div>
      {item.example && (
        <blockquote className="theme__q">
          “{item.example}”<footer>{origLabel}</footer>
        </blockquote>
      )}
    </li>
  );
}
