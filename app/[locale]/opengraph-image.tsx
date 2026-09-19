import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'TrueReviews — Google yorumlarının dürüst özeti';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const OG_TEXT: Record<string, { brand: string; title: string; sub: string }> = {
  tr: {
    brand: 'TRUE REVIEWS',
    title: 'Müşterilerin senin hakkında aslında ne diyor?',
    sub: 'Google Maps linkini yapıştır · Önizleme ücretsiz · Kayıt gerekmez'
  },
  en: {
    brand: 'TRUE REVIEWS',
    title: 'What are your customers really saying about you?',
    sub: 'Paste your Google Maps link · Free preview · No sign-up'
  },
  de: {
    brand: 'TRUE REVIEWS',
    title: 'Was sagen deine Kunden wirklich über dich?',
    sub: 'Google-Maps-Link einfügen · Kostenlose Vorschau · Keine Anmeldung'
  },
  fr: {
    brand: 'TRUE REVIEWS',
    title: 'Que disent vraiment vos clients de vous ?',
    sub: 'Collez votre lien Google Maps · Aperçu gratuit · Sans inscription'
  },
  es: {
    brand: 'TRUE REVIEWS',
    title: '¿Qué dicen realmente tus clientes de ti?',
    sub: 'Pega tu enlace de Google Maps · Vista previa gratis · Sin registro'
  },
  nl: {
    brand: 'TRUE REVIEWS',
    title: 'Wat zeggen je klanten echt over je?',
    sub: 'Plak je Google Maps-link · Gratis preview · Geen registratie'
  },
  ar: {
    brand: 'TRUE REVIEWS',
    title: 'ماذا يقول عملاؤك عنك فعلاً؟',
    sub: 'الصق رابط خرائط Google · معاينة مجانية · دون تسجيل'
  },
  ru: {
    brand: 'TRUE REVIEWS',
    title: 'Что клиенты на самом деле говорят о вас?',
    sub: 'Вставьте ссылку Google Maps · Бесплатный предпросмотр · Без регистрации'
  },
  fa: {
    brand: 'TRUE REVIEWS',
    title: 'مشتریان واقعاً درباره شما چه می‌گویند؟',
    sub: 'پیوند گوگل‌مپس را بچسبانید · پیش‌نمایش رایگان · بدون ثبت‌نام'
  },
  az: {
    brand: 'TRUE REVIEWS',
    title: 'Müştəriləriniz əslində sizin haqqınızda nə deyir?',
    sub: 'Google Maps linkini yapışdırın · Pulsuz önizləmə · Qeydiyyatsız'
  }
};

export default async function Image({ params }: { params: { locale: string } }) {
  const t = OG_TEXT[params.locale] || OG_TEXT.en;
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'center',
          padding: '80px',
          background: '#f5efe3',
          color: '#1f1c17',
          fontFamily: 'Georgia, serif'
        }}
      >
        <div style={{ fontSize: 40, color: '#17463c', letterSpacing: 2 }}>{t.brand}</div>
        <div style={{ fontSize: 84, fontWeight: 700, lineHeight: 1.1, marginTop: 16 }}>{t.title}</div>
        <div style={{ fontSize: 36, marginTop: 24, color: '#544c40' }}>{t.sub}</div>
      </div>
    ),
    { ...size }
  );
}
