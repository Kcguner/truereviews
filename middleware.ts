import createMiddleware from 'next-intl/middleware';
import { locales, defaultLocale } from './i18n.config';

export default createMiddleware({
  locales: [...locales],
  defaultLocale,
  // 'always': / her zaman tarayıcı diline göre /{locale}'e yönlenir.
  // Algı sırası: NEXT_LOCALE çerezi → Accept-Language → defaultLocale.
  localePrefix: 'always'
});

export const config = {
  matcher: ['/((?!api|_next|_vercel|.*\\..*).*)']
};
