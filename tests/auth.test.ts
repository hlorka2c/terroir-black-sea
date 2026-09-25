import type { AstroCookies } from 'astro';
import { describe, expect, it } from 'vitest';
import {
  checkCredentials, clearFailures, createSession, destroySession, isAuthenticated, isRateLimited, registerFailure,
} from '../src/lib/auth';
import { db } from '../src/lib/db';

/** Minimal in-memory stand-in for Astro's cookie jar. */
function fakeCookies() {
  const jar = new Map<string, { value: string; options: Record<string, unknown> }>();
  return {
    jar,
    cookies: {
      get: (name: string) => (jar.has(name) ? { value: jar.get(name)!.value } : undefined),
      set: (name: string, value: string, options: Record<string, unknown>) => jar.set(name, { value, options }),
      delete: (name: string) => jar.delete(name),
    } as unknown as AstroCookies,
  };
}

const http = new URL('http://localhost/admin/login');
const https = new URL('https://example.com/admin/login');

describe('checkCredentials', () => {
  it('accepts the configured login and password', () => {
    expect(checkCredentials('admin', 'correct-horse-battery')).toBe(true);
  });

  it.each([
    ['admin', 'wrong'],
    ['Admin', 'correct-horse-battery'],
    ['', ''],
  ])('rejects %s / %s', (login, password) => {
    expect(checkCredentials(login, password)).toBe(false);
  });
});

describe('sessions', () => {
  it('authenticates with a freshly created session', () => {
    const { cookies } = fakeCookies();
    createSession(cookies, http);
    expect(isAuthenticated(cookies)).toBe(true);
  });

  it('sets an httpOnly cookie scoped to /admin, secure only over https', () => {
    const plain = fakeCookies();
    createSession(plain.cookies, http);
    expect(plain.jar.get('admin_session')!.options).toMatchObject({ httpOnly: true, path: '/admin', secure: false });

    const tls = fakeCookies();
    createSession(tls.cookies, https);
    expect(tls.jar.get('admin_session')!.options).toMatchObject({ secure: true });
  });

  it('stores only a hash of the token', () => {
    const { cookies, jar } = fakeCookies();
    createSession(cookies, http);
    const token = jar.get('admin_session')!.value;
    const stored = db().prepare('SELECT COUNT(*) AS count FROM sessions WHERE id = ?').get(token) as { count: number };
    expect(stored.count).toBe(0);
  });

  it('rejects an unknown token', () => {
    const { cookies, jar } = fakeCookies();
    jar.set('admin_session', { value: 'forged-token', options: {} });
    expect(isAuthenticated(cookies)).toBe(false);
  });

  it('rejects an expired session', () => {
    const { cookies } = fakeCookies();
    createSession(cookies, http);
    db().prepare('UPDATE sessions SET expires_at = ?').run(Date.now() - 1);
    expect(isAuthenticated(cookies)).toBe(false);
  });

  it('invalidates the session on logout, even if the cookie is replayed', () => {
    const { cookies, jar } = fakeCookies();
    createSession(cookies, http);
    const token = jar.get('admin_session')!.value;
    destroySession(cookies);

    jar.set('admin_session', { value: token, options: {} });
    expect(isAuthenticated(cookies)).toBe(false);
  });
});

describe('login rate limiting', () => {
  it('blocks after five failures and unblocks after a successful login', () => {
    const ip = '203.0.113.7';
    for (let i = 0; i < 4; i++) registerFailure(ip);
    expect(isRateLimited(ip)).toBe(false);

    registerFailure(ip);
    expect(isRateLimited(ip)).toBe(true);
    expect(isRateLimited('198.51.100.1')).toBe(false);

    clearFailures(ip);
    expect(isRateLimited(ip)).toBe(false);
  });
});
