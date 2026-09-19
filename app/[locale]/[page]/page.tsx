import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { locales } from '@/i18n.config';
import { getSiteUrl } from '@/lib/site';
import { LEGAL_SLUGS, getContactEmail, getLegalDoc, getLegalMeta, isLegalSlug } from '@/lib/legal';
import { getFaqHeading, getFaqs } from '@/lib/faq';

type Params = { locale: string; page: string };

export function generateStaticParams() {
  return locales.flatMap((locale) => LEGAL_SLUGS.map((page) => ({ locale, page })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  if (!isLegalSlug(params.page)) return {};
  const meta = getLegalMeta(params.page, params.locale);
  const base = getSiteUrl();
  const canonical = `${base}/${params.locale}/${params.page}`;
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical },
    openGraph: { type: 'article', title: meta.title, description: meta.description, url: canonical },
    robots: { index: true, follow: true }
  };
}

function todayLabel(locale: string): string {
  try {
    return new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  } catch {
    return new Date().toLocaleDateString();
  }
}

export default function LegalPage({ params }: { params: Params }) {
  const { locale, page } = params;
  if (!isLegalSlug(page) || !(locales as readonly string[]).includes(locale)) notFound();
  const base = getSiteUrl();
  const { doc, fallbackNote } = getLegalDoc(page, locale);

  const breadcrumb = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'TrueReviews', item: `${base}/${locale}` },
      { '@type': 'ListItem', position: 2, name: doc.title, item: `${base}/${locale}/${page}` }
    ]
  };

  return (
    <section className="screen">
      <div className="wrap wrap--report rpt">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumb).replace(/</g, '\\u003c') }}
        />
        <div className="rpt__nav">
          <a className="linkish" href={`/${locale}`}>
            ← TrueReviews
          </a>
        </div>
        <header className="rpt__head">
          <p className="eyebrow">{todayLabel(locale)}</p>
          <h1>{doc.title}</h1>
          <p className="rpt__sub">{doc.intro}</p>
        </header>

        {fallbackNote && <p className="mailnote">{fallbackNote}</p>}

        {page === 'sss' && (
          <div className="gets__grid">
            {getFaqs(locale).map((f) => (
              <details className="get" key={f.q} open>
                <summary>
                  <h5>{f.q}</h5>
                </summary>
                <p>{f.a}</p>
              </details>
            ))}
          </div>
        )}

        {page === 'iletisim' && <ContactBlock locale={locale} />}

        {doc.sections.map((s) => (
          <section className="block" key={s.h}>
            <div className="block__h">
              <h3>{s.h}</h3>
              <span className="rule" />
            </div>
            {s.p.map((t, i) => (
              <p key={i} style={{ color: 'var(--ink-2)', marginTop: i ? 8 : 0 }}>
                {t}
              </p>
            ))}
          </section>
        ))}

        {page === 'sss' && (
          <p style={{ marginTop: 16 }}>
            <a className="btn btn--primary" href={`/${locale}`}>
              {getFaqHeading(locale)} →
            </a>
          </p>
        )}
      </div>
    </section>
  );
}

function ContactBlock({ locale }: { locale: string }) {
  const email = getContactEmail();
  if (!email) return null;
  return (
    <section className="block">
      <div className="block__h">
        <h3>{email}</h3>
        <span className="rule" />
      </div>
      <p>
        <a className="linkish" href={`mailto:${email}`} dir="ltr">
          {email}
        </a>
      </p>
    </section>
  );
}
