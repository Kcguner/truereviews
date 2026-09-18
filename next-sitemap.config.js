/** @type {import('next-sitemap').IConfig} */
module.exports = {
  siteUrl: process.env.NEXT_PUBLIC_APP_URL || 'https://ornek.vercel.app',
  generateRobotsTxt: true,
  generateIndexSitemap: false,
  robotsTxtOptions: {
    policies: [{ userAgent: '*', allow: '/' }]
  },
  exclude: ['/api/*'],
  alternateRefs: [
    { href: 'https://ornek.vercel.app/tr', hreflang: 'tr' },
    { href: 'https://ornek.vercel.app/en', hreflang: 'en' },
    { href: 'https://ornek.vercel.app/de', hreflang: 'de' },
    { href: 'https://ornek.vercel.app/ar', hreflang: 'ar' },
    { href: 'https://ornek.vercel.app/ru', hreflang: 'ru' },
    { href: 'https://ornek.vercel.app/fr', hreflang: 'fr' },
    { href: 'https://ornek.vercel.app/es', hreflang: 'es' },
    { href: 'https://ornek.vercel.app/nl', hreflang: 'nl' },
    { href: 'https://ornek.vercel.app/fa', hreflang: 'fa' },
    { href: 'https://ornek.vercel.app/az', hreflang: 'az' },
    { href: 'https://ornek.vercel.app/en', hreflang: 'x-default' }
  ]
};
