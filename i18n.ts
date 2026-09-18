import { getRequestConfig } from 'next-intl/server';
import { locales, defaultLocale } from './i18n.config';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const active = (locales as readonly string[]).includes(requested || '')
    ? requested!
    : defaultLocale;
  return {
    locale: active,
    messages: (await import(`./messages/${active}.json`)).default
  };
});
