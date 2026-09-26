'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import ReportView from '@/components/notebook/ReportView';
import type { NbPreview, NbReport } from '@/components/notebook/types';

function ReportContent() {
  const t = useTranslations('report');
  const locale = useLocale();
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading');
  const [preview, setPreview] = useState<NbPreview | null>(null);
  const [report, setReport] = useState<NbReport | null>(null);
  const [email, setEmail] = useState('');
  // `reactStrictMode: true` altında efekt mount sonrası iki kez koşar
  // (unmount → mount). `abort` ilk isteği gerçekten DURDURMAZ — o istek
  // sunucuya çoktan ulaştı ve `upsertLead` çalıştı; asıl koruma aynı token
  // için ikinci isteği hiç açmamak. Ref StrictMode'un çift mount'unda da
  // yaşar, gerçek gezinmede (yeni bileşen örneği) sıfırlanır.
  const inflight = useRef<{
    token: string;
    ac: AbortController;
    timer: ReturnType<typeof setTimeout> | null;
  } | null>(null);

  useEffect(() => {
    if (!token) {
      setState('err');
      return;
    }

    let entry = inflight.current;
    if (!entry || entry.token !== token) {
      // İlk (veya yeni token) koşu: isteği bir kez aç.
      const ac = new AbortController();
      entry = { token, ac, timer: null };
      inflight.current = entry;

      fetch(`/api/verify?token=${encodeURIComponent(token)}`, { signal: ac.signal })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw new Error(d.message || d.error);
          setReport(d.report);
          setEmail(d.email || '');
          setPreview({
            score: Number(d.report.score),
            teaser: String(d.report.summary).split('.').slice(0, 1).join('.') + '.',
            business_name: d.businessName || d.report.business_name,
            review_count: d.reviewCount ?? d.report.review_count,
            tone: d.report.rating_histogram
          });
          setState('ok');
        })
        .catch((e) => {
          // Abort bir hata değil: bileşen uçtu ya da token değişti.
          if (e instanceof DOMException && e.name === 'AbortError') return;
          setState('err');
        });
    } else if (entry.timer) {
      // StrictMode'un ikinci koşuşu: istek zaten uçuşta, sadece bir sonraki
      // macraya ertelenmiş iptali geri al.
      clearTimeout(entry.timer);
      entry.timer = null;
    }

    const current = entry;
    return () => {
      // Bileşenin GERÇEKTEN uçtuğu ile StrictMode'un sahte (unmount → mount)
      // koşusunu cleanup tek başına ayırt edemiyor. Bu yüzden iptali bir
      // sonraki macraya erteliyoruz: aynı token için efekt yeniden koşarsa
      // (StrictMode) yukarıda bu zamanlayıcı iptal edilir ve istek yaşamaya
      // devam eder; gerçek uçmada ise macera gelir ve istek iptal edilir.
      // Her koşu cleanup döndürür — StrictMode'un ikinci koşusu da döndürüyor,
      // yoksa gerçek uçmada iptal edilecek bir şey kalmazdı.
      current.timer = setTimeout(() => {
        current.timer = null;
        current.ac.abort();
      }, 0);
    };
  }, [token]);

  if (state === 'loading') {
    return (
      <section className="screen">
        <div className="wrap">
          <div className="load">
            <div className="load__card">
              <div className="load__top">
                <div className="load__biz">
                  <h2>{t('loading')}</h2>
                </div>
              </div>
              <div className="load__track">
                <div className="load__fill" style={{ width: '55%' }} />
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (state === 'err' || !report || !preview) {
    return (
      <section className="screen">
        <div className="wrap wrap--report rpt">
          <div className="lockwall">
            <div className="lockwall__body">
              <p style={{ color: 'var(--clay)', fontWeight: 700 }}>{t('invalid')}</p>
              <div style={{ marginTop: 16 }}>
                <a className="btn btn--primary" href={`/${locale}`}>
                  ←
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="screen">
      <ReportView
        preview={preview}
        report={report}
        unlocked
        email={email}
        mailSent={false}
        isMockMail={false}
        onUnlock={async () => null}
        onReset={() => (window.location.href = `/${locale}`)}
      />
    </section>
  );
}

export default function ReportPage() {
  return (
    <Suspense
      fallback={
        <section className="screen">
          <div className="wrap">
            <div className="load">
              <div className="load__card">…</div>
            </div>
          </div>
        </section>
      }
    >
      <ReportContent />
    </Suspense>
  );
}
