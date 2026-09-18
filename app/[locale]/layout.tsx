import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, unstable_setRequestLocale } from 'next-intl/server';
import { Inter } from 'next/font/google';
import { locales, defaultLocale, localeNames, rtlLocales, type Locale } from '@/i18n.config';
import LanguageSwitcher from '@/components/LanguageSwitcher';
import ThemeToggle from '@/components/ThemeToggle';
import { ThemeProvider, ThemeScript } from '@/components/ThemeProvider';
import { SparkleIcon } from '@/components/Icons';

const inter = Inter({ subsets: ['latin', 'latin-ext'], variable: '--font-sans' });

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

const META: Record<string, { title: string; description: string }> = {
  tr: {
    title: 'Ücretsiz Google Yorum Analizi — İşletme Raporu',
    description: 'Google Maps yorumlarınızı ücretsiz analiz edin: skor, şikayet konuları ve aksiyon önerisi.'
  },
  en: {
    title: 'Free Google Reviews Analyzer — Business Report',
    description: 'Analyze your Google Maps reviews for free: score, complaint themes and action tip.'
  },
  de: {
    title: 'Kostenlose Google Bewertungsanalyse — Bericht',
    description: 'Analysieren Sie Ihre Google Maps Bewertungen kostenlos.'
  },
  ar: { title: 'تحليل تقييمات Google مجانًا', description: 'حلّل تقييمات خرائط Google مجانًا.' },
  ru: { title: 'Бесплатный анализ отзывов Google', description: 'Анализируйте отзывы Google Maps бесплатно.' },
  fr: { title: 'Analyse gratuite des avis Google', description: 'Analysez vos avis Google Maps gratuitement.' },
  es: { title: 'Análisis gratuito de reseñas de Google', description: 'Analiza tus reseñas de Google Maps gratis.' },
  nl: { title: 'Gratis Google-reviewanalyse', description: 'Analyseer je Google Maps-reviews gratis.' },
  fa: { title: 'تحلیل رایگان نظرات گوگل', description: 'نظرات گوگل‌مپس را رایگان تحلیل کنید.' },
  az: { title: 'Pulsuz Google rəy təhlili', description: 'Google Maps rəylərinizi pulsuz təhlil edin.' }
};

export async function generateMetadata({ params }: { params: { locale: string } }): Promise<Metadata> {
  const locale = (locales as readonly string[]).includes(params.locale) ? params.locale : defaultLocale;
  const m = META[locale] || META.tr;
  const base = (process.env.NEXT_PUBLIC_APP_URL || 'https://ornek.vercel.app').replace(/\/+$/, '');
  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = `${base}/${l}`;
  languages['x-default'] = `${base}/en`;
  return {
    title: m.title,
    description: m.description,
    alternates: { canonical: `${base}/${locale}`, languages }
  };
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: { locale: string };
}) {
  if (!(locales as readonly string[]).includes(params.locale)) notFound();
  unstable_setRequestLocale(params.locale);
  const messages = await getMessages();
  const t = await getTranslations();
  const locale = params.locale as Locale;
  const dir = rtlLocales.includes(locale) ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir} suppressHydrationWarning className={inter.variable}>
      <body className="min-h-screen">
        <ThemeScript />
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            {/* Arka plan ışıması */}
            <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10">
              <div className="absolute -top-32 start-1/4 h-96 w-96 rounded-full bg-blue-500/15 blur-3xl dark:bg-blue-500/20" />
              <div className="absolute top-40 -start-20 h-80 w-80 rounded-full bg-violet-500/10 blur-3xl dark:bg-violet-500/15" />
              <div className="absolute bottom-0 end-0 h-96 w-96 rounded-full bg-orange-500/10 blur-3xl dark:bg-orange-500/10" />
            </div>

            <div className="sticky top-3 z-50 px-4">
              <header className="glass-bar mx-auto flex max-w-5xl items-center justify-between rounded-2xl px-4 py-2.5">
                <a href={`/${locale}`} className="flex cursor-pointer items-center gap-2.5">
                  <span className="icon-tile h-9 w-9 bg-gradient-to-br from-blue-600 to-violet-600">
                    <SparkleIcon className="h-5 w-5" />
                  </span>
                  <span className="text-[15px] font-extrabold tracking-tight">
                    Yorum<span className="gradient-text">Analizi</span>
                  </span>
                </a>
                <div className="flex items-center gap-2">
                  <LanguageSwitcher current={locale} names={localeNames} />
                  <ThemeToggle />
                </div>
              </header>
            </div>

            <main className="mx-auto max-w-5xl px-4 pb-10 pt-8">{children}</main>

            <footer className="border-t border-slate-200/70 dark:border-slate-800/70">
              <div className="mx-auto flex max-w-5xl flex-col items-center gap-2 px-4 py-6 text-center text-xs text-slate-500 dark:text-slate-400">
                <span className="flex items-center gap-1.5 font-semibold text-slate-600 dark:text-slate-300">
                  <span className="icon-tile h-6 w-6 !rounded-lg bg-gradient-to-br from-blue-600 to-violet-600">
                    <SparkleIcon className="h-3.5 w-3.5" />
                  </span>
                  YorumAnalizi
                </span>
                <p>{t('footer.note')}</p>
              </div>
            </footer>
          </ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
