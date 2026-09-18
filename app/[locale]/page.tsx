import { unstable_setRequestLocale } from 'next-intl/server';
import NotebookForm from '@/components/notebook/NotebookForm';
import { locales } from '@/i18n.config';

export default function HomePage({ params }: { params: { locale: string } }) {
  unstable_setRequestLocale(params.locale);
  return <NotebookForm />;
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
