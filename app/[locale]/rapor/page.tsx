'use client';
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import ScoreRing from '@/components/ScoreRing';
import { CheckIcon, AlertIcon, QuoteIcon, ZapIcon } from '@/components/Icons';

interface FullReport {
  score: number;
  summary: string;
  top_complaints: { topic: string; count: number; example?: string }[];
  top_praises: { topic: string; count: number; example?: string }[];
  action_suggestion: string;
  review_count: number;
  business_name: string;
}

function LoadingSkeleton() {
  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="card flex items-center gap-5">
        <div className="skeleton h-32 w-32 !rounded-full" />
        <div className="flex-1 space-y-2">
          <div className="skeleton h-5 w-2/3" />
          <div className="skeleton h-4 w-1/2" />
        </div>
      </div>
      <div className="card space-y-2">
        <div className="skeleton h-4 w-1/4" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
      </div>
    </div>
  );
}

function ReportContent() {
  const t = useTranslations('report');
  const params = useSearchParams();
  const token = params.get('token') || '';
  const [state, setState] = useState<'loading' | 'ok' | 'err'>('loading');
  const [report, setReport] = useState<FullReport | null>(null);

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
        setState('ok');
      })
      .catch(() => setState('err'));
  }, [token]);

  if (state === 'loading') return <LoadingSkeleton />;
  if (state === 'err' || !report) {
    return (
      <div className="card mx-auto max-w-2xl border-rose-200 text-center dark:border-rose-500/20">
        <AlertIcon className="mx-auto h-8 w-8 text-rose-500" />
        <p className="mt-2 font-semibold text-rose-600 dark:text-rose-300">{t('invalid')}</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {/* Header */}
      <div className="card animate-fade-up">
        <p className="badge !bg-emerald-50 !text-emerald-700 dark:!bg-emerald-500/10 dark:!text-emerald-300">
          <CheckIcon className="h-3.5 w-3.5" />
          {t('verified')}
        </p>
        <h1 className="mt-3 text-2xl font-black tracking-tight">
          {t('title')} — {report.business_name}
        </h1>
        <div className="mt-5 flex flex-col items-center gap-5 sm:flex-row sm:gap-7">
          <ScoreRing score={Number(report.score)} />
          <p className="text-[15px] leading-relaxed text-slate-700 dark:text-slate-300">{report.summary}</p>
        </div>
      </div>

      {/* Complaints / praises */}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="card animate-fade-up" style={{ animationDelay: '80ms' }}>
          <h2 className="flex items-center gap-2 font-extrabold">
            <span className="icon-tile h-8 w-8 !rounded-xl bg-gradient-to-br from-rose-500 to-orange-500">
              <AlertIcon className="h-4 w-4" />
            </span>
            {t('complaints')}
          </h2>
          <ul className="mt-3 space-y-3">
            {report.top_complaints?.map((c, i) => (
              <li key={i} className="rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                <p className="font-bold">
                  {c.topic} <span className="font-semibold text-slate-400">×{c.count}</span>
                </p>
                {c.example && (
                  <p className="mt-1 flex gap-1.5 text-slate-600 dark:text-slate-400">
                    <QuoteIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="italic">{c.example}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>

        <div className="card animate-fade-up" style={{ animationDelay: '140ms' }}>
          <h2 className="flex items-center gap-2 font-extrabold">
            <span className="icon-tile h-8 w-8 !rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500">
              <CheckIcon className="h-4 w-4" />
            </span>
            {t('praises')}
          </h2>
          <ul className="mt-3 space-y-3">
            {report.top_praises?.map((c, i) => (
              <li key={i} className="rounded-2xl bg-slate-50 p-3 text-sm dark:bg-slate-800/60">
                <p className="font-bold">
                  {c.topic} <span className="font-semibold text-slate-400">×{c.count}</span>
                </p>
                {c.example && (
                  <p className="mt-1 flex gap-1.5 text-slate-600 dark:text-slate-400">
                    <QuoteIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                    <span className="italic">{c.example}</span>
                  </p>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Action */}
      <div
        className="animate-fade-up rounded-3xl border border-emerald-200/70 bg-gradient-to-br from-emerald-50 to-teal-50/60 p-6 shadow-card dark:border-emerald-500/20 dark:from-emerald-500/[0.08] dark:to-teal-500/[0.04]"
        style={{ animationDelay: '200ms' }}
      >
        <h2 className="flex items-center gap-2 font-extrabold">
          <span className="icon-tile h-8 w-8 !rounded-xl bg-gradient-to-br from-emerald-500 to-teal-500">
            <ZapIcon className="h-4 w-4" />
          </span>
          {t('action')}
        </h2>
        <p className="mt-2 text-[15px] leading-relaxed">{report.action_suggestion}</p>
      </div>
    </div>
  );
}

export default function ReportPage() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ReportContent />
    </Suspense>
  );
}
