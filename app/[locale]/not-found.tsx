'use client';
import { useLocale, useTranslations } from 'next-intl';
import { locales, rtlLocales, type Locale } from '@/i18n.config';

/**
 * `/de/gizlilik-typo` gibi bilinmeyen bir slug `notFound()` çağırdığında Next.js
 * 404'ü bu segment'in `not-found.tsx`'i olarak, `app/[locale]/layout.tsx`
 * (header/footer/fontlar/tema/dir) ALTINDA render eder. Önce davranışta bu 404
 * kök `app/not-found.tsx`'e kaçıyor, kullanıcının dilini ve tasarımını
 * kaybediyordu.
 *
 * Dil `useLocale()` ile alınıyor: `not-found` bileşenine Next.js hiçbir prop
 * geçmez (params dahil), ama `NextIntlClientProvider` bu segment'in layout'ında
 * olduğu için istemcide her zaman mevcut. next-intl ayrıca provider'ı
 * bulamazsa `useParams().locale`'a düşüyor — iki yol da aynı sonucu verir.
 * Bilinmeyen bir değer dönerse `tr`'ye düşüyoruz ki link asla `/undefined`
 * olmasın.
 *
 * Metinler yalnızca MEVCUT `nb.*` anahtarlarından gelir: 10 `messages/*.json`
 * dosyasına yeni anahtar eklenmez. Yönlendirme de YOK, link doğrudan
 * `/${locale}` — `localePrefix: 'always'` ile döngü oluşmaz.
 *
 * `metadata` export'u bilinçli YOK: Next.js 14'te metadata yalnızca KÖK
 * `app/not-found.tsx` için bu dosyadan okunur; segment seviyesindeki
 * not-found inherit ettiği layout'ın (ana sayfa) title'ını kullanır. Bu bir
 * 404 olduğu için Next `noindex` otomatik ekliyor — ek metadata gerekmiyor.
 */
export default function LocaleNotFound() {
  const t = useTranslations('nb');
  const locale = useLocale();
  const known = (locales as readonly string[]).includes(locale);
  const safe: Locale = known ? (locale as Locale) : 'tr';
  // ar/fa RTL: `<html dir>` layout'da zaten var, ancak 404 kendi kökünde de
  // doğru yönü garantilemek istiyor.
  const dir = rtlLocales.includes(safe) ? 'rtl' : 'ltr';

  return (
    <section className="screen" dir={dir}>
      <div className="wrap wrap--report rpt">
        <div className="rpt__nav">
          <a className="linkish" href={`/${safe}`}>
            ← TrueReviews
          </a>
        </div>
        <header className="rpt__head">
          <p className="eyebrow">404</p>
          <h1>{t('foot.tagline')}</h1>
          <p className="rpt__sub">{t('brand.sub')}</p>
        </header>
        <div className="rpt__acts">
          <a className="btn btn--primary" href={`/${safe}`}>
            {t('rpt.new')}
          </a>
        </div>
      </div>
    </section>
  );
}
