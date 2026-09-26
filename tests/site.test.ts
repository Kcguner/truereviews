import { afterEach, describe, expect, it } from 'vitest';
import { SOCIAL_LINKS, getContactEmail, getSiteUrl } from '../lib/site';

afterEach(() => {
  delete process.env.APP_URL;
  delete process.env.NEXT_PUBLIC_CONTACT_EMAIL;
});

describe('getSiteUrl', () => {
  it('env yoksa fallback döner', () => {
    expect(getSiteUrl()).toBe('https://get-truereviews.vercel.app');
  });
  it('sondaki slashleri temizler', () => {
    process.env.APP_URL = 'https://ornek.com///';
    expect(getSiteUrl()).toBe('https://ornek.com');
  });
});

describe('SOCIAL_LINKS', () => {
  it('github, instagram ve x — hepsi bir kez', () => {
    expect(SOCIAL_LINKS.map((s) => s.key)).toEqual(['github', 'instagram', 'x']);
  });

  it('hepsi mutlak https URL', () => {
    for (const s of SOCIAL_LINKS) {
      expect(s.href, s.key).toMatch(/^https:\/\//);
    }
  });

  // next/image ve linkler target="_blank" ile açılıyor; _blank güvenlik için
  // noopener zorunlu, aksi halde yeni sekme opener üzerinden erişebilir.
  it('ana sayfa adresi değil, sosyal profil adresi', () => {
    for (const s of SOCIAL_LINKS) {
      expect(s.href.includes('get-truereviews.vercel.app'), s.key).toBe(false);
    }
  });

  // "X" tek karakterlik bir marka adı — boş olmamalı, uzunluk şartı yok.
  it('her linkin görünen etiketi var', () => {
    for (const s of SOCIAL_LINKS) {
      expect(s.label.trim().length, s.key).toBeGreaterThan(0);
    }
  });
});

describe('getContactEmail', () => {
  it('env yoksa null döner (iletişim bloğu gizlenir)', () => {
    expect(getContactEmail()).toBeNull();
  });
  it('env varsa döndürür', () => {
    process.env.NEXT_PUBLIC_CONTACT_EMAIL = 'ornek@ornek.com';
    expect(getContactEmail()).toBe('ornek@ornek.com');
  });
});
