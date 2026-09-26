'use client';
import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    turnstile?: { render: (el: HTMLElement, opts: Record<string, unknown>) => string; reset: (id?: string) => void };
    __turnstileLoaded?: boolean;
  }
}

export default function TurnstileWidget({
  onToken,
  resetKey = 0
}: {
  onToken: (t: string) => void;
  resetKey?: number;
}) {
  const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  // Çağıran satır içi arrow geçebiliyor: efekt yalnızca siteKey'e bağlı
  // kalsın, çağrı anında en güncel onToken kullanılsın.
  const onTokenRef = useRef(onToken);

  useEffect(() => {
    onTokenRef.current = onToken;
  }, [onToken]);

  useEffect(() => {
    if (!siteKey || !ref.current) return; // pasif mod
    const render = () => {
      if (window.turnstile && ref.current && !ref.current.dataset.done) {
        ref.current.dataset.done = '1';
        widgetId.current = window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: (token: string) => onTokenRef.current(token)
        });
      }
    };
    if (window.turnstile) {
      render();
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js';
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [siteKey]);

  // Token tek kullanımlık: başarısız gönderimden sonra yenisi istenir
  // (resetKey çağıran tarafça artırılır, 0 = dokunma).
  useEffect(() => {
    const id = widgetId.current;
    if (!siteKey || !resetKey || !id) return;
    window.turnstile?.reset(id);
  }, [resetKey, siteKey]);

  if (!siteKey) return null;
  return <div ref={ref} className="my-3" />;
}
