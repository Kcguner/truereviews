import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/site';

// Token'lı özel rapor sayfaları asla dizine girmemeli.
export async function generateMetadata({
  params
}: {
  params: { locale: string };
}): Promise<Metadata> {
  return {
    robots: { index: false, follow: false, googleBot: { index: false, follow: false } },
    alternates: { canonical: `${getSiteUrl()}/${params.locale}/rapor` }
  };
}

export default function RaporLayout({ children }: { children: React.ReactNode }) {
  return children;
}
