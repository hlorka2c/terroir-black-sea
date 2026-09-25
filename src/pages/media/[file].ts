import type { APIRoute } from 'astro';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { UPLOADS_DIR } from '../../lib/db';
import { FILE_PATTERN } from '../../lib/media';

export const GET: APIRoute = async ({ params }) => {
  const file = params.file ?? '';
  if (!FILE_PATTERN.test(file)) return new Response(null, { status: 404 });
  try {
    const body = await readFile(path.join(UPLOADS_DIR, file));
    return new Response(new Uint8Array(body), {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'public, max-age=31536000, immutable' },
    });
  } catch {
    return new Response(null, { status: 404 });
  }
};
