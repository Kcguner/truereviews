import { afterEach, describe, expect, it } from 'vitest';
import { getAdminEmails, isAdminEmail } from '../lib/admin';

const PREV = process.env.ADMIN_EMAILS;

afterEach(() => {
  if (PREV === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = PREV;
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
