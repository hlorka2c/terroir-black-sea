import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { db, UPLOADS_DIR } from './db';

const WIDTHS = [640, 1280, 1920];
const MAX_BYTES = 15 * 1024 * 1024;

export type Media = { id: string; width: number; height: number; widths: number[] };

export const FILE_PATTERN = /^[0-9a-f-]{36}-\d{2,4}\.webp$/;
const fileName = (id: string, width: number) => `${id}-${width}.webp`;

export async function saveImage(input: Uint8Array): Promise<string> {
  if (input.byteLength > MAX_BYTES) throw new Error('Файл больше 15 МБ');
  const { data, info } = await sharp(input).rotate().toBuffer({ resolveWithObject: true });
  const largest = Math.min(info.width, WIDTHS.at(-1)!);
  const widths = [...new Set([...WIDTHS.filter((w) => w < largest), largest])];
  const id = randomUUID();
  mkdirSync(UPLOADS_DIR, { recursive: true });

  await Promise.all(widths.map((w) =>
    sharp(data).resize({ width: w }).webp({ quality: 82 }).toFile(path.join(UPLOADS_DIR, fileName(id, w))),
  ));

  db().prepare('INSERT INTO media (id, width, height, widths) VALUES (?, ?, ?, ?)')
    .run(id, largest, Math.round((info.height * largest) / info.width), JSON.stringify(widths));
  return id;
}

export function getMedia(id: string | null): Media | null {
  if (!id) return null;
  const row = db().prepare('SELECT id, width, height, widths FROM media WHERE id = ?').get(id) as
    | { id: string; width: number; height: number; widths: string }
    | undefined;
  return row ? { ...row, widths: JSON.parse(row.widths) } : null;
}

const REFERENCING_TABLES = ['terroirs', 'wines', 'journal'] as const;

/** Removes an image and its files once no record points to it; shared images stay. */
export function deleteMediaIfUnused(id: string | null): void {
  if (!id) return;
  const inUse =
    REFERENCING_TABLES.some((table) => db().prepare(`SELECT 1 FROM ${table} WHERE image_id = ? LIMIT 1`).get(id)) ||
    db().prepare('SELECT 1 FROM settings WHERE value = ? LIMIT 1').get(id) !== undefined;
  const media = inUse ? null : getMedia(id);
  if (!media) return;

  db().prepare('DELETE FROM media WHERE id = ?').run(id);
  for (const width of media.widths) rmSync(path.join(UPLOADS_DIR, fileName(id, width)), { force: true });
}

/** Largest variant not wider than maxWidth, e.g. for og:image where ~1200px is the recommended size. */
export function imageUrl(media: Media, maxWidth = Infinity): string {
  const width = [...media.widths].reverse().find((w) => w <= maxWidth) ?? media.widths[0];
  return `/media/${fileName(media.id, width)}`;
}

export function imageAttrs(media: Media) {
  return {
    src: `/media/${fileName(media.id, media.width)}`,
    srcset: media.widths.map((w) => `/media/${fileName(media.id, w)} ${w}w`).join(', '),
    width: media.width,
    height: media.height,
  };
}
