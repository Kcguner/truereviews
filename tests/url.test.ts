import { describe, expect, it } from 'vitest';
import { isGoogleMapsUrl } from '../lib/types';

describe('isGoogleMapsUrl', () => {
  it('klasik Google Maps linklerini kabul eder', () => {
    expect(isGoogleMapsUrl('https://www.google.com/maps/place/Test/@40.9,29.0,17z')).toBe(true);
    expect(isGoogleMapsUrl('https://maps.google.com/?q=restoran')).toBe(true);
    expect(isGoogleMapsUrl('https://www.google.com.tr/maps/place/Test')).toBe(true);
    expect(isGoogleMapsUrl('https://www.google.com/maps/search/?api=1&query=kebap')).toBe(true);
  });
  it('kısa linkleri kabul eder (goo.gl + g.page)', () => {
    expect(isGoogleMapsUrl('https://maps.app.goo.gl/abc123XYZ')).toBe(true);
    expect(isGoogleMapsUrl('https://goo.gl/maps/abc123')).toBe(true);
    expect(isGoogleMapsUrl('https://g.page/kadikoy-boga?share')).toBe(true);
    expect(isGoogleMapsUrl('https://test-isletme.g.page/hakkinda')).toBe(true);
  });
  it('alakasız linkleri reddeder', () => {
    expect(isGoogleMapsUrl('')).toBe(false);
    expect(isGoogleMapsUrl('not a url')).toBe(false);
    expect(isGoogleMapsUrl('https://ornek.com/harita')).toBe(false);
    expect(isGoogleMapsUrl('https://facebook.com/birisletme')).toBe(false);
  });
});
