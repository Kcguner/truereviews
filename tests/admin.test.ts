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
});
