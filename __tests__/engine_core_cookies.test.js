'use strict';

const { filterCookiesForTarget } = require('../src/engine/intake/engine_core.js');

describe('filterCookiesForTarget', () => {
  test('handles non-array cookie input', () => {
    expect(filterCookiesForTarget(null, 'https://example.com')).toEqual({ accepted: [], rejected: [] });
    expect(filterCookiesForTarget({}, 'https://example.com')).toEqual({ accepted: [], rejected: [] });
  });

  test('rejects invalid cookie paths', () => {
    const cookies = [{ name: 'bad_path', path: 'invalid' }];
    const result = filterCookiesForTarget(cookies, 'https://example.com');
    expect(result.rejected).toContainEqual({ name: 'bad_path', reason: 'COOKIE_PATH_INVALID' });
    expect(result.accepted).toHaveLength(0);
  });

  test('rejects secure cookies on HTTP target', () => {
    const cookies = [{ name: 'secure_cookie', secure: true }];
    const result = filterCookiesForTarget(cookies, 'http://example.com');
    expect(result.rejected).toContainEqual({ name: 'secure_cookie', reason: 'COOKIE_SECURE_ON_HTTP_TARGET' });
    expect(result.accepted).toHaveLength(0);
  });

  describe('URL host matching (cookie.url present)', () => {
    const target = 'https://example.com';

    test('accepts exact match', () => {
      const cookies = [{ name: 'exact', url: 'https://example.com' }];
      const result = filterCookiesForTarget(cookies, target);
      expect(result.accepted).toContainEqual(cookies[0]);
    });

    test('accepts when cookie URL is subdomain of target', () => {
      const cookies = [{ name: 'subdomain', url: 'https://sub.example.com' }];
      const result = filterCookiesForTarget(cookies, target);
      expect(result.accepted).toContainEqual(cookies[0]);
    });

    test('accepts when cookie URL is superdomain of target', () => {
      const cookies = [{ name: 'superdomain', url: 'https://example.com' }];
      const result = filterCookiesForTarget(cookies, 'https://sub.example.com');
      expect(result.accepted).toContainEqual(cookies[0]);
    });

    test('rejects mismatch', () => {
      const cookies = [{ name: 'mismatch', url: 'https://other.com' }];
      const result = filterCookiesForTarget(cookies, target);
      expect(result.rejected).toContainEqual({ name: 'mismatch', reason: 'COOKIE_URL_HOST_MISMATCH' });
    });
  });

  describe('Domain matching (cookie.domain present, no url)', () => {
    const target = 'https://example.com';

    test('accepts exact match', () => {
      const cookies = [{ name: 'exact', domain: 'example.com' }];
      const result = filterCookiesForTarget(cookies, target);
      expect(result.accepted).toContainEqual(cookies[0]);
    });

    test('accepts suffix match', () => {
      const cookies = [{ name: 'suffix', domain: 'example.com' }];
      const result = filterCookiesForTarget(cookies, 'https://sub.example.com');
      expect(result.accepted).toContainEqual(cookies[0]);
    });

    test('handles leading dot in domain', () => {
      const cookies = [{ name: 'dot', domain: '.example.com' }];
      const result = filterCookiesForTarget(cookies, target);
      expect(result.accepted).toContainEqual(cookies[0]);
    });

    test('is case insensitive', () => {
      const cookies = [{ name: 'case', domain: 'EXAMPLE.COM' }];
      const result = filterCookiesForTarget(cookies, 'https://example.com');
      expect(result.accepted).toContainEqual(cookies[0]);

      const result2 = filterCookiesForTarget([{ name: 'case2', domain: 'example.com' }], 'https://EXAMPLE.COM');
      expect(result2.accepted).toHaveLength(1);
    });

    test('rejects mismatch', () => {
      const cookies = [{ name: 'mismatch', domain: 'other.com' }];
      const result = filterCookiesForTarget(cookies, target);
      expect(result.rejected).toContainEqual({ name: 'mismatch', reason: 'COOKIE_DOMAIN_MISMATCH' });
    });
  });

  test('accepts cookies without url or domain', () => {
    const cookies = [{ name: 'minimal' }];
    const result = filterCookiesForTarget(cookies, 'https://example.com');
    expect(result.accepted).toContainEqual(cookies[0]);
  });

  test('uses "unknown" name if cookie name is missing when rejecting', () => {
    const cookies = [{ path: 'invalid' }];
    const result = filterCookiesForTarget(cookies, 'https://example.com');
    expect(result.rejected).toContainEqual({ name: 'unknown', reason: 'COOKIE_PATH_INVALID' });
  });
});
