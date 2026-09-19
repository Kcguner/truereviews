export type Faq = { q: string; a: string };

/**
 * 10 dilde SSS. Hem görünür SSS bölümü hem FAQPage JSON-LD buradan beslenir
 * (ikisi birebir aynı olmalı — Google görünmez FAQ'ya rich result vermez).
 */
export const FAQS: Record<string, Faq[]> = {
  tr: [
    {
      q: 'Google Maps yorum analizi nasıl çalışır?',
      a: 'Google Maps işletme linkinizi yapıştırıyorsunuz; son yorumlar okunup size tek sayfalık dürüst bir özet çıkarılıyor: memnuniyet skoru, en çok tekrar eden övgü ve şikayetler ve bu hafta atabileceğiniz tek somut adım.'
    },
    {
      q: 'YorumAnalizi ücretsiz mi?',
      a: 'Evet. Önizleme ücretsiz ve kayıt gerektirmez; tam rapor e-posta onayı ile açılır. Reklam ve seri mail gönderilmez.'
    },
    {
      q: 'Yorumlarım değiştiriliyor mu?',
      a: 'Hayır. Yorumların içeriği değiştirilmez, silinmez ve satın alınmaz. Alıntılar gerçek yorumlardan kısaltılmıştır.'
    }
  ],
  en: [
    {
      q: 'How does the Google Maps review analysis work?',
      a: 'Paste your Google Maps business link; recent reviews are read and turned into a one-page honest summary: a satisfaction score, recurring praise and complaints, and one concrete step for this week.'
    },
    {
      q: 'Is YorumAnalizi free?',
      a: 'Yes. The preview is free with no sign-up; the full report unlocks after email confirmation. No ads, no newsletter spam.'
    },
    {
      q: 'Are my reviews modified?',
      a: 'No. Review content is never edited, deleted or bought. Quotes are shortened excerpts of real reviews.'
    }
  ],
  de: [
    {
      q: 'Wie funktioniert die Google-Maps-Bewertungsanalyse?',
      a: 'Fügen Sie Ihren Google-Maps-Unternehmenslink ein; aktuelle Bewertungen werden gelesen und zu einer einseitigen ehrlichen Zusammenfassung verdichtet: Zufriedenheitsscore, wiederkehrende Lob- und Kritikthemen und ein konkreter Schritt für diese Woche.'
    },
    {
      q: 'Ist YorumAnalizi kostenlos?',
      a: 'Ja. Die Vorschau ist kostenlos ohne Registrierung; der vollständige Bericht wird nach E-Mail-Bestätigung freigeschaltet.'
    },
    {
      q: 'Werden meine Bewertungen verändert?',
      a: 'Nein. Bewertungsinhalte werden weder bearbeitet noch gelöscht noch gekauft.'
    }
  ],
  fr: [
    {
      q: "Comment fonctionne l'analyse d'avis Google Maps ?",
      a: "Collez le lien de votre établissement ; les avis récents sont lus et résumés en une page : score de satisfaction, éloges et plaintes récurrentes, et une action concrète pour cette semaine."
    },
    {
      q: 'YorumAnalizi est-il gratuit ?',
      a: "Oui. L'aperçu est gratuit sans inscription ; le rapport complet est débloqué après confirmation de votre e-mail."
    },
    {
      q: 'Mes avis sont-ils modifiés ?',
      a: "Non. Le contenu des avis n'est jamais modifié, supprimé ni acheté."
    }
  ],
  es: [
    {
      q: '¿Cómo funciona el análisis de reseñas de Google Maps?',
      a: 'Pega el enlace de tu negocio; las reseñas recientes se leen y se resumen en una página: puntuación, elogios y quejas recurrentes, y una acción concreta para esta semana.'
    },
    {
      q: '¿YorumAnalizi es gratis?',
      a: 'Sí. La vista previa es gratis sin registro; el informe completo se desbloquea tras confirmar tu correo.'
    },
    {
      q: '¿Se modifican mis reseñas?',
      a: 'No. El contenido nunca se edita, se elimina ni se compra.'
    }
  ],
  nl: [
    {
      q: 'Hoe werkt de Google Maps-reviewanalyse?',
      a: 'Plak de link van je bedrijf; recente reviews worden gelezen en samengevat op één pagina: score, terugkerende plus- en minpunten en één concrete actie voor deze week.'
    },
    {
      q: 'Is YorumAnalizi gratis?',
      a: 'Ja. De preview is gratis zonder registratie; het volledige rapport volgt na e-mailbevestiging.'
    },
    {
      q: 'Worden mijn reviews gewijzigd?',
      a: 'Nee. Inhoud wordt nooit bewerkt, verwijderd of gekocht.'
    }
  ],
  ar: [
    {
      q: 'كيف يعمل تحليل تقييمات خرائط Google؟',
      a: 'الصق رابط منشأتك؛ تُقرأ التقييمات الأخيرة وتُلخَّص في صفحة واحدة: درجة الرضا، وأبرز المدح والشكاوى المتكررة، وخطوة عملية واحدة لهذا الأسبوع.'
    },
    {
      q: 'هل YorumAnalizi مجاني؟',
      a: 'نعم. المعاينة مجانية دون تسجيل؛ ويُفتح التقرير الكامل بعد تأكيد بريدك الإلكتروني.'
    },
    {
      q: 'هل تُعدَّل تقييماتي؟',
      a: 'لا. لا يُحرَّر المحتوى ولا يُحذف ولا يُشترى أبدًا.'
    }
  ],
  ru: [
    {
      q: 'Как работает анализ отзывов Google Maps?',
      a: 'Вставьте ссылку на вашу компанию; свежие отзывы читаются и сводятся на одну страницу: оценка, повторяющиеся похвалы и жалобы и один конкретный шаг на неделю.'
    },
    {
      q: 'YorumAnalizi бесплатный?',
      a: 'Да. Предпросмотр бесплатен без регистрации; полный отчёт открывается после подтверждения e-mail.'
    },
    {
      q: 'Мои отзывы изменяются?',
      a: 'Нет. Содержимое никогда не редактируется, не удаляется и не покупается.'
    }
  ],
  fa: [
    {
      q: 'تحلیل نظرات گوگل‌مپس چگونه کار می‌کند؟',
      a: 'پیوند کسب‌وکارتان را بچسبانید؛ نظرات اخیر خوانده و در یک صفحه خلاصه می‌شود: امتیاز رضایت، تحسین‌ها و شکایت‌های پرتکرار و یک اقدام مشخص برای این هفته.'
    },
    {
      q: 'آیا YorumAnalizi رایگان است؟',
      a: 'بله. پیش‌نمایش بدون ثبت‌نام رایگان است؛ گزارش کامل پس از تأیید ایمیل باز می‌شود.'
    },
    {
      q: 'آیا نظرات من تغییر می‌کند؟',
      a: 'خیر. محتوا هرگز ویرایش، حذف یا خریداری نمی‌شود.'
    }
  ],
  az: [
    {
      q: 'Google Maps rəy təhlili necə işləyir?',
      a: 'Müəssisə linkini yapışdırın; son rəylər oxunub bir səhifədə xülasə olunur: məmnuniyyət balı, təkrarlanan tərif və şikayətlər və bu həftə üçün bir konkret addım.'
    },
    {
      q: 'YorumAnalizi pulsuzdur?',
      a: 'Bəli. Önizləmə qeydiyyatsız pulsuzdur; tam hesabat e-poçt təsdiqindən sonra açılır.'
    },
    {
      q: 'Rəylərim dəyişdirilir?',
      a: 'Xeyr. Məzmun heç vaxt redaktə edilmir, silinmir və satın alınmır.'
    }
  ]
};

export function getFaqs(locale: string): Faq[] {
  return FAQS[locale] || FAQS.en;
}

const FAQ_HEADING: Record<string, string> = {
  tr: 'Sık sorulanlar',
  en: 'Frequently asked questions',
  de: 'Häufige Fragen',
  fr: 'Questions fréquentes',
  es: 'Preguntas frecuentes',
  nl: 'Veelgestelde vragen',
  ar: 'الأسئلة الشائعة',
  ru: 'Частые вопросы',
  fa: 'سؤالات پرتکرار',
  az: 'Tez-tez verilən suallar'
};

export function getFaqHeading(locale: string): string {
  return FAQ_HEADING[locale] || FAQ_HEADING.en;
}
