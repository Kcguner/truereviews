/**
 * Onay bağlantısı YENİ bir sekmede açıldığında asıl sekmenin de kilidini
 * açan kanal. Aynı origin'deki sayfalar arasında çalışır; başka bir domain
 * bu kanala mesaj gönderemez, bu yüzden rapor gövdesini taşımak güvenli.
 *
 * Neden gerekli: çift onay (double opt-in) yüzünden rapor ancak e-postadaki
 * link açılınca açılıyor. Link yeni sekmede açılırsa eski sekme boşuna
 * "Açıldı" deyip kilitli kalıyordu; kullanıcı raporu göremediği için akış
 * kopuyordu.
 */
export const UNLOCK_CHANNEL = 'tr-report-unlock';

export type UnlockMessage = {
  reportId: string;
  report: unknown;
  email: string;
};
