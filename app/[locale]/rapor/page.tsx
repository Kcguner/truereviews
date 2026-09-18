'use client';
import { Suspense, useEffect, useState } from 'react';
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

  useEffect(() => {
    if (!token) {
      setState('err');
      return;
    }
    fetch(`/api/verify?token=${encodeURIComponent(token)}`)
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
      .catch(() => setState('err'));
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
