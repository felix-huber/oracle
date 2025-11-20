import { describe, expect, test } from 'vitest';
import { testExports } from '../../src/browser/chromeCookies.js';

describe('chromeCookies helpers', () => {
  test('cleanValue strips leading control chars', () => {
    expect(testExports.cleanValue('\u0001\u0002hello')).toBe('hello');
    expect(testExports.cleanValue('hello')).toBe('hello');
  });

  test('normalizeExpiration handles Chromium timestamps', () => {
    expect(testExports.normalizeExpiration(undefined)).toBeUndefined();
    expect(testExports.normalizeExpiration(0)).toBeUndefined();
    expect(testExports.normalizeExpiration(1_700_000_000)).toBe(1_700_000);
    expect(testExports.normalizeExpiration(1_700_000_000_000)).toBe(1_700_000 - 11644473600);
  });

  test('looksLikePath detects absolute-like inputs', () => {
    expect(testExports.looksLikePath('/Users/me/Cookies')).toBe(true);
    expect(testExports.looksLikePath('Profile 1')).toBe(false);
  });

  test('defaultProfileRoot returns something platform-specific', async () => {
    const root = await testExports.defaultProfileRoot();
    expect(typeof root).toBe('string');
    expect(root.length).toBeGreaterThan(1);
  });
});
