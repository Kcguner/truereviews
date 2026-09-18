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

export default function AnalyzeFormV1() {
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
    <div className="space-y-12">
      {/* ---------- HERO V1: Modern SaaS Dashboard ---------- */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 px-6 py-16 text-center shadow-2xl dark:from-slate-950 dark:via-slate-900 dark:to-slate-950">
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI2MCIgaGVpZ2h0PSI2MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAxMCAwIEwgMCAwIDAgMTAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-20"></div>
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-1.5 text-xs font-semibold text-blue-300 backdrop-blur-sm">
            <SparkleIcon className="h-3.5 w-3.5" />
            {t('hero.badge')}
          </span>
          <h1 className="mt-6 bg-gradient-to-r from-white via-blue-100 to-indigo-200 bg-clip-text text-5xl font-black leading-tight tracking-tight text-transparent sm:text-6xl">
            {t('hero.title')}
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            {t('hero.subtitle')}
          </p>
        </div>
      </section>

      {/* ---------- ANALYZER V1: Clean Input Card ---------- */}
      <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900/50">
        <label htmlFor={inputId} className="flex items-center gap-2 text-sm font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          <LinkIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
          {t('form.urlLabel')}
        </label>
        <div className="relative mt-3">
          <input
            id={inputId}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-5 py-4 text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-blue-500 focus:bg-white focus:ring-4 focus:ring-blue-500/10 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-blue-400"
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
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-4 font-semibold text-white shadow-lg shadow-blue-500/25 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:shadow-blue-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none" 
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
          <p role="alert" className="mt-4 flex items-start gap-3 rounded-xl bg-rose-50 p-4 text-sm font-medium text-rose-700 dark:bg-rose-500/10 dark:text-rose-300">
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
            {error}
          </p>
        )}
      </section>

      {/* ---------- PREVIEW V1: Professional Dashboard Style ---------- */}
      {preview && (
        <section className="rounded-2xl border border-slate-200 bg-white p-8 shadow-xl dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-slate-900 dark:text-white">{t('preview.title')}</h2>
            {mocked && <span className="rounded-md bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">{t('mock.badge')}</span>}
          </div>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {preview.business_name} • {preview.review_count} {t('preview.reviews')}
          </p>

          <div className="mt-6 grid gap-6 rounded-xl bg-slate-50 p-6 dark:bg-slate-800/30 sm:grid-cols-3">
            <div className="sm:col-span-1">
              <ScoreRing score={preview.score} />
            </div>
            <div className="sm:col-span-2">
              <p className="text-base leading-relaxed text-slate-700 dark:text-slate-300">
                {preview.teaser}
              </p>
            </div>
          </div>

          {!emailSent ? (
            <div className="mt-6 rounded-xl border border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 p-6 dark:border-orange-500/20 dark:from-orange-500/[0.07] dark:to-amber-500/[0.03]">
              <h3 className="flex items-center gap-3 text-lg font-bold text-slate-900 dark:text-white">
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-orange-500 to-amber-500 shadow-lg shadow-orange-500/25">
                  <MailIcon className="h-5 w-5 text-white" />
                </span>
                {t('preview.unlockTitle')}
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">{t('preview.unlockNote')}</p>
              <label htmlFor={emailId} className="mt-4 block text-sm font-bold text-slate-700 dark:text-slate-300">
                {t('lead.emailLabel')}
              </label>
              <input
                id={emailId}
                className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-4 py-3 text-slate-900 placeholder:text-slate-400 outline-none transition-all duration-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
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
                className="mt-3 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-orange-500 to-amber-500 px-6 py-3.5 font-semibold text-white shadow-lg shadow-orange-500/25 transition-all duration-200 hover:scale-[1.02] hover:shadow-xl hover:shadow-orange-500/30 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50" 
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
                    <ArrowRightIcon className="h-4 w-4 rtl:rotate-180" />
                  </>
                )}
              </button>
              {error && (
                <p role="alert" className="mt-3 flex items-start gap-2 text-sm font-medium text-rose-600 dark:text-rose-300">
                  <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-5 text-sm text-emerald-900 dark:border-emerald-500/20 dark:bg-emerald-500/[0.07] dark:text-emerald-200">
              <p className="flex items-start gap-2 font-medium">
                <CheckIcon className="mt-0.5 h-5 w-5 shrink-0" />
                {t('lead.checkEmail')}
              </p>
              {devUrl && (
                <p className="mt-2 break-all">
                  {t('mock.emailNote')}{' '}
                  <a className="font-mono text-emerald-700 underline underline-offset-2 dark:text-emerald-300" href={devUrl}>
                    {devUrl}
                  </a>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* ---------- STATS V1: Minimal Cards ---------- */}
      <section className="grid grid-cols-3 gap-4">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/50"
          >
            <p className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-3xl font-black tabular-nums text-transparent sm:text-4xl">{s.value}</p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{s.label}</p>
          </div>
        ))}
      </section>

      {/* ---------- STEPS V1: Numbered Process ---------- */}
      <section>
        <h2 className="text-center text-2xl font-bold text-slate-900 dark:text-white">{t('steps.title')}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/50">
              <div className="absolute -right-4 -top-4 text-8xl font-black text-slate-100 transition-colors group-hover:text-blue-50 dark:group-hover:text-slate-800">{i + 1}</div>
              <div className="relative">
                <span className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${s.bg} text-white shadow-lg`}>{s.icon}</span>
                <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">{s.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- FEATURES V1: Icon Grid ---------- */}
      <section>
        <h2 className="text-center text-2xl font-bold text-slate-900 dark:text-white">{t('features.title')}</h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-3">
          {features.map((f, i) => (
            <div key={f.title} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-xl dark:border-slate-800 dark:bg-slate-900/50">
              <span className={`flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br ${f.bg} text-white shadow-lg`}>{f.icon}</span>
              <h3 className="mt-4 text-lg font-bold text-slate-900 dark:text-white">{f.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
