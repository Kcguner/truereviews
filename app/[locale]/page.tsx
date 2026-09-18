import { unstable_setRequestLocale } from 'next-intl/server';
import AnalyzeForm from '@/components/AnalyzeForm';
import AnalyzeFormV1 from '@/components/AnalyzeFormV1';
import AnalyzeFormV2 from '@/components/AnalyzeFormV2';
import AnalyzeFormV3 from '@/components/AnalyzeFormV3';
import { locales } from '@/i18n.config';

export default function HomePage({ params }: { params: { locale: string } }) {
  unstable_setRequestLocale(params.locale);
  
  // Tasarım versiyonlarını karşılaştırmak için değiştirin: 'original', 'v1', 'v2', 'v3'
  const designVersion = 'original';
  
  switch (designVersion) {
    case 'v1':
      return <AnalyzeFormV1 />;
    case 'v2':
      return <AnalyzeFormV2 />;
    case 'v3':
      return <AnalyzeFormV3 />;
    default:
      return <AnalyzeForm />;
  }
}

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}
