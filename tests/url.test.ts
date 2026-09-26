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

// Güvenlik regresyon testleri: eski uygulama `host.includes('google.')` /
// `host.includes('goo.gl')` kullanıyordu, yani substring eşleşmesiyle
// sahte hostlar geçiyordu. Buradaki her "reddeder" vakası o açığı kapatır.
describe('isGoogleMapsUrl host allowlisti', () => {
  it('ülke uzantılı google hostlarını ve alt domainleri kabul eder', () => {
    // apex
    expect(isGoogleMapsUrl('https://google.com/maps/place/Test')).toBe(true);
    // ccTLD varyantları
    expect(isGoogleMapsUrl('https://www.google.com.tr/maps/place/Test')).toBe(true);
    expect(isGoogleMapsUrl('https://maps.google.de/maps/place/Test')).toBe(true);
    expect(isGoogleMapsUrl('https://www.google.co.uk/maps/place/Test')).toBe(true);
    expect(isGoogleMapsUrl('https://www.google.com.au/maps/place/Test')).toBe(true);
    expect(isGoogleMapsUrl('https://www.google.co.jp/maps/place/Test')).toBe(true);
    expect(isGoogleMapsUrl('https://maps.google.com.br/maps/place/Test')).toBe(true);
    // alt domain + ccTLD
    expect(isGoogleMapsUrl('https://maps.google.com.tr/maps/place/Test/@41.0,29.0,17z')).toBe(true);
    expect(isGoogleMapsUrl('https://www.google.fr/maps/place/Test')).toBe(true);
    // alt domain
    expect(isGoogleMapsUrl('https://maps.google.com/?q=restoran')).toBe(true);
    expect(isGoogleMapsUrl('https://www.google.com/maps/place/Test/@40.9,29.0,17z')).toBe(true);
    expect(isGoogleMapsUrl('https://business.google.com/')).toBe(true);
  });
  it('büyük harfli ve sondaki noktalı hostları kabul eder', () => {
    expect(isGoogleMapsUrl('https://WWW.GOOGLE.COM/maps/place/Test')).toBe(true);
    expect(isGoogleMapsUrl('https://Maps.Google.COM.TR/maps/place/Test')).toBe(true);
    expect(isGoogleMapsUrl('https://www.google.com./maps/place/Test')).toBe(true);
    expect(isGoogleMapsUrl('https://MAPS.APP.GOO.GL/abc123XYZ')).toBe(true);
  });
  it('goo.gl ve g.page kısaltmalarını kabul eder', () => {
    expect(isGoogleMapsUrl('https://maps.app.goo.gl/abc123XYZ')).toBe(true);
    expect(isGoogleMapsUrl('https://goo.gl/maps/abc123')).toBe(true);
    expect(isGoogleMapsUrl('https://g.page/kadikoy-boga?share')).toBe(true);
    expect(isGoogleMapsUrl('https://maps.g.page/r/KadikoyBogaziciCafe')).toBe(true);
    expect(isGoogleMapsUrl('https://test-isletme.g.page/hakkinda')).toBe(true);
  });
  it('http (https olmayan) linkleri kabul eder', () => {
    expect(isGoogleMapsUrl('http://www.google.com/maps/place/Test')).toBe(true);
  });
  it('substring taşıyan sahte google hostlarını reddeder', () => {
    expect(isGoogleMapsUrl('https://notgoogle.com/maps')).toBe(false);
    expect(isGoogleMapsUrl('https://google.evil.com/maps/place/Test')).toBe(false);
    expect(isGoogleMapsUrl('https://googleXcom/maps')).toBe(false);
    expect(isGoogleMapsUrl('https://google-com.evil.com/maps')).toBe(false);
    expect(isGoogleMapsUrl('https://mygoogle.com/maps')).toBe(false);
    expect(isGoogleMapsUrl('https://google.co.uk.evil.com/maps')).toBe(false);
    expect(isGoogleMapsUrl('https://google.com.tr.attacker.example/maps')).toBe(false);
    // "google." geçiyor ama "google" değil: son label 2-3 harf olmalı
    expect(isGoogleMapsUrl('https://google.maps.evil.com/')).toBe(false);
  });
  it('substring taşıyan sahte goo.gl / g.page hostlarını reddeder', () => {
    expect(isGoogleMapsUrl('https://evilgoo.gl.attacker.com/x')).toBe(false);
    expect(isGoogleMapsUrl('https://xgoo.gl/abc')).toBe(false);
    expect(isGoogleMapsUrl('https://notgoo.gl/maps')).toBe(false);
    expect(isGoogleMapsUrl('https://g.page.evil.com/x')).toBe(false);
    expect(isGoogleMapsUrl('https://notg.page/x')).toBe(false);
    expect(isGoogleMapsUrl('https://googl.page/x')).toBe(false);
    expect(isGoogleMapsUrl('https://goo.gl.attacker.com/maps')).toBe(false);
  });
  it('squatter domainlerini (kayıt edilebilir sahte google.*) reddeder', () => {
    expect(isGoogleMapsUrl('https://google.zz/maps/place/Test')).toBe(false);
    expect(isGoogleMapsUrl('https://google.tk/maps/place/Test')).toBe(false);
    expect(isGoogleMapsUrl('https://google.ai/maps/place/Test')).toBe(false);
    expect(isGoogleMapsUrl('https://google.ml/maps/place/Test')).toBe(false);
    expect(isGoogleMapsUrl('https://maps.google.tk/maps/place/Test')).toBe(false);
  });
  it('homograph (punycode) hostlarını reddeder', () => {
    // "google" yazısı Kiril/benzer karakterlerle taklit edilmiş
    expect(isGoogleMapsUrl('https://xn--gogle-55da.com/maps')).toBe(false);
    expect(isGoogleMapsUrl('https://gооgle.com/maps')).toBe(false);
  });
  it('http(s) dışı şemaları reddeder', () => {
    expect(isGoogleMapsUrl('javascript:alert(1)')).toBe(false);
    expect(isGoogleMapsUrl('javascript:alert(1)//https://www.google.com')).toBe(false);
    expect(isGoogleMapsUrl('ftp://www.google.com/maps')).toBe(false);
    expect(isGoogleMapsUrl('file:///etc/passwd')).toBe(false);
    expect(isGoogleMapsUrl('data:text/html,<script>alert(1)</script>')).toBe(false);
  });
  it('parse edilemeyen girdileri reddeder (catch => false)', () => {
    expect(isGoogleMapsUrl('')).toBe(false);
    expect(isGoogleMapsUrl('   ')).toBe(false);
    expect(isGoogleMapsUrl('not a url')).toBe(false);
    expect(isGoogleMapsUrl('google.com/maps/place/Test')).toBe(false); // şemasız
    expect(isGoogleMapsUrl('//www.google.com/maps')).toBe(false); // protocol-relative
  });
  it('trim davranışını korur', () => {
    expect(isGoogleMapsUrl('  https://www.google.com/maps/place/Test  ')).toBe(true);
    expect(isGoogleMapsUrl('\n\thttps://maps.app.goo.gl/abc123XYZ  ')).toBe(true);
    expect(isGoogleMapsUrl('  https://notgoogle.com/maps  ')).toBe(false);
  });
});
