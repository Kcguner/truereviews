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

export default function AnalyzeFormV3() {
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
    { icon: <LinkIcon />, glow: 'shadow-cyan-500/50', title: t('steps.s1t'), desc: t('steps.s1d') },
    { icon: <GaugeIcon />, glow: 'shadow-violet-500/50', title: t('steps.s2t'), desc: t('steps.s2d') },
    { icon: <MailIcon />, glow: 'shadow-fuchsia-500/50', title: t('steps.s3t'), desc: t('steps.s3d') }
  ];

  const features = [
    { icon: <ZapIcon />, glow: 'shadow-cyan-500/50', title: t('features.f1t'), desc: t('features.f1d') },
    { icon: <QuoteIcon />, glow: 'shadow-violet-500/50', title: t('features.f2t'), desc: t('features.f2d') },
    { icon: <ShieldIcon />, glow: 'shadow-emerald-500/50', title: t('features.f3t'), desc: t('features.f3d') }
  ];

  return (
    <div className="space-y-16">
      {/* ---------- HERO V3: Cyberpunk Lite ---------- */}
      <section className="relative mx-auto max-w-4xl overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 px-8 py-24 text-center shadow-2xl shadow-cyan-500/10">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(6,182,212,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(6,182,212,0.03)_1px,transparent_1px)] bg-[size:40px_40px]"></div>
        <div className="absolute -left-20 -top-20 h-64 w-64 rounded-full bg-cyan-500/20 blur-[100px]"></div>
        <div className="absolute -right-20 -bottom-20 h-64 w-64 rounded-full bg-violet-500/20 blur-[100px]"></div>
        <div className="relative">
          <span className="inline-flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-5 py-2 text-xs font-bold uppercase tracking-widest text-cyan-400 shadow-lg shadow-cyan-500/20">
            <SparkleIcon className="h-4 w-4" />
            {t('hero.badge')}
          </span>
          <h1 className="mt-8 bg-gradient-to-r from-cyan-400 via-violet-400 to-fuchsia-400 bg-clip-text text-5xl font-black leading-tight tracking-tight text-transparent drop-shadow-lg sm:text-7xl">
            {t('hero.title')}
          </h1>
          <p className="mx-auto mt-8 max-w-2xl text-base leading-relaxed text-slate-400 sm:text-lg">
            {t('hero.subtitle')}
          </p>
        </div>
      </section>

      {/* ---------- ANALYZER V3: Neon Input ---------- */}
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/50 p-10 backdrop-blur-xl shadow-2xl shadow-violet-500/10">
        <label htmlFor={inputId} className="flex items-center gap-2 text-sm font-bold uppercase tracking-widest text-cyan-400">
          <LinkIcon className="h-4 w-4" />
          {t('form.urlLabel')}
        </label>
        <div className="relative mt-4">
          <input
            id={inputId}
            className="w-full rounded-xl border border-slate-700 bg-slate-950/80 px-6 py-5 text-slate-100 placeholder:text-slate-500 outline-none transition-all duration-200 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/30"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && url && !loading) analyze();
            }}
            placeholder={t('form.urlPlaceholder')}
            inputMode="url"
            dir="ltr"
          />
          <div className="absolute -inset-0.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 opacity-0 blur transition-opacity duration-300 group-focus-within:opacity-30"></div>
        </div>
        <TurnstileWidget onToken={setTurnstile} />
        <button 
          className="group relative mt-6 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-cyan-600 to-violet-600 px-8 py-5 font-bold text-white shadow-xl shadow-cyan-500/30 transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl hover:shadow-cyan-500/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 disabled:shadow-none" 
          onClick={analyze} 
          disabled={loading || !url.trim()}
        >
          <div className="absolute inset-0 bg-gradient-to-r from-cyan-500 to-violet-500 opacity-0 transition-opacity duration-300 group-hover:opacity-100"></div>
          <span className="relative z-10 flex items-center gap-2">
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
          </span>
        </button>
        {error && !preview && (
          <p role="alert" className="mt-5 flex items-start gap-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm font-medium text-rose-400">
            <AlertIcon className="mt-0.5 h-5 w-5 shrink-0" />
            {error}
          </p>
        )}
      </section>

      {/* ---------- PREVIEW V3: Holographic Card ---------- */}
      {preview && (
        <section className="mx-auto max-w-2xl rounded-2xl border border-slate-800 bg-slate-900/50 p-10 backdrop-blur-xl shadow-2xl shadow-violet-500/10">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold tracking-tight text-white">{t('preview.title')}</h2>
            {mocked && <span className="rounded-md border border-slate-700 bg-slate-800 px-3 py-1 text-xs font-bold uppercase tracking-widest text-slate-400">{t('mock.badge')}</span>}
          </div>
          <p className="mt-2 text-sm text-slate-400">
            {preview.business_name} • {preview.review_count} {t('preview.reviews')}
          </p>

          <div className="mt-8 grid gap-8 rounded-2xl border border-slate-800 bg-slate-950/50 p-8 shadow-inner sm:grid-cols-3">
            <div className="sm:col-span-1">
              <ScoreRing score={preview.score} />
            </div>
            <div className="sm:col-span-2">
              <p className="text-base leading-relaxed text-slate-300">
                {preview.teaser}
              </p>
            </div>
          </div>

          {!emailSent ? (
            <div className="mt-8 rounded-2xl border border-orange-500/30 bg-gradient-to-br from-orange-500/10 to-fuchsia-500/10 p-8 shadow-lg shadow-orange-500/10">
              <h3 className="flex items-center gap-3 text-lg font-bold text-white">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500 to-fuchsia-500 shadow-lg shadow-orange-500/40">
                  <MailIcon className="h-6 w-6 text-white" />
                </span>
                {t('preview.unlockTitle')}
              </h3>
              <p className="mt-3 text-sm text-slate-400">{t('preview.unlockNote')}</p>
              <label htmlFor={emailId} className="mt-5 block text-sm font-bold uppercase tracking-widest text-slate-300">
                {t('lead.emailLabel')}
              </label>
              <input
                id={emailId}
                className="mt-3 w-full rounded-xl border border-slate-700 bg-slate-950/80 px-5 py-4 text-slate-100 placeholder:text-slate-500 outline-none transition-all duration-200 focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30"
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
                className="mt-4 flex w-full items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-orange-600 to-fuchsia-600 px-8 py-4 font-bold text-white shadow-xl shadow-orange-500/30 transition-all duration-200 hover:scale-[1.02] hover:shadow-2xl hover:shadow-orange-500/50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50" 
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
                <p role="alert" className="mt-4 flex items-start gap-2 text-sm font-medium text-rose-400">
                  <AlertIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  {error}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-8 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-6 text-sm text-emerald-400">
              <p className="flex items-start gap-2 font-medium">
                <CheckIcon className="mt-0.5 h-5 w-5 shrink-0" />
                {t('lead.checkEmail')}
              </p>
              {devUrl && (
                <p className="mt-3 break-all">
                  {t('mock.emailNote')}{' '}
                  <a className="font-mono text-emerald-300 underline underline-offset-2" href={devUrl}>
                    {devUrl}
                  </a>
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {/* ---------- STATS V3: Glowing Numbers ---------- */}
      <section className="mx-auto grid max-w-3xl grid-cols-3 gap-5">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-8 text-center backdrop-blur-xl shadow-xl transition-all duration-200 hover:-translate-y-2 hover:shadow-2xl hover:shadow-cyan-500/20"
          >
            <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/5 to-violet-500/5 opacity-0 transition-opacity group-hover:opacity-100"></div>
            <div className="relative">
              <p className="bg-gradient-to-r from-cyan-400 to-violet-400 bg-clip-text text-4xl font-black tabular-nums text-transparent drop-shadow-lg sm:text-5xl">{s.value}</p>
              <p className="mt-3 text-xs font-bold uppercase tracking-widest text-slate-500">{s.label}</p>
            </div>
          </div>
        ))}
      </section>

      {/* ---------- STEPS V3: Neon Process Cards ---------- */}
      <section>
        <h2 className="text-center text-3xl font-black tracking-tight text-white">{t('steps.title')}</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {steps.map((s, i) => (
            <div key={s.title} className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-8 backdrop-blur-xl shadow-xl transition-all duration-200 hover:-translate-y-2 hover:shadow-2xl hover:shadow-cyan-500/20">
              <div className="absolute -right-4 -top-4 text-8xl font-black text-slate-800 transition-colors group-hover:text-slate-700">{i + 1}</div>
              <div className="relative">
                <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-violet-600 text-white shadow-lg shadow-cyan-500/40">{s.icon}</span>
                <h3 className="mt-5 text-xl font-bold text-white">{s.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-400">{s.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ---------- FEATURES V3: Glowing Icons ---------- */}
      <section className="pb-8">
        <h2 className="text-center text-3xl font-black tracking-tight text-white">{t('features.title')}</h2>
        <div className="mt-10 grid gap-6 sm:grid-cols-3">
          {features.map((f, i) => (
            <div key={f.title} className="group relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/50 p-8 backdrop-blur-xl shadow-xl transition-all duration-200 hover:-translate-y-2 hover:shadow-2xl hover:shadow-cyan-500/20">
              <span className="flex h-14 w-14 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-600 to-violet-600 text-white shadow-lg shadow-cyan-500/40">{f.icon}</span>
              <h3 className="mt-5 text-xl font-bold text-white">{f.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-400">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
