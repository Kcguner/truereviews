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

export default function AnalyzeFormV2() {
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
    { icon: <LinkIcon />, bg: 'from-pink-400 to-rose-400', title: t('steps.s1t'), desc: t('steps.s1d') },
    { icon: <GaugeIcon />, bg: 'from-violet-400 to-purple-400', title: t('steps.s2t'), desc: t('steps.s2d') },
    { icon: <MailIcon />, bg: 'from-amber-400 to-orange-400', title: t('steps.s3t'), desc: t('steps.s3d') }
  ];

  const features = [
    { icon: <ZapIcon />, bg: 'from-sky-400 to-cyan-400', title: t('features.f1t'), desc: t('features.f1d') },
    { icon: <QuoteIcon />, bg: 'from-fuchsia-400 to-pink-400', title: t('features.f2t'), desc: t('features.f2d') },
    { icon: <ShieldIcon />, bg: 'from-emerald-400 to-teal-400', title: t('features.f3t'), desc: t('features.f3d') }
  ];

  return (
    <div className="space-y-16">
      {/* ---------- HERO V2: Playful & Friendly ---------- */}
      <section className="relative mx-auto max-w-3xl rounded-[2rem] bg-gradient-to-br from-pink-50 via-rose-50 to-orange-50 px-8 py-20 text-center dark:from-pink-950/30 dark:via-rose-950/30 dark:to-orange-950/30">
        <div className="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-pink-300/30 blur-3xl dark:bg-pink-700/20"></div>
        <div className="absolute -right-10 -bottom-10 h-32 w-32 rounded-full bg-orange-300/30 blur-3xl dark:bg-orange-700/20"></div>
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border-2 border-pink-300 bg-white px-5 py-2 text-sm font-bold text-pink-600 shadow-md dark:border-pink-700 dark:bg-slate-900 dark:text-pink-400">
            <SparkleIcon className="h-4 w-4" />
            {t('hero.badge')}
          </span>
          <h1 className="mt-6 text-5xl font-black leading-tight text-slate-800 dark:text-slate-100 sm:text-6xl">
            {t('hero.title')}
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-slate-600 dark:text-slate-300 sm:text-xl">
            {t('hero.subtitle')}
          </p>
        </div>
      </section>

      {/* ---------- ANALYZER V2: Rounded Friendly Input ---------- */}
      <section className="mx-auto max-w-2xl rounded-[2rem] border-2 border-slate-200 bg-white p-10 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
        <label htmlFor={inputId} className="flex items-center justify-center gap-2 text-base font-bold text-slate-700 dark:text-slate-300">
          <LinkIcon className="h-5 w-5 text-pink-500" />
          {t('form.urlLabel')}
        </label>
        <div className="relative mt-4">
          <input
            id={inputId}
            className="w-full rounded-[1.25rem] border-2 border-slate-200 bg-slate-50 px-6 py-5 text-lg text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-pink-400 focus:bg-white focus:ring-4 focus:ring-pink-400/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-pink-400"
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
        <button 
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-[1.25rem] bg-gradient-to-r from-pink-500 to-rose-500 px-8 py-5 text-lg font-bold text-white shadow-xl shadow-pink-500/30 transition-all duration-200 hover:scale-[1.03] hover:shadow-2xl hover:shadow-pink-500/40 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none" 
          onClick={analyze} 
          disabled={loading || !url.trim()}
        >
          {loading ? (
            <>
              <SpinnerIcon />
              {t('form.analyzing')}
            </>
          ) : (
            <>
              {t('form.submit')}
              <ArrowRightIcon className="h-5 w-5 rtl:rotate-180" />
            </>
          )}
        </button>
        {error && !preview && (
          <p role="alert" className="mt-5 flex items-start gap-3 rounded-2xl bg-rose-100 p-5 text-sm font-semibold text-rose-700 dark:bg-rose-500/20 dark:text-rose-300">
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
            {error}
          </p>
        )}
      </section>

      {/* ---------- PREVIEW V2: Soft Card Style ---------- */}
      {preview && (
        <section className="mx-auto max-w-2xl rounded-[2rem] border-2 border-slate-200 bg-white p-10 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
          <div className="flex items-center justify-center gap-3">
            <h2 className="text-2xl font-black text-slate-800 dark:text-white">{t('preview.title')}</h2>
            {mocked && <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t('mock.badge')}</span>}
          </div>
          <p className="mt-2 text-center text-sm font-medium text-slate-500 dark:text-slate-400">
            {preview.business_name} • {preview.review_count} {t('preview.reviews')}
          </p>

          <div className="mt-8 flex flex-col items-center gap-6 rounded-[1.5rem] bg-gradient-to-br from-pink-50 to-rose-50 p-8 dark:from-pink-950/20 dark:to-rose-950/20">
            <ScoreRing score={preview.score} />
            <p className="text-center text-base leading-relaxed text-slate-700 dark:text-slate-300">
              {preview.teaser}
            </p>
          </div>

          {!emailSent ? (
            <div className="mt-8 rounded-[1.5rem] border-2 border-orange-300 bg-gradient-to-br from-orange-100 to-amber-100 p-8 dark:border-orange-600 dark:from-orange-900/30 dark:to-amber-900/30">
              <h3 className="flex items-center justify-center gap-3 text-xl font-black text-slate-800 dark:text-white">
                <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-amber-400 shadow-lg shadow-orange-400/40">
                  <MailIcon className="h-6 w-6 text-white" />
                </span>
                {t('preview.unlockTitle')}
              </h3>
              <p className="mt-3 text-center text-sm font-medium text-slate-600 dark:text-slate-400">{t('preview.unlockNote')}</p>
              <label htmlFor={emailId} className="mt-6 block text-center text-sm font-bold text-slate-700 dark:text-slate-300">
                {t('lead.emailLabel')}
              </label>
              <input
                id={emailId}
                className="mt-3 w-full rounded-2xl border-2 border-slate-200 bg-white px-5 py-4 text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-orange-400 focus:ring-4 focus:ring-orange-400/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && email && !leadLoading) submitEmail();
                }}
                placeholder={t('lead.emailPlaceholder')}
                inputMode="email"
                dir="ltr"
              />
              <button 
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-orange-400 to-amber-400 px-8 py-4 text-lg font-bold text-white shadow-xl shadow-orange-400/30 transition-all duration-200 hover:scale-[1.03] hover:shadow-2xl hover:shadow-orange-400/40 active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50" 
                onClick={submitEmail} 
                disabled={leadLoading || !email.trim()}
              >
                {leadLoading ? (
                  <>
                    <SpinnerIcon />
                    {t('lead.sending')}
                  </>
                ) : (
                  <>
                    {t('lead.submit')}
                    <ArrowRightIcon className="h-5 w-5 rtl:rotate-180" />
                  </>
                )}
              </button>
              {error && (
                <p role="alert" className="mt-4 flex items-start gap-2 text-sm font-semibold text-rose-600 dark:text-rose-300">
                  <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-8 rounded-[1.5rem] border-2 border-emerald-300 bg-emerald-100 p-6 text-sm font-medium text-emerald-900 dark:border-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-200">
              <p className="flex items-center justify-center gap-2">
                <CheckIcon className="h-5 w-5 shrink-0" />
                {t('lead.checkEmail')}
              </p>
              {devUrl && (
                <p className="mt-3 break-all text-center">
                  {t('mock.emailNote')}{' '}
                  <a className="font-mono font-bold text-emerald-700 underline underline-offset-2 dark:text-emerald-300" href={devUrl}>
                    {devUrl}
                  </a>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* ---------- STATS V2: Pill-shaped Cards ---------- */}
      <section className="mx-auto grid max-w-3xl grid-cols-3 gap-5">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="rounded-[2rem] border-2 border-slate-200 bg-white p-6 text-center shadow-xl transition-all duration-200 hover:-translate-y-2 hover:shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          >
            <p className="bg-gradient-to-r from-pink-500 to-rose-500 bg-clip-text text-4xl font-black tabular-nums text-transparent sm:text-5xl">{s.value}</p>
            <p className="mt-2 text-xs font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">{s.label}</p>
          </div>
        ))}
      </section>

      {/* ---------- STEPS V2: Colorful Steps ---------- */}
      <section className="mx-auto max-w-4xl">
        <h2 className="text-center text-3xl font-black text-slate-800 dark:text-white">{t('steps.title')}</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="group relative overflow-hidden rounded-[2rem] border-2 border-slate-200 bg-white p-8 shadow-xl transition-all duration-200 hover:-translate-y-2 hover:shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <div className="absolute -right-6 -top-6 text-9xl font-black text-slate-50 transition-colors group-hover:text-pink-100 dark:group-hover:text-slate-800">{i + 1}</div>
              <div className="relative">
                <span className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${s.bg} text-white shadow-lg shadow-pink-500/30`}>{s.icon}</span>
                <h3 className="mt-5 text-xl font-black text-slate-800 dark:text-white">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- FEATURES V2: Playful Icons ---------- */}
      <section className="mx-auto max-w-4xl pb-8">
        <h2 className="text-center text-3xl font-black text-slate-800 dark:text-white">{t('features.title')}</h2>
        <div className="mt-8 grid gap-5 sm:grid-cols-3">
          {features.map((f, i) => (
            <div key={f.title} className="rounded-[2rem] border-2 border-slate-200 bg-white p-8 shadow-xl transition-all duration-200 hover:-translate-y-2 hover:shadow-2xl dark:border-slate-700 dark:bg-slate-900">
              <span className={`flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br ${f.bg} text-white shadow-lg shadow-pink-500/30`}>{f.icon}</span>
              <h3 className="mt-5 text-xl font-black text-slate-800 dark:text-white">{f.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
