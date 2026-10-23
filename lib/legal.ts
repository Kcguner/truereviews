export type LegalSlug = 'sss' | 'gizlilik' | 'kvkk' | 'iletisim';
export const LEGAL_SLUGS: LegalSlug[] = ['sss', 'gizlilik', 'kvkk', 'iletisim'];

export type LegalSection = { h: string; p: string[] };
export type LegalDoc = { title: string; intro: string; sections: LegalSection[] };

export type LegalDocResult = {
  doc: LegalDoc;
  /** Ekranda gösterilen "henüz çevrilmedi" notu; çeviri varsa boş string. */
  fallbackNote: string;
  /**
   * Gövde İngilizceye düştü mü?
   *
   * `fallbackNote` bunu zaten ima eder ama o bir GÖRSEL metindir: bir dil
   * (`messages/*.json` gibi) notu boş bırakırsa sinyal kaybolur. Dizin politikası
   * yalnızca görsel nota bakmamalı — bu bayrak "bu sayfa gerçekten o dilde
   * yazılmış mı" sorusunun tek makul cevabıdır (bkz.
   * app/[locale]/[page]/page.tsx → `robots`).
   */
  fallback: boolean;
};

/**
 * Veri sorumlusu kimliği — KVKK m.10'un zorunlu unsuru.
 *
 * `legalName`, `address` ve `kep` yayına almadan önce doldurulmalıdır; köşeli
 * parantezli değerler bilinçli yer tutucudur, uydurma şirket bilgisi değildir.
 * E-posta, site genelindeki tek kaynak olan `NEXT_PUBLIC_CONTACT_EMAIL`
 * değişkeninden okunur (bkz. `lib/site.ts` → `getContactEmail`); tanımlı
 * değilse metinde yer tutucu görünür.
 */
export const CONTROLLER_INFO = {
  name: 'TrueReviews',
  legalName: '[TODO: ticari unvan / şahıs adı]',
  address: '[TODO: tebligat adresi]',
  kep: '[TODO: KEP adresi]',
  email: process.env.NEXT_PUBLIC_CONTACT_EMAIL || '[TODO: iletişim e-postası]'
};

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

// ── İçerikler: tr/en/de tam metin, diğer diller İngilizce + not ──

const DOCS: Record<string, Record<string, LegalDoc>> = {
  gizlilik: {
    tr: {
      title: 'Gizlilik Politikası',
      intro: 'Bu politika; TrueReviews’in hangi verileri, hangi amaçla ve hangi hukuki sebebe dayanarak işlediğini, kimlere aktardığını ve ne kadar süre sakladığını açıklar. KVKK kapsamındaki zorunlu bilgilendirme ayrıca Aydınlatma Metni’nde yer alır.',
      sections: [
        {
          h: 'Veri sorumlusu',
          p: [
            `Veri sorumlusu: ${CONTROLLER_INFO.name} — ${CONTROLLER_INFO.legalName}. Tebligat adresi: ${CONTROLLER_INFO.address}. KEP: ${CONTROLLER_INFO.kep}. E-posta: ${CONTROLLER_INFO.email}.`
          ]
        },
        {
          h: 'İşlenen veriler, amaç ve hukuki sebep',
          p: [
            'Raporun üretilmesi ve e-posta ile iletilmesi (KVKK m.5/2-c, sözleşmenin ifası): yapıştırdığınız Google Maps işletme linki, işletme adı, sayfadan çekilen herkese açık yorum metinleri ve puanları, e-posta adresiniz ve onay kaydınız.',
            'Bot ve kötüye kullanım koruması (m.5/2-f, meşru menfaat): IP adresine bağlı kota sayaçları, istek zamanı ve dil tercihiniz.',
            'Hukuki yükümlülükler (m.5/2-ç): yetkili kamu kurumlarının usulüne uygun taleplerine cevap verilmesi ve uyuşmazlıklarda delil saklanması.'
          ]
        },
        {
          h: 'Alıcılar',
          p: [
            'Veriler, hizmetin sunulması için yalnızca kendi hizmet kapsamlarında şu tedarikçilerle paylaşılır: Upstash (rapor, yorum metinleri ve lead kaydı; Redis, AB bölgesi), Vercel (barındırma ve sunucu günlükleri; fra1), Apify (herkese açık Google Maps sayfasının adresi), Google AI Studio / Gemini (işletme adı, yorum metinleri ve puanları), Brevo (yalnızca e-posta adresiniz ve rapor bağlantısı), Cloudflare Turnstile (bot kontrolü için IP adresi ve tarayıcı sinyalleri). Plausible yapılandırılmışsa çerezsiz çalışır ve yalnızca sayfa görüntüleme sayıları alır.'
          ]
        },
        {
          h: 'Yurt dışına aktarım',
          p: [
            'Adı geçen tedarikçilerin sunucuları yurt dışında olduğundan veriler yurt dışına aktarılır. Aktarım, KVKK m.9 uyarınca standart sözleşme hükümlerine dayanılarak yapılır; bu aktarımlar için verilmiş bir yeterlilik kararı bulunmamaktadır. Sözleşme metinleri ve aktarım detayları talebiniz üzerine paylaşılır.'
          ]
        },
        {
          h: 'Saklama süreleri',
          p: [
            'Rapor ve çekilen yorum metinleri varsayılan olarak 24 saat (yapılandırmaya göre 1 saat ile 30 gün arasında), e-posta doğrulama bağlantısı 48 saat, e-posta/lead kaydı 180 gün, IP kota sayaçları 1 saat ve 24 saat saklanır. Süre dolduğunda kayıtlar otomatik olarak silinir.'
          ]
        },
        {
          h: 'Çerezler ve yerel depolama',
          p: [
            'Yalnızca işlevsel bir çerez kullanılır: NEXT_LOCALE, dil tercihinizi 1 yıl boyunca hatırlar (SameSite=Lax). Bot koruması için Cloudflare Turnstile, sayfa yüklendiğinde tarayıcınızdan teknik sinyaller alır.',
            'Tema ve e-posta tercihleri çerez değildir; tarayıcınızın localStorage alanında tutulur. Varsayılan olarak reklam veya analiz çerezi kullanılmaz; Plausible etkinleştirilirse çerezsiz çalışır.'
          ]
        },
        {
          h: 'Çekilen yorumlar (üçüncü kişilere ait içerik)',
          p: [
            'Analiz edilen yorumlar, işletmenin Google Maps sayfasındaki herkese açık içeriktir ve yorum sahiplerine aittir. Bu metinler yalnızca işletme için özet rapor üretmek amacıyla işlenir; yorum yazarı adları saklanmaz. Yorumunuzun işlenmesini istemiyorsanız iletişim adresimize yazabilirsiniz; talebiniz en kısa sürede sonuçlandırılır.'
          ]
        },
        {
          h: 'Haklarınız ve başvuru yolu',
          p: [
            'KVKK m.11 kapsamında; verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, işlenme amacını ve aktarıldığı tarafları öğrenme, eksik veya yanlış verilerin düzeltilmesini, silinmesini veya yok edilmesini ve bu işlemlerin alıcılara bildirilmesini isteme, münhasıran otomatik sistemlerle yapılan analiz sonucunda aleyhinize bir sonucun ortaya çıkmasına itiraz etme ve zararın giderilmesini talep etme haklarına sahipsiniz.',
            'Başvurunuzu yazılı olarak yukarıdaki tebligat adresine, KEP adresimize veya güvenli elektronik imza ile e-posta adresimize iletebilirsiniz. Talepler en geç 30 gün içinde cevaplanır. Kişisel Verileri Koruma Kurulu’na şikâyet hakkınız saklıdır.'
          ]
        }
      ]
    },
    en: {
      title: 'Privacy Policy',
      intro: 'This policy explains what personal data TrueReviews processes, why, on which legal basis, who receives it and for how long. The statutory information under the Turkish KVKK is also set out in the Privacy Notice.',
      sections: [
        {
          h: 'Data controller',
          p: [
            `Controller: ${CONTROLLER_INFO.name} — ${CONTROLLER_INFO.legalName}. Address: ${CONTROLLER_INFO.address}. KEP: ${CONTROLLER_INFO.kep}. Email: ${CONTROLLER_INFO.email}.`
          ]
        },
        {
          h: 'Data, purpose and legal basis',
          p: [
            'Producing the report and delivering it by email (KVKK art. 5/2-c, performance of a contract): the Google Maps business link you paste, the business name, the public review texts and ratings fetched from that page, your email address and your confirmation record.',
            'Bot and abuse prevention (art. 5/2-f, legitimate interest): IP-based quota counters, request time and your language preference.',
            'Legal obligations (art. 5/2-ç): responding to lawful requests from competent authorities and preserving evidence in disputes.'
          ]
        },
        {
          h: 'Recipients',
          p: [
            'Data is shared only as needed to run the service, and only within each provider’s scope: Upstash (report, review texts and lead record; Redis, EU region), Vercel (hosting and server logs; fra1), Apify (the public Google Maps page URL), Google AI Studio / Gemini (business name, review texts and ratings), Brevo (only your email address and the report link), Cloudflare Turnstile (IP address and browser signals for bot checks). If Plausible is configured, it runs cookieless and receives page-view counts only.'
          ]
        },
        {
          h: 'International transfers',
          p: [
            'The providers above process data outside Türkiye. Transfers rely on the standard contractual clauses under KVKK art. 9; no adequacy decision is relied upon. The contract texts and transfer details are available on request.'
          ]
        },
        {
          h: 'Retention',
          p: [
            'Reports and fetched review texts are kept for 24 hours by default (1 hour to 30 days depending on configuration), the email verification link for 48 hours, the email/lead record for 180 days, and IP quota counters for 1 hour and 24 hours. Records are deleted automatically once the period ends.'
          ]
        },
        {
          h: 'Cookies and local storage',
          p: [
            'One functional cookie is used: NEXT_LOCALE remembers your language choice for 1 year (SameSite=Lax). For bot protection, Cloudflare Turnstile receives technical signals from your browser when the page loads.',
            'Theme and email preferences are not cookies; they live in your browser’s localStorage. No advertising or analytics cookies are set by default; if Plausible is enabled it is cookieless.'
          ]
        },
        {
          h: 'Fetched reviews (third-party content)',
          p: [
            'The reviews analysed are public content on the business’s Google Maps page and belong to their authors. They are processed only to produce a summary report for the business; author names are not stored. If you do not want your review processed, write to the contact address and your request will be handled as soon as possible.'
          ]
        },
        {
          h: 'Your rights and how to apply',
          p: [
            'Under KVKK art. 11 you may learn whether your data is processed, request information, learn the purpose and the recipients, have incomplete or inaccurate data corrected, have it erased or destroyed and have this notified to recipients, object to a result arising solely from automated analysis, and claim compensation for damage.',
            'Send requests in writing to the address above, by KEP, or with a secure electronic signature to the email address above. We respond within 30 days at the latest. You may also lodge a complaint with the Turkish Personal Data Protection Board.'
          ]
        }
      ]
    },
    de: {
      title: 'Datenschutzerklärung',
      intro: 'Diese Erklärung beschreibt, welche personenbezogenen Daten TrueReviews verarbeitet, zu welchem Zweck, auf welcher Rechtsgrundlage, an wen sie übermittelt und wie lange sie gespeichert werden. Die förmliche Information nach dem türkischen KVKK steht im KVKK-Datenschutzhinweis.',
      sections: [
        {
          h: 'Verantwortlicher',
          p: [
            `Verantwortlich: ${CONTROLLER_INFO.name} — ${CONTROLLER_INFO.legalName}. Anschrift: ${CONTROLLER_INFO.address}. KEP: ${CONTROLLER_INFO.kep}. E-Mail: ${CONTROLLER_INFO.email}.`
          ]
        },
        {
          h: 'Daten, Zweck und Rechtsgrundlage',
          p: [
            'Erstellung und E-Mail-Versand des Berichts (KVKK Art. 5/2-c, Vertragserfüllung): der eingefügte Google-Maps-Link, der Unternehmensname, die öffentlich abgerufenen Bewertungstexte und Sternebewertungen, Ihre E-Mail-Adresse und Ihr Bestätigungsnachweis.',
            'Schutz vor Bots und Missbrauch (Art. 5/2-f, berechtigtes Interesse): IP-basierte Kontingentzähler, Anfragezeitpunkt und Ihre Sprachpräferenz.',
            'Rechtliche Pflichten (Art. 5/2-ç): Beantwortung rechtmäßiger Anfragen zuständiger Behörden und Beweissicherung bei Streitigkeiten.'
          ]
        },
        {
          h: 'Empfänger',
          p: [
            'Daten werden nur soweit erforderlich und nur im jeweiligen Leistungsumfang weitergegeben: Upstash (Bericht, Bewertungstexte und Lead-Datensatz; Redis, EU-Region), Vercel (Hosting und Server-Logs; fra1), Apify (die öffentliche Google-Maps-URL), Google AI Studio / Gemini (Unternehmensname, Bewertungstexte und Sterne), Brevo (nur Ihre E-Mail-Adresse und der Berichtslink), Cloudflare Turnstile (IP-Adresse und Browsersignale zur Bot-Erkennung). Ist Plausible konfiguriert, arbeitet es cookielos und erhält nur Seitenaufrufzahlen.'
          ]
        },
        {
          h: 'Drittlandübermittlung',
          p: [
            'Die genannten Anbieter verarbeiten Daten außerhalb der Türkei. Die Übermittlung stützt sich auf die Standardvertragsklauseln nach KVKK Art. 9; eine Angemessenheitsentscheidung liegt nicht vor. Vertragstexte und Einzelheiten erteilen wir auf Anfrage.'
          ]
        },
        {
          h: 'Speicherdauer',
          p: [
            'Berichte und abgerufene Bewertungstexte werden standardmäßig 24 Stunden gespeichert (je nach Konfiguration 1 Stunde bis 30 Tage), der E-Mail-Bestätigungslink 48 Stunden, der E-Mail-/Lead-Datensatz 180 Tage, IP-Kontingentzähler 1 Stunde und 24 Stunden. Nach Ablauf werden die Datensätze automatisch gelöscht.'
          ]
        },
        {
          h: 'Cookies und lokaler Speicher',
          p: [
            'Es wird ein einziges funktionales Cookie gesetzt: NEXT_LOCALE speichert Ihre Sprachwahl für 1 Jahr (SameSite=Lax). Cloudflare Turnstile erhält beim Seitenaufruf technische Signale Ihres Browsers zur Bot-Erkennung.',
            'Theme- und E-Mail-Präferenzen sind keine Cookies, sondern liegen im localStorage Ihres Browsers. Standardmäßig werden keine Werbe- oder Analyse-Cookies gesetzt; Plausible ist, falls aktiviert, cookielos.'
          ]
        },
        {
          h: 'Abgerufene Bewertungen (Inhalte Dritter)',
          p: [
            'Die analysierten Bewertungen sind öffentliche Inhalte der Google-Maps-Seite eines Unternehmens und gehören ihren Verfassern. Sie werden ausschließlich zur Erstellung der Zusammenfassung verarbeitet; Verfassernamen werden nicht gespeichert. Möchten Sie die Verarbeitung Ihrer Bewertung nicht, schreiben Sie an die Kontaktadresse; Ihr Anliegen wird umgehend bearbeitet.'
          ]
        },
        {
          h: 'Ihre Rechte und Anträge',
          p: [
            'Nach KVKK Art. 11 können Sie Auskunft verlangen, Informationen anfordern, Zweck und Empfänger erfahren, unvollständige oder unrichtige Daten berichtigen, löschen oder vernichten lassen und dies Empfängern mitteilen lassen, gegen ein allein automationsgestütztes Ergebnis Widerspruch einlegen und Ersatz eines Schadens verlangen.',
            'Anträge richten Sie schriftlich an die oben genannte Anschrift, per KEP oder mit qualifizierter elektronischer Signatur an die angegebene E-Mail-Adresse. Wir antworten spätestens innerhalb von 30 Tagen. Beschwerden können Sie beim türkischen Datenschutzrat einlegen.'
          ]
        }
      ]
    }
  },
  kvkk: {
    tr: {
      title: 'KVKK Aydınlatma Metni',
      intro: '6698 sayılı Kişisel Verilerin Korunması Kanunu’nun 10. maddesi uyarınca hazırlanan bu metin; veri sorumlusunun kimliği, işlenen veriler, amaçlar, hukuki sebepler, alıcılar, saklama süreleri ve başvuru yolları hakkında bilgi verir.',
      sections: [
        {
          h: 'Veri sorumlusunun kimliği',
          p: [
            `${CONTROLLER_INFO.name} — ${CONTROLLER_INFO.legalName}. Tebligat adresi: ${CONTROLLER_INFO.address}. KEP: ${CONTROLLER_INFO.kep}. E-posta: ${CONTROLLER_INFO.email}.`
          ]
        },
        {
          h: 'İşlenen veri kategorileri, amaç ve hukuki sebep',
          p: [
            'İletişim verisi — e-posta adresi ve onay kaydı: raporun e-posta ile iletilmesi ve e-posta adresinin çift onayla doğrulanması (m.5/2-c, sözleşmenin ifası).',
            'İşlem verisi — yapıştırdığınız Google Maps linki, işletme adı, sayfadan çekilen herkese açık yorum metinleri ve puanları, dil tercihi: raporun üretilmesi (m.5/2-c).',
            'Güvenlik verisi — IP adresine bağlı kota sayaçları ve istek zamanı: bot ve kötüye kullanım koruması (m.5/2-f, meşru menfaat).',
            'Hukuki yükümlülük verisi — yetkili kamu kurumlarının usulüne uygun taleplerine cevap ve uyuşmazlıklarda delil: (m.5/2-ç).',
            'Toplama yöntemi: veriler, site üzerindeki form ve otomatik sunucu kayıtları aracılığıyla elektronik ortamda toplanır.'
          ]
        },
        {
          h: 'Alıcılar ve aktarılan taraflar',
          p: [
            'Veriler, hizmetin sunulması için yalnızca kendi hizmet kapsamlarında şu tedarikçilere aktarılır: Upstash (rapor, yorum metinleri ve lead kaydı; Redis, AB bölgesi), Vercel (barındırma ve sunucu günlükleri; fra1), Apify (herkese açık Google Maps sayfasının adresi), Google AI Studio / Gemini (işletme adı, yorum metinleri ve puanları), Brevo (yalnızca e-posta adresiniz ve rapor bağlantısı), Cloudflare Turnstile (bot kontrolü için IP adresi ve tarayıcı sinyalleri). Plausible yapılandırılmışsa çerezsiz çalışır ve yalnızca sayfa görüntüleme sayıları alır.',
            'Yetkili kamu kurumlarına aktarım yalnızca usulüne uygun bir talep hâlinde ve hukuki yükümlülük kapsamında yapılır.'
          ]
        },
        {
          h: 'Yurt dışına aktarım',
          p: [
            'Adı geçen tedarikçilerin sunucuları yurt dışında olduğundan veriler yurt dışına aktarılır. Aktarım, KVKK m.9 uyarınca standart sözleşme hükümlerine dayanılarak yapılır; bu aktarımlar için verilmiş bir yeterlilik kararı bulunmamaktadır. Sözleşme metinleri ve aktarım detayları talebiniz üzerine paylaşılır.'
          ]
        },
        {
          h: 'Saklama süreleri',
          p: [
            'Rapor ve çekilen yorum metinleri varsayılan olarak 24 saat (yapılandırmaya göre 1 saat ile 30 gün arasında), e-posta doğrulama bağlantısı 48 saat, e-posta/lead kaydı 180 gün, IP kota sayaçları 1 saat ve 24 saat saklanır. Süre dolduğunda kayıtlar otomatik olarak silinir.'
          ]
        },
        {
          h: 'Çerezler',
          p: [
            'Yalnızca işlevsel bir çerez kullanılır: NEXT_LOCALE, dil tercihinizi 1 yıl boyunca hatırlar (SameSite=Lax). Bot koruması için Cloudflare Turnstile, sayfa yüklendiğinde tarayıcınızdan teknik sinyaller alır. Tema ve e-posta tercihleri localStorage’da tutulur. Varsayılan olarak reklam veya analiz çerezi kullanılmaz; Plausible etkinleştirilirse çerezsiz çalışır.'
          ]
        },
        {
          h: 'Çekilen yorumlar (üçüncü kişilere ait içerik)',
          p: [
            'Analiz edilen yorumlar, işletmenin Google Maps sayfasındaki herkese açık içeriktir ve yorum sahiplerine aittir. Bu metinler yalnızca işletme için özet rapor üretmek amacıyla işlenir; yorum yazarı adları saklanmaz. Yorumunuzun işlenmesini istemiyorsanız iletişim adresimize yazabilirsiniz; talebiniz en kısa sürede sonuçlandırılır.'
          ]
        },
        {
          h: 'm.11 kapsamındaki haklar ve başvuru yolu',
          p: [
            'Verilerinizin işlenip işlenmediğini öğrenme, bilgi talep etme, işlenme amacını ve aktarıldığı tarafları öğrenme, eksik veya yanlış verilerin düzeltilmesini, silinmesini veya yok edilmesini ve bu işlemlerin alıcılara bildirilmesini isteme, münhasıran otomatik sistemlerle yapılan analiz sonucunda aleyhinize bir sonucun ortaya çıkmasına itiraz etme ve zararın giderilmesini talep etme haklarına sahipsiniz.',
            'Başvurunuzu yazılı olarak yukarıdaki tebligat adresine, KEP adresimize veya güvenli elektronik imza ile e-posta adresimize iletebilirsiniz. Talepler en geç 30 gün içinde cevaplanır. Kişisel Verileri Koruma Kurulu’na şikâyet hakkınız saklıdır.'
          ]
        }
      ]
    },
    en: {
      title: 'Privacy Notice (KVKK/GDPR)',
      intro: 'This notice is given under article 10 of the Turkish Personal Data Protection Law (KVKK). It covers the controller, the data processed, purposes, legal bases, recipients, retention and how to apply.',
      sections: [
        {
          h: 'Data controller',
          p: [
            `${CONTROLLER_INFO.name} — ${CONTROLLER_INFO.legalName}. Address: ${CONTROLLER_INFO.address}. KEP: ${CONTROLLER_INFO.kep}. Email: ${CONTROLLER_INFO.email}.`
          ]
        },
        {
          h: 'Data categories, purpose and legal basis',
          p: [
            'Contact data — email address and confirmation record: delivering the report by email and the double opt-in check (art. 5/2-c, performance of a contract).',
            'Transaction data — the Google Maps link you paste, the business name, the public review texts and ratings fetched from that page, language preference: producing the report (art. 5/2-c).',
            'Security data — IP-based quota counters and request time: bot and abuse prevention (art. 5/2-f, legitimate interest).',
            'Compliance data — responding to lawful requests from competent authorities and evidence in disputes (art. 5/2-ç).',
            'Collection method: data is collected electronically through the form on the site and automatic server logs.'
          ]
        },
        {
          h: 'Recipients',
          p: [
            'Data is transferred only as needed to run the service and only within each provider’s scope: Upstash (report, review texts and lead record; Redis, EU region), Vercel (hosting and server logs; fra1), Apify (the public Google Maps page URL), Google AI Studio / Gemini (business name, review texts and ratings), Brevo (only your email address and the report link), Cloudflare Turnstile (IP address and browser signals for bot checks). If Plausible is configured, it runs cookieless and receives page-view counts only.',
            'Transfers to public authorities take place only on a lawful request and as required by a legal obligation.'
          ]
        },
        {
          h: 'International transfers',
          p: [
            'The providers above process data outside Türkiye. Transfers rely on the standard contractual clauses under KVKK art. 9; no adequacy decision is relied upon. The contract texts and transfer details are available on request.'
          ]
        },
        {
          h: 'Retention',
          p: [
            'Reports and fetched review texts are kept for 24 hours by default (1 hour to 30 days depending on configuration), the email verification link for 48 hours, the email/lead record for 180 days, and IP quota counters for 1 hour and 24 hours. Records are deleted automatically once the period ends.'
          ]
        },
        {
          h: 'Cookies',
          p: [
            'One functional cookie is used: NEXT_LOCALE remembers your language choice for 1 year (SameSite=Lax). For bot protection, Cloudflare Turnstile receives technical signals from your browser when the page loads. Theme and email preferences live in localStorage. No advertising or analytics cookies are set by default; if Plausible is enabled it is cookieless.'
          ]
        },
        {
          h: 'Fetched reviews (third-party content)',
          p: [
            'The reviews analysed are public content on the business’s Google Maps page and belong to their authors. They are processed only to produce a summary report for the business; author names are not stored. If you do not want your review processed, write to the contact address and your request will be handled as soon as possible.'
          ]
        },
        {
          h: 'Your rights (art. 11) and how to apply',
          p: [
            'You may learn whether your data is processed, request information, learn the purpose and the recipients, have incomplete or inaccurate data corrected, have it erased or destroyed and have this notified to recipients, object to a result arising solely from automated analysis, and claim compensation for damage.',
            'Send requests in writing to the address above, by KEP, or with a secure electronic signature to the email address above. We respond within 30 days at the latest. You may also lodge a complaint with the Turkish Personal Data Protection Board.'
          ]
        }
      ]
    },
    de: {
      title: 'KVKK-Datenschutzhinweis',
      intro: 'Dieser Hinweis erfolgt nach Artikel 10 des türkischen Datenschutzgesetzes (KVKK) und nennt Verantwortlichen, Daten, Zwecke, Rechtsgrundlagen, Empfänger, Speicherdauer und Antragswege.',
      sections: [
        {
          h: 'Verantwortlicher',
          p: [
            `${CONTROLLER_INFO.name} — ${CONTROLLER_INFO.legalName}. Anschrift: ${CONTROLLER_INFO.address}. KEP: ${CONTROLLER_INFO.kep}. E-Mail: ${CONTROLLER_INFO.email}.`
          ]
        },
        {
          h: 'Datenkategorien, Zweck und Rechtsgrundlage',
          p: [
            'Kontaktdaten — E-Mail-Adresse und Bestätigungsnachweis: E-Mail-Versand des Berichts und Double-Opt-in-Prüfung (Art. 5/2-c, Vertragserfüllung).',
            'Transaktionsdaten — der eingefügte Google-Maps-Link, der Unternehmensname, die öffentlich abgerufenen Bewertungstexte und Sterne, Sprachpräferenz: Erstellung des Berichts (Art. 5/2-c).',
            'Sicherheitsdaten — IP-basierte Kontingentzähler und Anfragezeitpunkt: Schutz vor Bots und Missbrauch (Art. 5/2-f, berechtigtes Interesse).',
            'Pflichtdaten — Beantwortung rechtmäßiger Behördenanfragen und Beweissicherung bei Streitigkeiten (Art. 5/2-ç).',
            'Erhebung: Die Daten werden elektronisch über das Formular auf der Website und automatische Server-Logs erhoben.'
          ]
        },
        {
          h: 'Empfänger',
          p: [
            'Daten werden nur soweit erforderlich und nur im jeweiligen Leistungsumfang übermittelt: Upstash (Bericht, Bewertungstexte und Lead-Datensatz; Redis, EU-Region), Vercel (Hosting und Server-Logs; fra1), Apify (die öffentliche Google-Maps-URL), Google AI Studio / Gemini (Unternehmensname, Bewertungstexte und Sterne), Brevo (nur Ihre E-Mail-Adresse und der Berichtslink), Cloudflare Turnstile (IP-Adresse und Browsersignale zur Bot-Erkennung). Ist Plausible konfiguriert, arbeitet es cookielos und erhält nur Seitenaufrufzahlen.',
            'Übermittlungen an Behörden erfolgen nur auf rechtmäßige Anfrage und soweit eine gesetzliche Pflicht besteht.'
          ]
        },
        {
          h: 'Drittlandübermittlung',
          p: [
            'Die genannten Anbieter verarbeiten Daten außerhalb der Türkei. Die Übermittlung stützt sich auf die Standardvertragsklauseln nach KVKK Art. 9; eine Angemessenheitsentscheidung liegt nicht vor. Vertragstexte und Einzelheiten erteilen wir auf Anfrage.'
          ]
        },
        {
          h: 'Speicherdauer',
          p: [
            'Berichte und abgerufene Bewertungstexte werden standardmäßig 24 Stunden gespeichert (je nach Konfiguration 1 Stunde bis 30 Tage), der E-Mail-Bestätigungslink 48 Stunden, der E-Mail-/Lead-Datensatz 180 Tage, IP-Kontingentzähler 1 Stunde und 24 Stunden. Nach Ablauf werden die Datensätze automatisch gelöscht.'
          ]
        },
        {
          h: 'Cookies',
          p: [
            'Es wird ein einziges funktionales Cookie gesetzt: NEXT_LOCALE speichert Ihre Sprachwahl für 1 Jahr (SameSite=Lax). Cloudflare Turnstile erhält beim Seitenaufruf technische Signale Ihres Browsers zur Bot-Erkennung. Theme- und E-Mail-Präferenzen liegen im localStorage. Standardmäßig werden keine Werbe- oder Analyse-Cookies gesetzt; Plausible ist, falls aktiviert, cookielos.'
          ]
        },
        {
          h: 'Abgerufene Bewertungen (Inhalte Dritter)',
          p: [
            'Die analysierten Bewertungen sind öffentliche Inhalte der Google-Maps-Seite eines Unternehmens und gehören ihren Verfassern. Sie werden ausschließlich zur Erstellung der Zusammenfassung verarbeitet; Verfassernamen werden nicht gespeichert. Möchten Sie die Verarbeitung Ihrer Bewertung nicht, schreiben Sie an die Kontaktadresse; Ihr Anliegen wird umgehend bearbeitet.'
          ]
        },
        {
          h: 'Rechte nach Art. 11 und Antragsweg',
          p: [
            'Sie können Auskunft verlangen, Informationen anfordern, Zweck und Empfänger erfahren, unvollständige oder unrichtige Daten berichtigen, löschen oder vernichten lassen und dies Empfängern mitteilen lassen, gegen ein allein automationsgestütztes Ergebnis Widerspruch einlegen und Ersatz eines Schadens verlangen.',
            'Anträge richten Sie schriftlich an die oben genannte Anschrift, per KEP oder mit qualifizierter elektronischer Signatur an die angegebene E-Mail-Adresse. Wir antworten spätestens innerhalb von 30 Tagen. Beschwerden können Sie beim türkischen Datenschutzrat einlegen.'
          ]
        }
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

export function getLegalDoc(slug: LegalSlug, locale: string): LegalDocResult {
  const bySlug = DOCS[slug];
  if (bySlug) {
    const localized = bySlug[locale];
    const doc = localized || bySlug.en;
    if (doc) return { doc, fallbackNote: localized ? '' : FALLBACK_NOTE[locale] || '', fallback: !localized };
  }
  // sss: içerik FAQ verisinden sayfada üretilir. `FAQS` 10 dilin tamamında
  // tanımlı olduğu için bu yol hiçbir dilde çeviri düşmez → `fallback: false`.
  const meta = getLegalMeta(slug, locale);
  return {
    doc: { title: meta.title.replace(' — TrueReviews', ''), intro: meta.description, sections: [] },
    fallbackNote: '',
    fallback: false
  };
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

export function isLegalSlug(s: string): s is LegalSlug {
  return (LEGAL_SLUGS as string[]).includes(s);
}
