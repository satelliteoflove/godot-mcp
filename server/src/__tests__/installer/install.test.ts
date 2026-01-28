import { describe, it, expect } from 'vitest';
import { compareVersions } from '../../installer/install.js';

describe('compareVersions', () => {
  it('returns 0 for equal versions', () => {
    expect(compareVersions('1.0.0', '1.0.0')).toBe(0);
    expect(compareVersions('2.12.0', '2.12.0')).toBe(0);
    expect(compareVersions('0.0.1', '0.0.1')).toBe(0);
  });

  it('returns 1 when first version is greater', () => {
    expect(compareVersions('2.0.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.1.0', '1.0.0')).toBe(1);
    expect(compareVersions('1.0.1', '1.0.0')).toBe(1);
    expect(compareVersions('2.12.0', '2.6.1')).toBe(1);
    expect(compareVersions('10.0.0', '9.0.0')).toBe(1);
  });

  it('returns -1 when first version is lesser', () => {
    expect(compareVersions('1.0.0', '2.0.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.1.0')).toBe(-1);
    expect(compareVersions('1.0.0', '1.0.1')).toBe(-1);
    expect(compareVersions('2.6.1', '2.12.0')).toBe(-1);
    expect(compareVersions('9.0.0', '10.0.0')).toBe(-1);
  });

  it('handles versions with different segment counts', () => {
    expect(compareVersions('1.0', '1.0.0')).toBe(0);
    expect(compareVersions('1.0.0', '1.0')).toBe(0);
    expect(compareVersions('1.0', '1.0.1')).toBe(-1);
    expect(compareVersions('1.0.1', '1.0')).toBe(1);
    expect(compareVersions('2', '1.9.9')).toBe(1);
  });

  it('correctly handles the reported bug case (2.12.0 vs 2.6.1)', () => {
    expect(compareVersions('2.12.0', '2.6.1')).toBe(1);
    expect(compareVersions('2.6.1', '2.12.0')).toBe(-1);
  });

  it('handles edge cases', () => {
    expect(compareVersions('0.0.0', '0.0.0')).toBe(0);
    expect(compareVersions('0.0.1', '0.0.0')).toBe(1);
    expect(compareVersions('0.1.0', '0.0.9')).toBe(1);
  });
});
