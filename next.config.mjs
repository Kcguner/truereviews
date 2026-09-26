import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n.ts');

/** Cloudflare Turnstile widget'ı (components/TurnstileWidget.tsx). */
const TURNSTILE_ORIGIN = 'https://challenges.cloudflare.com';
/** 'unsafe-eval' yalnızca webpack/React Refresh'in gerektiği dev derlemesinde. */
const DEV = process.env.NODE_ENV !== 'production';

/**
 * Plausible kendi origin'ini env'den alıyor (self-host olabiliyor —
 * .env.example: NEXT_PUBLIC_PLAUSIBLE_SRC). Sabit origin yazılırsa analitik
 * sessizce engellenir, o yüzden origin burada türetiliyor.
 */
function plausibleOrigin() {
  const raw = process.env.NEXT_PUBLIC_PLAUSIBLE_SRC;
  if (!raw) return 'https://plausible.io';
  try {
    return new URL(raw).origin;
  } catch {
    return 'https://plausible.io';
  }
}

/**
 * ⚠️ ZAYIF NOKTA — `script-src` içinde `'unsafe-inline'` VAR ve bu bilinçli:
 * uygulama üç yerde satır içi `<script>` basıyor ve nonce altyapısı yok:
 *   1. components/ThemeProvider.tsx  → ThemeScript (FOUC önleyici tema betiği)
 *   2. components/SeoJsonLd.tsx      → Organization/WebSite/FAQPage JSON-LD
 *   3. app/[locale]/[page]/page.tsx  → WebPage/BreadcrumbList/FAQPage JSON-LD
 * Ayrıca Next.js'in kendi uçuş verisi (RSC flight) betikleri de satır içidir;
 * onlar nonce'suz kaldığı sürece bu madde kaldırılamaz.
 *
 * TAKİP: middleware'de sayfa başına nonce üret, `headers()` ile
 * `script-src 'nonce-…'` olarak geçir ve `ThemeScript`/JSON-LD betiklerine
 * `nonce` prop'u ekle. `style-src` için de aynı iş gerekir (Turnstile iframe
 * dışında satır içi stil dayatıyor). Nonce'a geçilene kadar 'unsafe-inline'
 * bir XSS girdisinin sayfadaki JSON-LD enjeksiyonunu engellemez.
 */
function contentSecurityPolicy() {
  const pa = plausibleOrigin();
  return [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${DEV ? " 'unsafe-eval'" : ''} ${TURNSTILE_ORIGIN} ${pa}`,
    // Turnstile kapsayıcısına satır içi stil dayatır; Next de küçük stil
    // blokları basabiliyor → stil tarafında da 'unsafe-inline' şart.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${TURNSTILE_ORIGIN}`,
    "font-src 'self' data:",
    `connect-src 'self' ${TURNSTILE_ORIGIN} ${pa}${DEV ? ' ws: wss:' : ''}`,
    `frame-src ${TURNSTILE_ORIGIN}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'"
  ].join('; ');
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'Content-Security-Policy', value: contentSecurityPolicy() }
        ]
      }
    ];
  }
};

export default withNextIntl(nextConfig);
