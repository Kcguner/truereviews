import type { Metadata } from 'next';
import { unstable_setRequestLocale } from 'next-intl/server';
import NotebookForm from '@/components/notebook/NotebookForm';
import { locales } from '@/i18n.config';
import { ROBOTS_INDEX } from '@/lib/seo';

export default function HomePage({ params }: { params: { locale: string } }) {
  unstable_setRequestLocale(params.locale);
  return <NotebookForm />;
}

/**
 * Title/description/keywords/canonical/hreflang/OG `app/[locale]/layout.tsx`
 * içindeki tek kaynaktan gelir; burada yalnızca indeksleme yönergesi tanımlanır.
 * Layout'ta tanımlansaydı 404 sınırına da miras kalır ve `index, follow` ile
 * `noindex` iki ayrı meta olarak basılırdı.
 */
export function generateMetadata(): Metadata {
  return { robots: ROBOTS_INDEX };
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
