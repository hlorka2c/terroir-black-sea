import { existsSync, readdirSync } from 'node:fs';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import {
  deleteJournalItem, deleteWine, journalInput, saveJournalItem, saveTerroir, saveWine, terroirInput, wineInput,
} from '../src/lib/content';
import { UPLOADS_DIR } from '../src/lib/db';
import { getMedia, saveImage } from '../src/lib/media';

const upload = async () =>
  saveImage(await sharp({ create: { width: 800, height: 600, channels: 3, background: '#5b2534' } }).png().toBuffer());

const filesOf = (id: string) => readdirSync(UPLOADS_DIR).filter((file) => file.startsWith(id));
const isGone = (id: string) => getMedia(id) === null && filesOf(id).length === 0;

const journal = journalInput.parse({
  kind: 'film', title: 'Фильм', description: '', duration: '', imageAlt: '', sort: '1', published: 'on',
});

let counter = 0;
function newTerroir(imageId: string | null = null, slug = `media-${++counter}`) {
  const input = terroirInput.parse({
    name: 'Т', slug, location: '', description: '', imageAlt: '', polygon: '', sort: '1', published: 'on',
  });
  return saveTerroir(null, input, imageId);
}

describe('image cleanup', () => {
  it('stores resized WebP files on upload', async () => {
    const id = await upload();
    expect(getMedia(id)?.widths).toEqual([640, 800]);
    expect(filesOf(id)).toHaveLength(2);
  });

  it('removes the old image when it is replaced', async () => {
    const first = await upload();
    const itemId = saveJournalItem(null, journal, first);

    const second = await upload();
    saveJournalItem(itemId, journal, second);

    expect(isGone(first)).toBe(true);
    expect(existsSync(`${UPLOADS_DIR}/${second}-800.webp`)).toBe(true);
  });

  it('keeps the image when the record is saved without a new upload', async () => {
    const image = await upload();
    const itemId = saveJournalItem(null, journal, image);
    saveJournalItem(itemId, { ...journal, title: 'Новое название' }, null);
    expect(isGone(image)).toBe(false);
  });

  it('removes the image together with the record', async () => {
    const image = await upload();
    deleteJournalItem(saveJournalItem(null, journal, image));
    expect(isGone(image)).toBe(true);
  });

  it('keeps a shared image until its last user is gone', async () => {
    const shared = await upload();
    const terroirId = newTerroir();
    const wine = wineInput.parse({
      name: 'Вино', price: '', style: '', terroirId: String(terroirId), imagePosition: 'center', sort: '1', published: 'on',
    });
    const first = saveWine(null, wine, shared);
    const second = saveWine(null, wine, shared);

    deleteWine(first);
    expect(isGone(shared)).toBe(false);

    deleteWine(second);
    expect(isGone(shared)).toBe(true);
  });

  it('discards a fresh upload when saving the record fails', async () => {
    newTerroir(null, 'taken-slug');
    const orphan = await upload();

    expect(() => newTerroir(orphan, 'taken-slug')).toThrow(/UNIQUE/);
    expect(isGone(orphan)).toBe(true);
  });
});
