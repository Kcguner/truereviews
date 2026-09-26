'use client';
import { useEffect, useRef, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { locales, localeNames } from '@/i18n.config';

export default function LangMenu({ current }: { current: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  // `role="menu"` sözleşmesi: menü açıkken klavyeyle çıkış yolu olmalı.
  // Açılışta odağı ilk menü öğesine taşı, Escape'te kapatıp odağı açan
  // düğmeye geri ver. Menü kapalıyken listener hiç bağlanmaz (layout'da her
  // sayfada render ediliyor, global Escape yakalamak yanlış olurdu).
  useEffect(() => {
    if (!open) return;
    ref.current
      ?.querySelector<HTMLButtonElement>('[role="menuitem"]')
      ?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      btnRef.current?.focus();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="lang" ref={ref} data-open={open}>
      <button
        type="button"
        ref={btnRef}
        className="lang__btn"
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M1.4 8h13.2M8 1.4c1.9 2 2.9 4.2 2.9 6.6S9.9 12.6 8 14.6C6.1 12.6 5.1 10.4 5.1 8S6.1 3.4 8 1.4z"
            stroke="currentColor"
            strokeWidth="1.3"
          />
        </svg>
        <span>{localeNames[current as keyof typeof localeNames] || current}</span>
        <svg className="cv" width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M1 3l4 4 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
      {open && (
        <ul className="lang__menu" role="menu">
          {locales.map((l) => (
            <li key={l} role="none">
              <button
                type="button"
                role="menuitem"
                className="lang__item"
                aria-current={l === current}
                onClick={() => {
                  const parts = pathname.split('/');
                  parts[1] = l;
                  router.push(parts.join('/') || `/${l}`);
                  setOpen(false);
                }}
              >
                <span>{localeNames[l]}</span>
                <small>{l.toUpperCase()}</small>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
