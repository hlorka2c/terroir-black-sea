import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { AstroCookies } from 'astro';
import { ADMIN_LOGIN, ADMIN_PASSWORD } from 'astro:env/server';
import { db } from './db';

const COOKIE = 'admin_session';
const COOKIE_PATH = '/admin';
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;
const MAX_ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;

const sha256 = (value: string) => createHash('sha256').update(value).digest();

/** Compares fixed-length digests so the check time does not depend on input. */
export function checkCredentials(login: string, password: string): boolean {
  const loginOk = timingSafeEqual(sha256(login), sha256(ADMIN_LOGIN));
  const passwordOk = timingSafeEqual(sha256(password), sha256(ADMIN_PASSWORD));
  return loginOk && passwordOk;
}

/** Only token hashes are stored, so a leaked database does not expose live sessions. */
const tokenId = (token: string) => sha256(token).toString('hex');

export function createSession(cookies: AstroCookies, url: URL): void {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  db().prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  db().prepare('INSERT INTO sessions (id, expires_at) VALUES (?, ?)').run(tokenId(token), expiresAt);
  cookies.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: url.protocol === 'https:',
    path: COOKIE_PATH,
    expires: new Date(expiresAt),
  });
}

export function isAuthenticated(cookies: AstroCookies): boolean {
  const token = cookies.get(COOKIE)?.value;
  if (!token) return false;
  const row = db().prepare('SELECT expires_at FROM sessions WHERE id = ?').get(tokenId(token)) as
    | { expires_at: number }
    | undefined;
  return row !== undefined && row.expires_at > Date.now();
}

export function destroySession(cookies: AstroCookies): void {
  const token = cookies.get(COOKIE)?.value;
  if (token) db().prepare('DELETE FROM sessions WHERE id = ?').run(tokenId(token));
  cookies.delete(COOKIE, { path: COOKIE_PATH });
}

// In-memory limiter: enough for a single instance, resets on restart.
const attempts = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(key: string): boolean {
  const entry = attempts.get(key);
  return entry !== undefined && entry.resetAt > Date.now() && entry.count >= MAX_ATTEMPTS;
}

export function registerFailure(key: string): void {
  const entry = attempts.get(key);
  if (!entry || entry.resetAt <= Date.now()) {
    attempts.set(key, { count: 1, resetAt: Date.now() + ATTEMPT_WINDOW_MS });
  } else {
    entry.count += 1;
  }
}

export function clearFailures(key: string): void {
  attempts.delete(key);
}
