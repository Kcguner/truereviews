import { afterEach, describe, expect, it } from 'vitest';
import { getSiteUrl } from '../lib/site';

afterEach(() => {
  delete process.env.APP_URL;
});

describe('getSiteUrl', () => {
  it('env yoksa fallback döner', () => {
    expect(getSiteUrl()).toBe('https://ornek.vercel.app');
  });
  it('sondaki slashleri temizler', () => {
    process.env.APP_URL = 'https://ornek.com///';
    expect(getSiteUrl()).toBe('https://ornek.com');
  });
});
