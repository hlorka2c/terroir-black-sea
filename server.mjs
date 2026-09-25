// Production entry point. Before the admin, nginx served the static site with compression and
// baseline security headers; this keeps both now that the site is a Node app, without a second service.
import http from 'node:http';
import compression from 'compression';

// Take Astro's standalone handler (static files + SSR) without letting it start its own server.
process.env.ASTRO_NODE_AUTOSTART = 'disabled';
const { handler } = await import('./dist/server/entry.mjs');

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Content-Security-Policy': "frame-ancestors 'self'; base-uri 'self'; object-src 'none'; form-action 'self'",
};

const compress = compression();
const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? '0.0.0.0';

http
  .createServer((req, res) => {
    for (const [name, value] of Object.entries(SECURITY_HEADERS)) res.setHeader(name, value);
    compress(req, res, () => handler(req, res));
  })
  .listen(port, host, () => console.log(`Server listening on http://${host}:${port}`));
