import { afterEach, describe, expect, it } from 'vitest';
import { getAdminEmails, isAdminBypass, isAdminEmail } from '../lib/admin';

const PREV = process.env.ADMIN_EMAILS;
const PREV_TOKEN = process.env.ADMIN_BYPASS_TOKEN;

afterEach(() => {
  if (PREV === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = PREV;
  if (PREV_TOKEN === undefined) delete process.env.ADMIN_BYPASS_TOKEN;
  else process.env.ADMIN_BYPASS_TOKEN = PREV_TOKEN;
});

describe('admin bypass listesi', () => {
  it('boşken kimse admin değildir', () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminEmail('ben@mail.com')).toBe(false);
    expect(getAdminEmails()).toEqual([]);
  });
  it('listedeki adresi büyük/küçük harf ve boşluklardan bağımsız tanır', () => {
    process.env.ADMIN_EMAILS = ' Ben@Mail.com , ekip@sirket.com ';
    expect(isAdminEmail('ben@mail.com')).toBe(true);
    expect(isAdminEmail('  EKIP@sirket.com')).toBe(true);
    expect(isAdminEmail('baskasi@mail.com')).toBe(false);
  });
});

describe('admin bypass anahtarı', () => {
  it('token tanımlı değilse kimse muaf değildir', () => {
    delete process.env.ADMIN_BYPASS_TOKEN;
    expect(isAdminBypass('herhangi')).toBe(false);
    expect(isAdminBypass('')).toBe(false);
    expect(isAdminBypass(null)).toBe(false);
  });
  it('değer birebir eşleşirse muafiyet verir', () => {
    process.env.ADMIN_BYPASS_TOKEN = 'gizli-anahtar-123';
    expect(isAdminBypass('gizli-anahtar-123')).toBe(true);
    expect(isAdminBypass('GİZLİ-ANAHTAR-123')).toBe(false);
    expect(isAdminBypass('yanlis')).toBe(false);
  });

  // Regresyon: /api/lead yetkisini gövdedeki `email` üzerinden veriyordu;
  // ADMIN_EMAILS'teki bir adresi bilmek, e-posta sahipliği doğrulanmadan
  // double opt-in'i atlatmaya yetiyordu. Yetki ARTIK yalnızca anahtardan gelir.
  it('ADMIN_EMAILS listesindeki bir e-posta tek başına muafiyet vermez', () => {
    process.env.ADMIN_EMAILS = 'ben@mail.com';
    process.env.ADMIN_BYPASS_TOKEN = 'gizli-anahtar-123';
    expect(isAdminEmail('ben@mail.com')).toBe(true); // liste yardımcı olarak çalışır
    expect(isAdminBypass('ben@mail.com')).toBe(false); // ama yetki kapısı açmaz
    expect(isAdminBypass('gizli-anahtar-123')).toBe(true);
  });

  it('farklı uzunluklu anahtar timingSafeEqual ile patlatmaz', () => {
    process.env.ADMIN_BYPASS_TOKEN = 'kisa';
    expect(() => isAdminBypass('çok-uzun-bir-anahtar-değeri')).not.toThrow();
    expect(isAdminBypass('çok-uzun-bir-anahtar-değeri')).toBe(false);
  });
});
