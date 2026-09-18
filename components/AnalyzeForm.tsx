'use client';
import { useState } from 'react';
import { useTranslations, useLocale } from 'next-intl';
import TurnstileWidget from './TurnstileWidget';
import ScoreRing from './ScoreRing';
import {
  SparkleIcon,
  LinkIcon,
  GaugeIcon,
  MailIcon,
  CheckIcon,
  AlertIcon,
  ArrowRightIcon,
  ShieldIcon,
  ZapIcon,
  QuoteIcon,
  SpinnerIcon
} from './Icons';

interface Preview {
  score: number;
  teaser: string;
  business_name: string;
  review_count: number;
}

const inputId = 'maps-url';
const emailId = 'lead-email';

export default function AnalyzeForm() {
  const t = useTranslations();
  const locale = useLocale();
  const [url, setUrl] = useState('');
  const [email, setEmail] = useState('');
  const [turnstile, setTurnstile] = useState('');
  const [loading, setLoading] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [reportId, setReportId] = useState('');
  const [mocked, setMocked] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [devUrl, setDevUrl] = useState('');

  async function analyze() {
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ placeUrl: url, locale, turnstileToken: turnstile })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || 'Hata');
        return;
      }
      setPreview(data.preview);
      setReportId(data.reportId);
      setMocked(Boolean(data.mocked));
      setEmailSent(false);
      setDevUrl('');
    } catch {
      setError('Bağlantı hatası');
    } finally {
      setLoading(false);
    }
  }

  async function submitEmail() {
    setError('');
    setLeadLoading(true);
    try {
      const res = await fetch('/api/lead', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reportId, email, locale, turnstileToken: turnstile })
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.message || data.error || 'Hata');
        return;
      }
      setEmailSent(true);
      if (data.devPreviewUrl) setDevUrl(data.devPreviewUrl);
    } catch {
      setError('Bağlantı hatası');
    } finally {
      setLeadLoading(false);
    }
  }

  const stats = [
    { value: '20', label: t('stats.reviews') },
    { value: '10', label: t('stats.langs') },
    { value: '0 TL', label: t('stats.free') }
  ];

  const steps = [
    { icon: <LinkIcon />, bg: 'from-blue-600 to-indigo-600', title: t('steps.s1t'), desc: t('steps.s1d') },
    { icon: <GaugeIcon />, bg: 'from-violet-600 to-purple-600', title: t('steps.s2t'), desc: t('steps.s2d') },
    { icon: <MailIcon />, bg: 'from-orange-500 to-amber-500', title: t('steps.s3t'), desc: t('steps.s3d') }
  ];

  const features = [
    { icon: <ZapIcon />, bg: 'from-blue-600 to-cyan-500', title: t('features.f1t'), desc: t('features.f1d') },
    { icon: <QuoteIcon />, bg: 'from-violet-600 to-fuchsia-500', title: t('features.f2t'), desc: t('features.f2d') },
    { icon: <ShieldIcon />, bg: 'from-emerald-500 to-teal-500', title: t('features.f3t'), desc: t('features.f3d') }
  ];

  return (
    <div className="space-y-10">
      {/* ---------- HERO ---------- */}
      <section className="animate-fade-up mx-auto max-w-2xl pt-6 text-center">
        <span className="badge !px-4 !py-1.5 !text-[13px]">
          <SparkleIcon className="h-3.5 w-3.5" />
          {t('hero.badge')}
        </span>
        <h1 className="gradient-text mt-4 text-4xl font-black leading-tight tracking-tight sm:text-5xl">
          {t('hero.title')}
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-[15px] leading-relaxed text-slate-600 dark:text-slate-400 sm:text-base">
          {t('hero.subtitle')}
        </p>
      </section>

      {/* ---------- ANALYZER ---------- */}
      <section className="card animate-fade-up mx-auto max-w-2xl !p-6 sm:!p-8" style={{ animationDelay: '90ms' }}>
        <label htmlFor={inputId} className="flex items-center gap-2 text-sm font-bold">
          <LinkIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          {t('form.urlLabel')}
        </label>
        <div className="relative mt-2">
          <input
            id={inputId}
            className="input pe-4 ps-4"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url && !loading) analyze();
            }}
            placeholder={t('form.urlPlaceholder')}
            inputMode="url"
            dir="ltr"
          />
        </div>
        <TurnstileWidget onToken={setTurnstile} />
        <button className="btn-primary mt-3 w-full !py-3.5 text-[15px]" onClick={analyze} disabled={loading || !url.trim()}>
          {loading ? (
            <>
              <SpinnerIcon />
              {t('form.analyzing')}
            </>
          ) : (
            <>
              {t('form.submit')}
              <ArrowRightIcon className="h-4 w-4 rtl:rotate-180" />
            </>
          )}
        </button>
        {error && !preview && (
          <p role="alert" className="mt-3 flex items-start gap-2 rounded-2xl bg-rose-50 p-3 text-sm font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
            {error}
          </p>
        )}
      </section>

      {/* ---------- PREVIEW ---------- */}
      {preview && (
        <section className="card animate-fade-up mx-auto max-w-2xl !p-6 sm:!p-8">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-extrabold tracking-tight">{t('preview.title')}</h2>
            {mocked && <span className="badge-neutral">{t('mock.badge')}</span>}
          </div>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {preview.business_name} • {preview.review_count} {t('preview.reviews')}
          </p>

          <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
            <ScoreRing score={preview.score} />
            <p className="text-center text-[15px] leading-relaxed text-slate-700 dark:text-slate-300 sm:text-start">
              {preview.teaser}
            </p>
          </div>

          {!emailSent ? (
            <div className="mt-6 rounded-2xl border border-orange-200/70 bg-gradient-to-b from-orange-50 to-amber-50/50 p-5 dark:border-orange-500/20 dark:from-orange-500/[0.07] dark:to-amber-500/[0.03]">
              <h3 className="flex items-center gap-2 font-extrabold">
                <span className="icon-tile h-8 w-8 !rounded-xl bg-gradient-to-br from-orange-500 to-amber-500 !shadow-glow-accent">
                  <MailIcon className="h-4 w-4" />
                </span>
                {t('preview.unlockTitle')}
              </h3>
              <p className="mt-1.5 text-sm text-slate-600 dark:text-slate-400">{t('preview.unlockNote')}</p>
              <label htmlFor={emailId} className="mt-4 block text-sm font-bold">
                {t('lead.emailLabel')}
              </label>
              <input
                id={emailId}
                className="input mt-1.5"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && email && !leadLoading) submitEmail();
                }}
                placeholder={t('lead.emailPlaceholder')}
                inputMode="email"
                dir="ltr"
              />
              <button className="btn-accent mt-3 w-full" onClick={submitEmail} disabled={leadLoading || !email.trim()}>
                {leadLoading ? (
                  <>
                    <SpinnerIcon />
                    {t('lead.sending')}
                  </>
                ) : (
                  <>
                    {t('lead.submit')}
                    <ArrowRightIcon className="h-4 w-4 rtl:rotate-180" />
                  </>
                )}
              </button>
              {error && (
                <p role="alert" className="mt-2.5 flex items-start gap-2 text-sm font-medium text-rose-600 dark:text-rose-300">
                  <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-2xl border border-emerald-200/70 bg-emerald-50 p-5 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/[0.07] dark:text-emerald-200">
              <p className="flex items-start gap-2 font-medium">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0" />
                {t('lead.checkEmail')}
              </p>
              {devUrl && (
                <p className="mt-2 break-all">
                  {t('mock.emailNote')}{' '}
                  <a className="font-mono underline underline-offset-2" href={devUrl}>
                    {devUrl}
                  </a>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* ---------- STATS ---------- */}
      <section className="mx-auto grid max-w-2xl grid-cols-3 gap-3">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="card card-hover animate-fade-up !p-4 text-center"
            style={{ animationDelay: `${140 + i * 70}ms` }}
          >
            <p className="gradient-text text-2xl font-black tabular-nums sm:text-3xl">{s.value}</p>
            <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</p>
          </div>
        ))}
      </section>

      {/* ---------- STEPS ---------- */}
      <section className="mx-auto max-w-3xl">
        <h2 className="text-center text-xl font-extrabold tracking-tight sm:text-2xl">{t('steps.title')}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="card card-hover animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center gap-3">
                <span className={`icon-tile bg-gradient-to-br ${s.bg}`}>{s.icon}</span>
                <span className="text-xs font-black text-slate-300 dark:text-slate-600">0{i + 1}</span>
              </div>
              <h3 className="mt-3 font-extrabold">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- FEATURES ---------- */}
      <section className="mx-auto max-w-3xl pb-4">
        <h2 className="text-center text-xl font-extrabold tracking-tight sm:text-2xl">{t('features.title')}</h2>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          {features.map((f, i) => (
            <div key={f.title} className="card card-hover animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
              <span className={`icon-tile bg-gradient-to-br ${f.bg}`}>{f.icon}</span>
              <h3 className="mt-3 font-extrabold">{f.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
