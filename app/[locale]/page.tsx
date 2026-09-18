import { unstable_setRequestLocale } from 'next-intl/server';
import AnalyzeForm from '@/components/AnalyzeForm';
import { locales } from '@/i18n.config';

export default function HomePage({ params }: { params: { locale: string } }) {
  unstable_setRequestLocale(params.locale);
  return <AnalyzeForm />;
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
