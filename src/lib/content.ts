import { z } from 'astro/zod';
import { db } from './db';
import { getMedia, type Media } from './media';

type Row = Record<string, any>;

const text = (max: number) => z.string().trim().max(max, `Не длиннее ${max} символов`);
const required = (max: number) => text(max).min(1, 'Обязательное поле');
const sort = z.coerce.number().int().min(0).max(9999);
const published = z.preprocess((v) => v === 'on', z.boolean());

const polygon = z
  .string()
  .transform((value, ctx) => {
    try {
      return JSON.parse(value.trim() || '[]');
    } catch {
      ctx.addIssue({ code: 'custom', message: 'Некорректный JSON' });
      return z.NEVER;
    }
  })
  .pipe(
    z.array(z.tuple([z.number().min(-90).max(90), z.number().min(-180).max(180)]))
      .refine((points) => points.length === 0 || points.length >= 3, 'Нужно минимум 3 точки или пустой контур'),
  );

export const terroirInput = z.object({
  name: required(80),
  slug: required(60).regex(/^[a-z0-9-]+$/, 'Только латиница в нижнем регистре, цифры и дефис'),
  location: text(120),
  description: text(600),
  imageAlt: text(200),
  polygon,
  sort,
  published,
});

export const wineInput = z.object({
  name: required(80),
  price: z.preprocess(
    (v) => (typeof v === 'string' && v.trim() !== '' ? v.replace(/\s/g, '') : null),
    z.coerce.number().int('Целое число').min(0).max(10_000_000).nullable(),
  ),
  style: text(80),
  terroirId: z.coerce.number().int().positive('Выберите терруар'),
  imagePosition: z.enum(['left', 'center', 'right']),
  sort,
  published,
});

export const JOURNAL_KINDS = { film: 'Фильм', research: 'Исследование', interview: 'Интервью' } as const;

export const journalInput = z.object({
  kind: z.enum(['film', 'research', 'interview']),
  title: required(120),
  description: text(400),
  duration: text(40),
  imageAlt: text(200),
  sort,
  published,
});

export type TerroirInput = z.infer<typeof terroirInput>;
export type WineInput = z.infer<typeof wineInput>;
export type JournalInput = z.infer<typeof journalInput>;

export type Terroir = Omit<TerroirInput, 'published'> & { id: number; image: Media | null; published: boolean };
export type Wine = Omit<WineInput, 'published'> & {
  id: number; image: Media | null; published: boolean; terroirSlug: string; terroirName: string;
};
export type JournalItem = Omit<JournalInput, 'published'> & { id: number; image: Media | null; published: boolean };

const toTerroir = (r: Row): Terroir => ({
  id: r.id, name: r.name, slug: r.slug, location: r.location, description: r.description,
  image: getMedia(r.image_id), imageAlt: r.image_alt, polygon: JSON.parse(r.polygon),
  sort: r.sort, published: r.published === 1,
});

const toWine = (r: Row): Wine => ({
  id: r.id, name: r.name, price: r.price, style: r.style, terroirId: r.terroir_id,
  terroirSlug: r.terroir_slug, terroirName: r.terroir_name, image: getMedia(r.image_id),
  imagePosition: r.image_position, sort: r.sort, published: r.published === 1,
});

const toJournal = (r: Row): JournalItem => ({
  id: r.id, kind: r.kind, title: r.title, description: r.description, duration: r.duration,
  image: getMedia(r.image_id), imageAlt: r.image_alt, sort: r.sort, published: r.published === 1,
});

// Terroirs

export function listTerroirs({ publishedOnly = false } = {}): Terroir[] {
  const where = publishedOnly ? 'WHERE published = 1' : '';
  return (db().prepare(`SELECT * FROM terroirs ${where} ORDER BY sort, id`).all() as Row[]).map(toTerroir);
}

export function getTerroir(id: number): Terroir | null {
  const row = db().prepare('SELECT * FROM terroirs WHERE id = ?').get(id) as Row | undefined;
  return row ? toTerroir(row) : null;
}

export function saveTerroir(id: number | null, input: TerroirInput, imageId: string | null): number {
  const params = {
    name: input.name, slug: input.slug, location: input.location, description: input.description,
    imageAlt: input.imageAlt, polygon: JSON.stringify(input.polygon), sort: input.sort,
    published: input.published ? 1 : 0, imageId,
  };
  if (id === null) {
    return Number(db().prepare(`
      INSERT INTO terroirs (name, slug, location, description, image_alt, polygon, sort, published, image_id)
      VALUES (:name, :slug, :location, :description, :imageAlt, :polygon, :sort, :published, :imageId)
    `).run(params).lastInsertRowid);
  }
  db().prepare(`
    UPDATE terroirs SET name = :name, slug = :slug, location = :location, description = :description,
      image_alt = :imageAlt, polygon = :polygon, sort = :sort, published = :published,
      image_id = COALESCE(:imageId, image_id), updated_at = datetime('now')
    WHERE id = :id
  `).run({ ...params, id });
  return id;
}

export function deleteTerroir(id: number): void {
  const { count } = db().prepare('SELECT COUNT(*) AS count FROM wines WHERE terroir_id = ?').get(id) as { count: number };
  if (count > 0) throw new Error(`К терруару привязано вин: ${count}. Сначала перенесите или удалите их.`);
  db().prepare('DELETE FROM terroirs WHERE id = ?').run(id);
}

// Wines

const WINE_SELECT = `
  SELECT w.*, t.slug AS terroir_slug, t.name AS terroir_name
  FROM wines w JOIN terroirs t ON t.id = w.terroir_id
`;

export function listWines({ publishedOnly = false } = {}): Wine[] {
  const where = publishedOnly ? 'WHERE w.published = 1 AND t.published = 1' : '';
  return (db().prepare(`${WINE_SELECT} ${where} ORDER BY w.sort, w.id`).all() as Row[]).map(toWine);
}

export function getWine(id: number): Wine | null {
  const row = db().prepare(`${WINE_SELECT} WHERE w.id = ?`).get(id) as Row | undefined;
  return row ? toWine(row) : null;
}

export function saveWine(id: number | null, input: WineInput, imageId: string | null): number {
  const params = {
    name: input.name, price: input.price, style: input.style, terroirId: input.terroirId,
    imagePosition: input.imagePosition, sort: input.sort, published: input.published ? 1 : 0, imageId,
  };
  if (id === null) {
    return Number(db().prepare(`
      INSERT INTO wines (name, price, style, terroir_id, image_position, sort, published, image_id)
      VALUES (:name, :price, :style, :terroirId, :imagePosition, :sort, :published, :imageId)
    `).run(params).lastInsertRowid);
  }
  db().prepare(`
    UPDATE wines SET name = :name, price = :price, style = :style, terroir_id = :terroirId,
      image_position = :imagePosition, sort = :sort, published = :published,
      image_id = COALESCE(:imageId, image_id), updated_at = datetime('now')
    WHERE id = :id
  `).run({ ...params, id });
  return id;
}

export function deleteWine(id: number): void {
  db().prepare('DELETE FROM wines WHERE id = ?').run(id);
}

// Journal

export function listJournal({ publishedOnly = false } = {}): JournalItem[] {
  const where = publishedOnly ? 'WHERE published = 1' : '';
  return (db().prepare(`SELECT * FROM journal ${where} ORDER BY sort, id`).all() as Row[]).map(toJournal);
}

export function getJournalItem(id: number): JournalItem | null {
  const row = db().prepare('SELECT * FROM journal WHERE id = ?').get(id) as Row | undefined;
  return row ? toJournal(row) : null;
}

export function saveJournalItem(id: number | null, input: JournalInput, imageId: string | null): number {
  const params = {
    kind: input.kind, title: input.title, description: input.description, duration: input.duration,
    imageAlt: input.imageAlt, sort: input.sort, published: input.published ? 1 : 0, imageId,
  };
  if (id === null) {
    return Number(db().prepare(`
      INSERT INTO journal (kind, title, description, duration, image_alt, sort, published, image_id)
      VALUES (:kind, :title, :description, :duration, :imageAlt, :sort, :published, :imageId)
    `).run(params).lastInsertRowid);
  }
  db().prepare(`
    UPDATE journal SET kind = :kind, title = :title, description = :description, duration = :duration,
      image_alt = :imageAlt, sort = :sort, published = :published,
      image_id = COALESCE(:imageId, image_id), updated_at = datetime('now')
    WHERE id = :id
  `).run({ ...params, id });
  return id;
}

export function deleteJournalItem(id: number): void {
  db().prepare('DELETE FROM journal WHERE id = ?').run(id);
}

export const formatPrice = (price: number | null) =>
  price === null ? 'Цена по запросу' : new Intl.NumberFormat('ru-RU').format(price) + ' ₽';
