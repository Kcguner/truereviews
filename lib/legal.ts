import type { Locale } from '@/i18n.config';
import { getFaqHeading } from './faq';

export type LegalSlug = 'sss' | 'gizlilik' | 'kvkk' | 'iletisim';
export const LEGAL_SLUGS: LegalSlug[] = ['sss', 'gizlilik', 'kvkk', 'iletisim'];

export type LegalSection = { h: string; p: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };

const PAGE_NAMES: Record<LegalSlug, Record<string, string>> = {
  sss: {
    tr: 'Sık Sorulan Sorular', en: 'Frequently Asked Questions', de: 'Häufige Fragen',
    fr: 'Questions fréquentes', es: 'Preguntas frecuentes', nl: 'Veelgestelde vragen',
    ar: 'الأسئلة الشائعة', ru: 'Частые вопросы', fa: 'سؤالات پرتکرار', az: 'Tez-tez verilən suallar'
  },
  gizlilik: {
    tr: 'Gizlilik Politikası', en: 'Privacy Policy', de: 'Datenschutzerklärung',
    fr: 'Politique de confidentialité', es: 'Política de privacidad', nl: 'Privacybeleid',
    ar: 'سياسة الخصوصية', ru: 'Политика конфиденциальности', fa: 'سیاست حریم خصوصی', az: 'Məxfilik siyasəti'
  },
  kvkk: {
    tr: 'KVKK Aydınlatma Metni', en: 'Privacy Notice (KVKK/GDPR)', de: 'KVKK-Datenschutzhinweis',
    fr: 'Notice de confidentialité KVKK', es: 'Aviso de privacidad KVKK', nl: 'KVKK-privacyverklaring',
    ar: 'إشعار الخصوصية KVKK', ru: 'Уведомление о конфиденциальности KVKK',
    fa: 'اعلامیه حریم خصوصی KVKK', az: 'KVKK məxfilik bildirişi'
  },
  iletisim: {
    tr: 'İletişim', en: 'Contact', de: 'Kontakt', fr: 'Contact', es: 'Contacto',
    nl: 'Contact', ar: 'اتصل بنا', ru: 'Контакты', fa: 'تماس', az: 'Əlaqə'
  }
};

const PAGE_DESC: Record<LegalSlug, Record<string, string>> = {
  sss: {
    tr: 'TrueReviews hakkında sık sorulan sorular ve yanıtları.',
    en: 'Frequently asked questions about TrueReviews.',
    de: 'Häufige Fragen zu TrueReviews.',
    fr: 'Questions fréquentes sur TrueReviews.',
    es: 'Preguntas frecuentes sobre TrueReviews.',
    nl: 'Veelgestelde vragen over TrueReviews.',
    ar: 'الأسئلة الشائعة حول TrueReviews.',
    ru: 'Частые вопросы о TrueReviews.',
    fa: 'سؤالات پرتکرار درباره TrueReviews.',
    az: 'TrueReviews haqqında tez-tez verilən suallar.'
  },
  gizlilik: {
    tr: 'TrueReviews verilerinizi nasıl toplar, kullanır ve korur?',
    en: 'How TrueReviews collects, uses and protects your data.',
    de: 'Wie TrueReviews Ihre Daten erhebt, nutzt und schützt.',
    fr: 'Comment TrueReviews collecte, utilise et protège vos données.',
    es: 'Cómo TrueReviews recopila, usa y protege tus datos.',
    nl: 'Hoe TrueReviews je gegevens verzamelt, gebruikt en beschermt.',
    ar: 'كيف يجمع TrueReviews بياناتك ويستخدمها ويحميها.',
    ru: 'Как TrueReviews собирает, использует и защищает ваши данные.',
    fa: 'TrueReviews داده‌های شما را چگونه جمع‌آوری، استفاده و محافظت می‌کند.',
    az: 'TrueReviews məlumatlarınızı necə toplayır, istifadə edir və qoruyur.'
  },
  kvkk: {
    tr: '6698 sayılı KVKK kapsamında veri işlemeye dair aydınlatma metni.',
    en: 'Privacy notice on data processing (KVKK/GDPR).',
    de: 'Hinweis zur Datenverarbeitung (KVKK/DSGVO).',
    fr: 'Notice sur le traitement des données (KVKK/RGPD).',
    es: 'Aviso sobre el tratamiento de datos (KVKK/RGPD).',
    nl: 'Kennisgeving over gegevensverwerking (KVKK/AVG).',
    ar: 'إشعار بشأن معالجة البيانات (KVKK).',
    ru: 'Уведомление об обработке данных (KVKK).',
    fa: 'اعلامیه پردازش داده‌ها (KVKK).',
    az: 'Məlumatların emalı barədə bildiriş (KVKK).'
  },
  iletisim: {
    tr: 'TrueReviews ile iletişime geçin.',
    en: 'Get in touch with TrueReviews.',
    de: 'Kontaktieren Sie TrueReviews.',
    fr: 'Contactez TrueReviews.',
    es: 'Contacta con TrueReviews.',
    nl: 'Neem contact op met TrueReviews.',
    ar: 'تواصل مع TrueReviews.',
    ru: 'Свяжитесь с TrueReviews.',
    fa: 'با TrueReviews در تماس باشید.',
    az: 'TrueReviews ilə əlaqə saxlayın.'
  }
};

export function getLegalMeta(slug: LegalSlug, locale: string): { title: string; description: string } {
  const l = (PAGE_NAMES[slug][locale] || PAGE_NAMES[slug].en) as string;
  const d = (PAGE_DESC[slug][locale] || PAGE_DESC[slug].en) as string;
  return { title: `${l} — TrueReviews`, description: d };
}

export function getLegalName(slug: LegalSlug, locale: string): string {
  return PAGE_NAMES[slug][locale] || PAGE_NAMES[slug].en;
}

/** SSS başlığı footer'da da kullanılır (tek kaynak). */
export function getSssHeading(locale: string): string {
  return getFaqHeading(locale);
}

// ── İçerikler: tr/en/de tam metin, diğer diller İngilizce + not ──

const DOCS: Record<string, Record<string, LegalDoc>> = {
  gizlilik: {
    tr: {
      title: 'Gizlilik Politikası',
      intro: 'Bu politika, TrueReviews kullanırken verilerinizin nasıl işlendiğini açıklar.',
      sections: [
        {
          h: 'Toplanan veriler',
          p: [
            'Analiz için yapıştırdığınız Google Maps işletme linki, tam rapor için bıraktığınız e-posta adresi ve kötüye kullanımı engellemek için IP adresinizle kota kayıtları işlenir.'
          ]
        },
        {
          h: 'Kullanım amacı',
          p: [
            'Veriler yalnızca rapor üretmek, e-posta onayını tamamlamak ve kota uygulamak için kullanılır. Reklam ve toplu pazarlama maili gönderilmez.'
          ]
        },
        {
          h: 'Saklama ve silme',
          p: [
            'Raporlar ve e-postalar güvenli altyapıda (Upstash Redis + Brevo) saklanır. Verilerinizin silinmesini isterseniz İletişim sayfasından yazmanız yeterli.'
          ]
        },
        {
          h: 'Üçüncü taraflar',
          p: [
            'E-posta gönderimi (Brevo), yorum çekme (Apify), analiz (Google AI) ve bot koruması (Cloudflare Turnstile) için ilgili servislerle sınırlı paylaşım yapılır.'
          ]
        },
        {
          h: 'Çerezler',
          p: ['Zorunlu takip çerezi kullanılmaz; tema tercihiniz yalnızca tarayıcınızda (localStorage) saklanır.']
        }
      ]
    },
    en: {
      title: 'Privacy Policy',
      intro: 'This policy explains how your data is processed when you use TrueReviews.',
      sections: [
        { h: 'Data we collect', p: ['The Google Maps business link you paste, the email address you leave for the full report, and IP/quota logs to prevent abuse.'] },
        { h: 'Purpose', p: ['Data is used only to generate the report, complete email confirmation and enforce quotas. No ads, no marketing blasts.'] },
        { h: 'Storage and deletion', p: ['Reports and emails are stored on secure infrastructure (Upstash Redis + Brevo). Write to us via the Contact page to delete your data.'] },
        { h: 'Third parties', p: ['Limited sharing with email delivery (Brevo), review fetching (Apify), analysis (Google AI) and bot protection (Cloudflare Turnstile).'] },
        { h: 'Cookies', p: ['No tracking cookies; your theme preference is stored only in your browser (localStorage).'] }
      ]
    },
    de: {
      title: 'Datenschutzerklärung',
      intro: 'Diese Erklärung beschreibt, wie Ihre Daten bei TrueReviews verarbeitet werden.',
      sections: [
        { h: 'Erhobene Daten', p: ['Der eingefügte Google-Maps-Link, Ihre E-Mail-Adresse für den vollständigen Bericht sowie IP-/Kontingentprotokolle gegen Missbrauch.'] },
        { h: 'Zweck', p: ['Die Daten dienen nur der Berichtserstellung, der E-Mail-Bestätigung und der Kontingentkontrolle. Keine Werbung, keine Newsletter.'] },
        { h: 'Speicherung und Löschung', p: ['Sichere Speicherung (Upstash Redis + Brevo). Zur Löschung Ihrer Daten schreiben Sie uns über die Kontaktseite.'] },
        { h: 'Dritte', p: ['Begrenzte Weitergabe an E-Mail-Versand (Brevo), Bewertungsabruf (Apify), Analyse (Google AI) und Bot-Schutz (Cloudflare Turnstile).'] },
        { h: 'Cookies', p: ['Keine Tracking-Cookies; das Theme wird nur lokal in Ihrem Browser gespeichert.'] }
      ]
    }
  },
  kvkk: {
    tr: {
      title: 'KVKK Aydınlatma Metni',
      intro: '6698 sayılı Kişisel Verilerin Korunması Kanunu kapsamında veri sorumlusu TrueReviews’dir.',
      sections: [
        {
          h: 'İşlenen veriler ve amaç',
          p: [
            'E-posta adresiniz (rapor iletimi), işletme linkiniz (analiz) ve IP/kota kayıtları (güvenlik), açık rızanıza dayanarak işlenir.'
          ]
        },
        { h: 'Saklama süresi', p: ['Veriler, talebiniz üzerine silinir; onay kayıtları yasal yükümlülüklerle sınırlı süre tutulur.'] },
        {
          h: 'Haklarınız (m. 11)',
          p: [
            'Erişim, düzeltme, silme, işleme itirazı ve zararın giderilmesini talep etme haklarınızı İletişim sayfası üzerinden kullanabilirsiniz.'
          ]
        }
      ]
    },
    en: {
      title: 'Privacy Notice (KVKK/GDPR)',
      intro: 'TrueReviews is the data controller for the data described below.',
      sections: [
        { h: 'Data and purpose', p: ['Your email (report delivery), business link (analysis) and IP/quota logs (security), processed on the basis of your explicit consent.'] },
        { h: 'Retention', p: ['Data is deleted on request; confirmation records are kept only as long as legally required.'] },
        { h: 'Your rights', p: ['Access, rectification, erasure, objection and compensation rights can be exercised via the Contact page.'] }
      ]
    },
    de: {
      title: 'KVKK-Datenschutzhinweis',
      intro: 'TrueReviews ist Verantwortlicher für die unten beschriebenen Daten.',
      sections: [
        { h: 'Daten und Zweck', p: ['Ihre E-Mail (Berichtversand), Ihr Unternehmenslink (Analyse) und IP-/Kontingentprotokolle (Sicherheit) — auf Grundlage Ihrer Einwilligung.'] },
        { h: 'Speicherdauer', p: ['Löschung auf Anfrage; Nachweise nur so lange wie gesetzlich erforderlich.'] },
        { h: 'Ihre Rechte', p: ['Auskunft, Berichtigung, Löschung, Widerspruch und Schadensersatz — über die Kontaktseite.'] }
      ]
    }
  },
  iletisim: {
    tr: {
      title: 'İletişim',
      intro: 'Sorularınız, silme talepleriniz ve geri bildirimleriniz için bize yazın.',
      sections: []
    },
    en: {
      title: 'Contact',
      intro: 'Write to us with questions, deletion requests and feedback.',
      sections: []
    },
    de: {
      title: 'Kontakt',
      intro: 'Schreiben Sie uns bei Fragen, Löschanfragen und Feedback.',
      sections: []
    }
  }
};

const FALLBACK_NOTE: Record<string, string> = {
  tr: '',
  en: '',
  de: '',
  fr: 'Cette page n’est pas encore traduite en français — version anglaise ci-dessous.',
  es: 'Esta página aún no está traducida al español — versión en inglés a continuación.',
  nl: 'Deze pagina is nog niet in het Nederlands vertaald — Engelse versie hieronder.',
  ar: 'هذه الصفحة غير مترجمة إلى العربية بعد — النسخة الإنجليزية أدناه.',
  ru: 'Эта страница пока не переведена на русский — ниже английская версия.',
  fa: 'این صفحه هنوز به فارسی ترجمه نشده است — نسخه انگلیسی در ادامه.',
  az: 'Bu səhifə hələ Azərbaycan dilinə tərcümə olunmayıb — aşağıda ingilis versiyası.'
};

export function getLegalDoc(slug: LegalSlug, locale: string): { doc: LegalDoc; fallbackNote: string } {
  const bySlug = DOCS[slug];
  if (bySlug) {
    const doc = bySlug[locale] || bySlug.en;
    if (doc) return { doc, fallbackNote: bySlug[locale] ? '' : FALLBACK_NOTE[locale] || '' };
  }
  // sss: içerik FAQ verisinden sayfada üretilir
  const meta = getLegalMeta(slug, locale);
  return { doc: { title: meta.title.replace(' — TrueReviews', ''), intro: meta.description, sections: [] }, fallbackNote: '' };
}

// ── E-posta kilidindeki KVKK onayı ──

export type ConsentText = { label: string; link: string; error: string };

const CONSENT: Record<string, ConsentText> = {
  tr: {
    label: 'Aydınlatma metnini okudum, raporun e-posta ile gönderilmesini kabul ediyorum.',
    link: 'Aydınlatma Metni',
    error: 'Devam etmek için KVKK onayı gerekli.'
  },
  en: {
    label: 'I have read the privacy notice and agree to receive the report by email.',
    link: 'Privacy Notice',
    error: 'Privacy consent is required to continue.'
  },
  de: {
    label: 'Ich habe den Hinweis gelesen und stimme dem E-Mail-Versand des Berichts zu.',
    link: 'Datenschutzhinweis',
    error: 'Ohne Zustimmung geht es nicht weiter.'
  },
  fr: {
    label: "J'ai lu l'avis et j'accepte de recevoir le rapport par e-mail.",
    link: 'Avis de confidentialité',
    error: 'Le consentement est requis pour continuer.'
  },
  es: {
    label: 'He leído el aviso y acepto recibir el informe por correo.',
    link: 'Aviso de privacidad',
    error: 'Se requiere el consentimiento para continuar.'
  },
  nl: {
    label: 'Ik heb de verklaring gelezen en ga akkoord met ontvangst per e-mail.',
    link: 'Privacyverklaring',
    error: 'Toestemming is vereist om door te gaan.'
  },
  ar: {
    label: 'قرأت الإشعار وأوافق على استلام التقرير عبر البريد الإلكتروني.',
    link: 'إشعار الخصوصية',
    error: 'الموافقة مطلوبة للمتابعة.'
  },
  ru: {
    label: 'Я прочитал(а) уведомление и согласен на получение отчёта по e-mail.',
    link: 'Уведомление',
    error: 'Для продолжения нужно согласие.'
  },
  fa: {
    label: 'اعلامیه را خواندم و با دریافت گزارش از طریق ایمیل موافقم.',
    link: 'اعلامیه حریم خصوصی',
    error: 'برای ادامه، رضایت لازم است.'
  },
  az: {
    label: 'Bildirişi oxudum və hesabatın e-poçtla göndərilməsinə razıyam.',
    link: 'Məxfilik bildirişi',
    error: 'Davam etmək üçün razılıq lazımdır.'
  }
};

export function getConsent(locale: string): ConsentText {
  return CONSENT[locale] || CONSENT.en;
}

export function getContactEmail(): string | null {
  return process.env.NEXT_PUBLIC_CONTACT_EMAIL || null;
}

export function isLegalSlug(s: string): s is LegalSlug {
  return (LEGAL_SLUGS as string[]).includes(s);
}
