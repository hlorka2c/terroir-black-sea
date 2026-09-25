import { describe, expect, it } from 'vitest';
import {
  deleteTerroir, deleteWine, getWine, listWines, saveTerroir, saveWine, terroirInput, wineInput,
} from '../src/lib/content';
import { db } from '../src/lib/db';

let counter = 0;

function createTerroir(overrides: Record<string, string> = {}) {
  counter += 1;
  const input = terroirInput.parse({
    name: `Терруар ${counter}`, slug: `terroir-${counter}`, location: '', description: '', imageAlt: '',
    polygon: '[]', sort: '10', published: 'on', ...overrides,
  });
  return saveTerroir(null, input, null);
}

function createWine(terroirId: number, overrides: Record<string, string> = {}) {
  const input = wineInput.parse({
    name: 'Вино', price: '1000', style: '', terroirId: String(terroirId), imagePosition: 'center',
    sort: '10', published: 'on', ...overrides,
  });
  return saveWine(null, input, null);
}

describe('terroirs', () => {
  it('refuses to delete a terroir that still has wines', () => {
    const terroirId = createTerroir();
    const wineId = createWine(terroirId);

    expect(() => deleteTerroir(terroirId)).toThrow('К терруару привязано вин: 1');

    deleteWine(wineId);
    expect(() => deleteTerroir(terroirId)).not.toThrow();
  });

  it('enforces unique slugs', () => {
    createTerroir({ slug: 'unique-slug' });
    expect(() => createTerroir({ slug: 'unique-slug' })).toThrow(/UNIQUE constraint failed/);
  });
});

describe('wines on the public site', () => {
  it('hides wines whose terroir is unpublished', () => {
    const hiddenTerroir = createTerroir({ published: '' });
    const wineId = createWine(hiddenTerroir, { name: 'Вино скрытого терруара' });

    expect(listWines().some((wine) => wine.id === wineId)).toBe(true);
    expect(listWines({ publishedOnly: true }).some((wine) => wine.id === wineId)).toBe(false);
  });

  it('hides unpublished wines', () => {
    const wineId = createWine(createTerroir(), { published: '' });
    expect(listWines({ publishedOnly: true }).some((wine) => wine.id === wineId)).toBe(false);
  });
});

describe('saving without a new upload', () => {
  it('keeps the existing image', () => {
    db().prepare("INSERT INTO media (id, width, height, widths) VALUES ('existing-image', 640, 480, '[640]')").run();
    const terroirId = createTerroir();
    const input = wineInput.parse({
      name: 'С фото', price: '', style: '', terroirId: String(terroirId), imagePosition: 'left', sort: '1', published: 'on',
    });
    const wineId = saveWine(null, input, 'existing-image');

    saveWine(wineId, { ...input, name: 'Переименовано' }, null);

    const wine = getWine(wineId)!;
    expect(wine.name).toBe('Переименовано');
    expect(wine.image?.id).toBe('existing-image');
  });
});
