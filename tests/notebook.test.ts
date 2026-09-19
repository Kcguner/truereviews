import { describe, expect, it } from 'vitest';
import { bandColor, bandOf } from '../components/notebook/types';

describe('bandOf', () => {
  it('eşikleri doğru uygular', () => {
    expect(bandOf(100)).toBe('a');
    expect(bandOf(85)).toBe('a');
    expect(bandOf(84)).toBe('b');
    expect(bandOf(70)).toBe('b');
    expect(bandOf(69)).toBe('c');
    expect(bandOf(55)).toBe('c');
    expect(bandOf(54)).toBe('d');
    expect(bandOf(0)).toBe('d');
  });
  it('her banda renk döner', () => {
    for (const s of [95, 75, 60, 30]) {
      expect(bandColor(s).length).toBeGreaterThan(0);
    }
  });
});
