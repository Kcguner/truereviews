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
      q: 'TrueReviews ücretsiz mi?',
      a: 'Evet. Önizleme ücretsiz ve kayıt gerektirmez; tam rapor e-posta onayı ile açılır. Reklam ve seri mail gönderilmez.'
    },
    {
      q: 'Yorumlarım değiştiriliyor mu?',
      a: 'Hayır. Yorumların içeriği değiştirilmez, silinmez ve satın alınmaz. Alıntılar gerçek yorumlardan kısaltılmıştır.'
    },
    {
      q: 'Kaç yorum okunuyor?',
      a: 'Son ~20 yorumunuz tek tek okunuyor; çıkan rapor 24 saat saklanıyor, aynı linke gün içinde tekrar bakmak yeni analiz sayılmıyor.'
    },
    {
      q: 'Tam rapor için e-posta neden isteniyor?',
      a: 'Raporun tamamı e-posta onayıyla açılıyor; adresiniz yalnızca bu rapor için kullanılıyor, reklam ve toplu mail gönderilmiyor.'
    },
    {
      q: 'Önizleme ne kadar sürüyor?',
      a: 'Önizleme genelde 40 saniye civarında hazır; tam rapor e-posta onayından sonra açılıyor.'
    },
    {
      q: 'Verilerim nasıl korunuyor?',
      a: 'Linkiniz ve e-postanız yalnızca rapor için işleniyor; silinmesini isterseniz İletişim sayfasından yazmanız yeterli. Detay Gizlilik Politikası ve KVKK metninde.'
    }
  ],
  en: [
    {
      q: 'How does the Google Maps review analysis work?',
      a: 'Paste your Google Maps business link; recent reviews are read and turned into a one-page honest summary: a satisfaction score, recurring praise and complaints, and one concrete step for this week.'
    },
    {
      q: 'Is TrueReviews free?',
      a: 'Yes. The preview is free with no sign-up; the full report unlocks after email confirmation. No ads, no newsletter spam.'
    },
    {
      q: 'Are my reviews modified?',
      a: 'No. Review content is never edited, deleted or bought. Quotes are shortened excerpts of real reviews.'
    },
    {
      q: 'How many reviews are read?',
      a: "Your latest ~20 reviews are read one by one; the report is stored for 24 hours, so re-checking the same link within a day doesn't count as a new analysis."
    },
    {
      q: 'Why do you ask for my email for the full report?',
      a: 'The full report unlocks with email confirmation; your address is used only for this report — no ads, no newsletters.'
    },
    {
      q: 'How long does the preview take?',
      a: 'The preview is usually ready in about 40 seconds; the full report opens after email confirmation.'
    },
    {
      q: 'How is my data protected?',
      a: 'Your link and email are processed only to generate the report; write to us via the Contact page any time to delete them. Details are in the Privacy Policy.'
    }
  ],
  de: [
    {
      q: 'Wie funktioniert die Google-Maps-Bewertungsanalyse?',
      a: 'Fügen Sie Ihren Google-Maps-Unternehmenslink ein; aktuelle Bewertungen werden gelesen und zu einer einseitigen ehrlichen Zusammenfassung verdichtet: Zufriedenheitsscore, wiederkehrende Lob- und Kritikthemen und ein konkreter Schritt für diese Woche.'
    },
    {
      q: 'Ist TrueReviews kostenlos?',
      a: 'Ja. Die Vorschau ist kostenlos ohne Registrierung; der vollständige Bericht wird nach E-Mail-Bestätigung freigeschaltet.'
    },
    {
      q: 'Werden meine Bewertungen verändert?',
      a: 'Nein. Bewertungsinhalte werden weder bearbeitet noch gelöscht noch gekauft.'
    },
    {
      q: 'Wie viele Bewertungen werden gelesen?',
      a: 'Ihre neuesten ~20 Bewertungen werden einzeln gelesen; der Bericht wird 24 Stunden gespeichert, eine erneute Prüfung desselben Links am gleichen Tag zählt nicht als neue Analyse.'
    },
    {
      q: 'Warum brauchen Sie meine E-Mail für den vollständigen Bericht?',
      a: 'Der vollständige Bericht wird per E-Mail-Bestätigung freigeschaltet; Ihre Adresse dient nur diesem Bericht — keine Werbung, keine Newsletter.'
    },
    {
      q: 'Wie lange dauert die Vorschau?',
      a: 'Die Vorschau ist meist in etwa 40 Sekunden fertig; der vollständige Bericht öffnet sich nach der E-Mail-Bestätigung.'
    },
    {
      q: 'Wie werden meine Daten geschützt?',
      a: 'Link und E-Mail werden nur zur Berichtserstellung verarbeitet; zur Löschung schreiben Sie uns über die Kontaktseite. Details in der Datenschutzerklärung.'
    }
  ],
  fr: [
    {
      q: "Comment fonctionne l'analyse d'avis Google Maps ?",
      a: "Collez le lien de votre établissement ; les avis récents sont lus et résumés en une page : score de satisfaction, éloges et plaintes récurrentes, et une action concrète pour cette semaine."
    },
    {
      q: 'TrueReviews est-il gratuit ?',
      a: "Oui. L'aperçu est gratuit sans inscription ; le rapport complet est débloqué après confirmation de votre e-mail."
    },
    {
      q: 'Mes avis sont-ils modifiés ?',
      a: "Non. Le contenu des avis n'est jamais modifié, supprimé ni acheté."
    },
    {
      q: "Combien d'avis sont lus ?",
      a: "Vos ~20 avis les plus récents sont lus un par un ; le rapport est conservé 24 heures, revérifier le même lien le jour même ne compte pas comme une nouvelle analyse."
    },
    {
      q: 'Pourquoi demander mon e-mail pour le rapport complet ?',
      a: "Le rapport complet se débloque après confirmation de votre e-mail ; votre adresse sert uniquement à ce rapport — ni publicité, ni newsletters."
    },
    {
      q: "Combien de temps prend l'aperçu ?",
      a: "L'aperçu est généralement prêt en 40 secondes environ ; le rapport complet s'ouvre après la confirmation de votre e-mail."
    },
    {
      q: 'Comment mes données sont-elles protégées ?',
      a: 'Votre lien et votre e-mail servent uniquement à générer le rapport ; écrivez-nous via la page Contact pour les supprimer. Détails dans la politique de confidentialité.'
    }
  ],
  es: [
    {
      q: '¿Cómo funciona el análisis de reseñas de Google Maps?',
      a: 'Pega el enlace de tu negocio; las reseñas recientes se leen y se resumen en una página: puntuación, elogios y quejas recurrentes, y una acción concreta para esta semana.'
    },
    {
      q: '¿TrueReviews es gratis?',
      a: 'Sí. La vista previa es gratis sin registro; el informe completo se desbloquea tras confirmar tu correo.'
    },
    {
      q: '¿Se modifican mis reseñas?',
      a: 'No. El contenido nunca se edita, se elimina ni se compra.'
    },
    {
      q: '¿Cuántas reseñas se leen?',
      a: 'Tus ~20 reseñas más recientes se leen una por una; el informe se guarda 24 horas, volver a revisar el mismo enlace el mismo día no cuenta como un análisis nuevo.'
    },
    {
      q: '¿Por qué piden mi correo para el informe completo?',
      a: 'El informe completo se desbloquea tras confirmar tu correo; tu dirección solo se usa para este informe — sin publicidad ni newsletters.'
    },
    {
      q: '¿Cuánto tarda la vista previa?',
      a: 'La vista previa suele estar lista en unos 40 segundos; el informe completo se abre tras confirmar tu correo.'
    },
    {
      q: '¿Cómo se protegen mis datos?',
      a: 'Tu enlace y tu correo solo se usan para generar el informe; escríbenos desde la página de contacto para eliminarlos. Detalles en la política de privacidad.'
    }
  ],
  nl: [
    {
      q: 'Hoe werkt de Google Maps-reviewanalyse?',
      a: 'Plak de link van je bedrijf; recente reviews worden gelezen en samengevat op één pagina: score, terugkerende plus- en minpunten en één concrete actie voor deze week.'
    },
    {
      q: 'Is TrueReviews gratis?',
      a: 'Ja. De preview is gratis zonder registratie; het volledige rapport volgt na e-mailbevestiging.'
    },
    {
      q: 'Worden mijn reviews gewijzigd?',
      a: 'Nee. Inhoud wordt nooit bewerkt, verwijderd of gekocht.'
    },
    {
      q: 'Hoeveel reviews worden er gelezen?',
      a: 'Je ~20 meest recente reviews worden één voor één gelezen; het rapport wordt 24 uur bewaard, dezelfde link opnieuw checken op dezelfde dag telt niet als nieuwe analyse.'
    },
    {
      q: 'Waarom vragen jullie mijn e-mail voor het volledige rapport?',
      a: 'Het volledige rapport wordt ontgrendeld na e-mailbevestiging; je adres dient alleen voor dit rapport — geen advertenties, geen nieuwsbrieven.'
    },
    {
      q: 'Hoe lang duurt de preview?',
      a: "De preview is meestal binnen zo'n 40 seconden klaar; het volledige rapport opent na de e-mailbevestiging."
    },
    {
      q: 'Hoe worden mijn gegevens beschermd?',
      a: 'Je link en e-mail worden alleen gebruikt om het rapport te maken; schrijf ons via de contactpagina om ze te laten verwijderen. Details in het privacybeleid.'
    }
  ],
  ar: [
    {
      q: 'كيف يعمل تحليل تقييمات خرائط Google؟',
      a: 'الصق رابط منشأتك؛ تُقرأ التقييمات الأخيرة وتُلخَّص في صفحة واحدة: درجة الرضا، وأبرز المدح والشكاوى المتكررة، وخطوة عملية واحدة لهذا الأسبوع.'
    },
    {
      q: 'هل TrueReviews مجاني؟',
      a: 'نعم. المعاينة مجانية دون تسجيل؛ ويُفتح التقرير الكامل بعد تأكيد بريدك الإلكتروني.'
    },
    {
      q: 'هل تُعدَّل تقييماتي؟',
      a: 'لا. لا يُحرَّر المحتوى ولا يُحذف ولا يُشترى أبدًا.'
    },
    {
      q: 'كم عدد التقييمات التي تُقرأ؟',
      a: 'تُقرأ أحدث ~20 تقييمًا لمنشأتك واحدًا واحدًا؛ ويُحفظ التقرير 24 ساعة، فإعادة فحص الرابط نفسه في اليوم نفسه لا تُحتسب تحليلًا جديدًا.'
    },
    {
      q: 'لماذا تطلبون بريدي الإلكتروني للتقرير الكامل؟',
      a: 'يُفتح التقرير الكامل بعد تأكيد بريدك؛ ويُستخدم عنوانك لهذا التقرير فقط — لا إعلانات ولا رسائل جماعية.'
    },
    {
      q: 'كم تستغرق المعاينة؟',
      a: 'تكون المعاينة جاهزة عادة خلال 40 ثانية تقريبًا؛ ويُفتح التقرير الكامل بعد تأكيد بريدك.'
    },
    {
      q: 'كيف تُحمى بياناتي؟',
      a: 'يُستخدم رابطك وبريدك لإنشاء التقرير فقط؛ راسلنا عبر صفحة اتصل بنا لحذفهما. التفاصيل في سياسة الخصوصية.'
    }
  ],
  ru: [
    {
      q: 'Как работает анализ отзывов Google Maps?',
      a: 'Вставьте ссылку на вашу компанию; свежие отзывы читаются и сводятся на одну страницу: оценка, повторяющиеся похвалы и жалобы и один конкретный шаг на неделю.'
    },
    {
      q: 'TrueReviews бесплатный?',
      a: 'Да. Предпросмотр бесплатен без регистрации; полный отчёт открывается после подтверждения e-mail.'
    },
    {
      q: 'Мои отзывы изменяются?',
      a: 'Нет. Содержимое никогда не редактируется, не удаляется и не покупается.'
    },
    {
      q: 'Сколько отзывов читается?',
      a: 'Ваши последние ~20 отзывов читаются по одному; отчёт хранится 24 часа, повторная проверка той же ссылки в тот же день не считается новым анализом.'
    },
    {
      q: 'Зачем вам мой e-mail для полного отчёта?',
      a: 'Полный отчёт открывается после подтверждения e-mail; ваш адрес используется только для этого отчёта — никакой рекламы и рассылок.'
    },
    {
      q: 'Сколько времени занимает предпросмотр?',
      a: 'Предпросмотр обычно готов примерно за 40 секунд; полный отчёт открывается после подтверждения e-mail.'
    },
    {
      q: 'Как защищены мои данные?',
      a: 'Ваши ссылка и e-mail используются только для создания отчёта; напишите нам через страницу контактов, чтобы удалить их. Подробности — в политике конфиденциальности.'
    }
  ],
  fa: [
    {
      q: 'تحلیل نظرات گوگل‌مپس چگونه کار می‌کند؟',
      a: 'پیوند کسب‌وکارتان را بچسبانید؛ نظرات اخیر خوانده و در یک صفحه خلاصه می‌شود: امتیاز رضایت، تحسین‌ها و شکایت‌های پرتکرار و یک اقدام مشخص برای این هفته.'
    },
    {
      q: 'آیا TrueReviews رایگان است؟',
      a: 'بله. پیش‌نمایش بدون ثبت‌نام رایگان است؛ گزارش کامل پس از تأیید ایمیل باز می‌شود.'
    },
    {
      q: 'آیا نظرات من تغییر می‌کند؟',
      a: 'خیر. محتوا هرگز ویرایش، حذف یا خریداری نمی‌شود.'
    },
    {
      q: 'چند نظر خوانده می‌شود؟',
      a: 'حدود ۲۰ نظر اخیر کسب‌وکارتان تک‌تک خوانده می‌شود؛ گزارش ۲۴ ساعت نگه‌داری می‌شود و بررسی دوباره همان پیوند در همان روز تحلیل جدید حساب نمی‌شود.'
    },
    {
      q: 'چرا برای گزارش کامل ایمیل می‌خواهید؟',
      a: 'گزارش کامل پس از تأیید ایمیل باز می‌شود؛ نشانی شما فقط برای همین گزارش استفاده می‌شود — بدون تبلیغات و ایمیل گروهی.'
    },
    {
      q: 'پیش‌نمایش چقدر طول می‌کشد؟',
      a: 'پیش‌نمایش معمولاً در حدود ۴۰ ثانیه آماده می‌شود؛ گزارش کامل پس از تأیید ایمیل باز می‌شود.'
    },
    {
      q: 'داده‌های من چگونه محافظت می‌شود؟',
      a: 'پیوند و ایمیل شما فقط برای تهیه گزارش استفاده می‌شود؛ برای حذف آن‌ها از صفحه تماس پیام بدهید. جزئیات در سیاست حریم خصوصی.'
    }
  ],
  az: [
    {
      q: 'Google Maps rəy təhlili necə işləyir?',
      a: 'Müəssisə linkini yapışdırın; son rəylər oxunub bir səhifədə xülasə olunur: məmnuniyyət balı, təkrarlanan tərif və şikayətlər və bu həftə üçün bir konkret addım.'
    },
    {
      q: 'TrueReviews pulsuzdur?',
      a: 'Bəli. Önizləmə qeydiyyatsız pulsuzdur; tam hesabat e-poçt təsdiqindən sonra açılır.'
    },
    {
      q: 'Rəylərim dəyişdirilir?',
      a: 'Xeyr. Məzmun heç vaxt redaktə edilmir, silinmir və satın alınmır.'
    },
    {
      q: 'Neçə rəy oxunur?',
      a: 'Müəssisənizin son ~20 rəyi tək-tək oxunur; hesabat 24 saat saxlanılır, eyni linkə gün ərzində təkrar baxmaq yeni təhlil sayılmır.'
    },
    {
      q: 'Tam hesabat üçün e-poçtumu niyə istəyirsiniz?',
      a: 'Tam hesabat e-poçt təsdiqindən sonra açılır; ünvanınız yalnız bu hesabat üçün istifadə olunur — reklam və kütləvi mail yoxdur.'
    },
    {
      q: 'Önizləmə nə qədər çəkir?',
      a: 'Önizləmə adətən 40 saniyə ətrafında hazır olur; tam hesabat e-poçt təsdiqindən sonra açılır.'
    },
    {
      q: 'Məlumatlarım necə qorunur?',
      a: 'Linkiniz və e-poçtunuz yalnız hesabat üçün işlənir; silinməsini istəsəniz Əlaqə səhifəsindən yazın. Təfərrüat Məxfilik siyasətində.'
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
