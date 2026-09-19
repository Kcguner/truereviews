import { describe, expect, it } from 'vitest';
import { isDisposableEmail, isValidEmailFormat, verifyTurnstile } from '../lib/validation';

describe('isValidEmailFormat', () => {
  it('geçerli adresleri kabul eder', () => {
    expect(isValidEmailFormat('ornek@sirket.com')).toBe(true);
    expect(isValidEmailFormat('  Ad.Soyad+etiket@Example.COM  ')).toBe(true);
  });
  it('geçersiz adresleri reddeder', () => {
    expect(isValidEmailFormat('')).toBe(false);
    expect(isValidEmailFormat('plainaddress')).toBe(false);
    expect(isValidEmailFormat('a@b')).toBe(false);
    expect(isValidEmailFormat('a@b.c')).toBe(false);
  });
});

describe('isDisposableEmail', () => {
  it('kurumsal adresleri geçici saymaz', () => {
    expect(isDisposableEmail('ornek@sirket.com')).toBe(false);
    expect(isDisposableEmail('a@gmail.com')).toBe(false);
  });
  it('bilinen geçici domainleri yakalar', () => {
    expect(isDisposableEmail('a@mailinator.com')).toBe(true);
    expect(isDisposableEmail('a@10minutemail.com')).toBe(true);
  });
});

describe('verifyTurnstile', () => {
  it('secret yoksa pasif modda true döner', async () => {
    delete process.env.TURNSTILE_SECRET_KEY;
    await expect(verifyTurnstile(null, null)).resolves.toBe(true);
  });
});
