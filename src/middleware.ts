import { defineMiddleware } from 'astro:middleware';
import { isAuthenticated } from './lib/auth';
import { ensureSeeded } from './lib/seed';

const PUBLIC_ADMIN_PATHS = new Set(['/admin/login']);

export const onRequest = defineMiddleware(async ({ url, cookies, redirect }, next) => {
  await ensureSeeded();

  const path = url.pathname.replace(/\/+$/, '') || '/';
  const isAdmin = path === '/admin' || path.startsWith('/admin/');
  if (!isAdmin) return next();

  if (!PUBLIC_ADMIN_PATHS.has(path) && !isAuthenticated(cookies)) {
    return redirect('/admin/login');
  }

  const response = await next();
  response.headers.set('Cache-Control', 'no-store');
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
});
