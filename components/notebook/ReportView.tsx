'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'next-intl';
import { getConsent } from '@/lib/legal';
import Gauge from './Gauge';
import ToneBar from './ToneBar';
import ThemeRow from './ThemeRow';
import { bandOf, type NbPreview, type NbReport } from './types';

function todayLabel(locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  } catch {
    return new Date().toLocaleDateString();
  }
}

export default function ReportView({
  preview,
  report,
  unlocked,
  email,
  mailSent,
  isMockMail,
  devUrl,
  onUnlock,
  onReset
}: {
  preview: NbPreview;
  report: NbReport | null;
  unlocked: boolean;
  email: string;
  mailSent: boolean;
  isMockMail: boolean;
  devUrl?: string;
  onUnlock: (email: string) => Promise<string | null>;
  onReset: () => void;
}) {
  const t = useTranslations('nb');
  const tRoot = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const [mail, setMail] = useState('');
  const [mailErr, setMailErr] = useState('');
  const [sending, setSending] = useState(false);
  const [agreed, setAgreed] = useState(false);
  const consent = getConsent(locale);

  const score100 = Math.round(preview.score * 10);
  const band = bandOf(score100);
  const full = unlocked && report ? report : null;
  const tone = full?.rating_histogram || preview.tone;
  const maxCount = full
    ? Math.max(
        1,
        ...full.top_praises.map((x) => x.count),
        ...full.top_complaints.map((x) => x.count)
      )
    : 1;

  async function submitMail(e: React.FormEvent) {
    e.preventDefault();
    if (!agreed) {
      setMailErr(consent.error);
      return;
    }
    const v = mail.trim();
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(v)) {
      setMailErr(t('lock.err'));
      return;
    }
    setMailErr('');
    setSending(true);
    const err = await onUnlock(v);
    setSending(false);
    if (err) setMailErr(err);
  }

  return (
    <div className="wrap wrap--report rpt">
      <div className="rpt__nav">
        <button className="linkish" type="button" onClick={onReset}>
          {t('rpt.back')}
        </button>
        <span className={`rpt__stamp${unlocked ? ' is-full' : ''}`}>
          {unlocked ? t('rpt.stamp.full') : t('rpt.stamp.prev')}
        </span>
      </div>

      <header className="rpt__head">
        <p className="eyebrow">
          {t('rpt.date')} · {todayLabel(locale)}
        </p>
        <h1>{preview.business_name}</h1>
        <p className="rpt__sub">Google Maps</p>
        <div className="rpt__chips">
          <span className="chip">{t('rpt.scope', { r: preview.review_count })}</span>
          {unlocked ? (
            <span className="chip chip--ink">{t('rpt.stamp.full')}</span>
          ) : (
            <span className="chip chip--amber">{t('rpt.stamp.prev')}</span>
          )}
        </div>
      </header>

      {/* 01 score */}
      <section className="block">
        <div className="block__h">
          <span className="num">01</span>
          <h3>{t('rpt.score.h')}</h3>
          <span className="rule" />
        </div>
        <div className="score">
          <Gauge score={score100} label={t('rpt.score.cap')} />
          <div className="score__copy">
            <h4>{t(`band.${band}.t`)}</h4>
            <p>{unlocked && full ? full.summary : preview.teaser}</p>
          </div>
        </div>
      </section>

      {/* 02 tone */}
      {tone && (
        <section className="block">
          <div className="block__h">
            <span className="num">02</span>
            <h3>{t('rpt.tone.h')}</h3>
            <span className="rule" />
          </div>
          <ToneBar
            tone={tone}
            labels={{ pos: t('rpt.tone.pos'), neu: t('rpt.tone.neu'), neg: t('rpt.tone.neg') }}
          />
        </section>
      )}

      {/* 03 themes (yalnızca kilit açıldıysa — veri gizliliği) */}
      {full && (
        <section className="block">
          <div className="block__h">
            <span className="num">03</span>
            <h3>{t('rpt.themes.h')}</h3>
            <span className="rule" />
          </div>
          <div className="subh subh--pos">
            <span className="sw" />
            {t('rpt.praise')}
            <span className="rule" />
          </div>
          <ul>
            {full.top_praises.map((it, i) => (
              <ThemeRow
                key={i}
                item={it}
                max={maxCount}
                kind="pos"
                inreviewLabel={t('rpt.inreview')}
                origLabel={t('rpt.orig')}
              />
            ))}
          </ul>
          <div className="subh subh--neg">
            <span className="sw" />
            {t('rpt.complaint')}
            <span className="rule" />
          </div>
          <ul>
            {full.top_complaints.map((it, i) => (
              <ThemeRow
                key={i}
                item={it}
                max={maxCount}
                kind="neg"
                inreviewLabel={t('rpt.inreview')}
                origLabel={t('rpt.orig')}
              />
            ))}
          </ul>
        </section>
      )}

      {/* lockwall */}
      {!unlocked && !mailSent && (
        <div className="lockwall">
          <div className="lockwall__body">
            <div className="lock-ico">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none" aria-hidden="true">
                <rect x="4" y="9.5" width="14" height="9.5" rx="1.6" stroke="currentColor" strokeWidth="1.9" />
                <path d="M7.4 9.5V6.8a4.6 4.6 0 019.2 0v2.7" stroke="currentColor" strokeWidth="1.9" />
              </svg>
            </div>
            <h3>{t('lock.h')}</h3>
            <p>{t('lock.p')}</p>
            <form className="mailform" onSubmit={submitMail} noValidate>
              <input
                type="email"
                value={mail}
                onChange={(e) => setMail(e.target.value)}
                placeholder={t('lock.ph')}
                autoComplete="email"
                aria-label={t('lock.ph')}
                dir="ltr"
              />
              <button className="btn btn--primary btn--big" type="submit" disabled={sending || !mail.trim()}>
                {t('lock.cta')}
              </button>
            </form>
            <label className="mailnote" style={{ display: 'flex', gap: 8, cursor: 'pointer', marginTop: 10 }}>
              <input
                type="checkbox"
                checked={agreed}
                onChange={(e) => {
                  setAgreed(e.target.checked);
                  if (mailErr) setMailErr('');
                }}
                style={{ marginTop: 4 }}
              />
              <span>
                {consent.label}{' '}
                <a className="linkish" href={`/${locale}/kvkk`}>
                  {consent.link}
                </a>
              </span>
            </label>
            {mailErr && (
              <p className="mailerr" role="alert">
                {mailErr}
              </p>
            )}
            <p className="mailnote">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flex: 'none', marginTop: 4 }} aria-hidden="true">
                <path
                  d="M7 1.2l5 2.2v3.4c0 3-2.1 5.3-5 6-2.9-.7-5-3-5-6V3.4z"
                  stroke="currentColor"
                  strokeWidth="1.3"
                  strokeLinejoin="round"
                />
              </svg>
              {t('lock.note')}
            </p>
          </div>
        </div>
      )}

      {mailSent && !unlocked && (
        <div className="maildone">
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none" style={{ flex: 'none', marginTop: 2 }} aria-hidden="true">
            <circle cx="11" cy="11" r="9.4" stroke="var(--moss)" strokeWidth="1.9" />
            <path d="M6.6 11.3l3 3 5.8-6.4" stroke="var(--moss)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <strong>{t('lock.done')}</strong>
            <p>{t(isMockMail ? 'lock.donetMock' : 'lock.donet', { e: email })}</p>
            {devUrl && (
              <p style={{ marginTop: 8, wordBreak: 'break-all' }}>
                {tRoot('mock.emailNote')}{' '}
                <a href={devUrl} style={{ fontFamily: 'var(--font-mono)', textDecoration: 'underline' }}>
                  {devUrl}
                </a>
              </p>
            )}
          </div>
        </div>
      )}

      {/* 04 action */}
      {full && (
        <section className="block">
          <div className="block__h">
            <span className="num">04</span>
            <h3>{t('act.k')}</h3>
            <span className="rule" />
          </div>
          <div className="action">
            <span className="action__tag">01</span>
            <p className="action__k">{t('act.k')}</p>
            <h3>{full.action_suggestion}</h3>
          </div>
        </section>
      )}

      {/* actions */}
      {full && (
        <div className="rpt__acts">
          <button className="btn" type="button" onClick={() => window.print()}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M8 1.8v8.4M4.8 7.2L8 10.4l3.2-3.2M2.4 13.4h11.2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {t('rpt.pdf')}
          </button>
          <button className="btn btn--primary" type="button" onClick={() => router.push(`/${locale}`)}>
            {t('rpt.new')}
          </button>
        </div>
      )}

      <div className="method">
        <b>{t('method.h')}</b>
        {t('method.t')}
      </div>
    </div>
  );
}
