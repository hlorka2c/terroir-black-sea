import { describe, expect, it } from 'vitest';
import { terroirInput, wineInput } from '../src/lib/content';

const wine = { name: 'Северный склон', style: '', terroirId: '1', imagePosition: 'center', sort: '10', price: '' };
const terroir = { name: 'Мезыбь', slug: 'mezyb', location: '', description: '', imageAlt: '', sort: '10', polygon: '[]' };

const firstError = (result: { success: boolean; error?: { issues: { message: string }[] } }) =>
  result.success ? null : result.error!.issues[0].message;

describe('wine price', () => {
  it('accepts prices pasted with spaces and the rouble sign', () => {
    expect(wineInput.parse({ ...wine, price: '3 200 ₽' }).price).toBe(3200);
  });

  it('treats an empty price as "on request"', () => {
    expect(wineInput.parse({ ...wine, price: '  ' }).price).toBeNull();
  });

  it.each([
    ['3200,50', 'Цена — целое число рублей, без копеек'],
    ['12.5', 'Цена — целое число рублей, без копеек'],
    ['дорого', 'Цена — целое число рублей, без копеек'],
    ['-1', 'Цена не может быть отрицательной'],
  ])('rejects %s with a readable message', (price, message) => {
    expect(firstError(wineInput.safeParse({ ...wine, price }))).toBe(message);
  });
});

describe('wine fields', () => {
  it('requires a non-blank name', () => {
    expect(firstError(wineInput.safeParse({ ...wine, name: '   ' }))).toBe('Обязательное поле');
  });

  it('requires a terroir', () => {
    expect(firstError(wineInput.safeParse({ ...wine, terroirId: '' }))).toBe('Выберите терруар');
  });

  it('reads the "published" checkbox as present/absent', () => {
    expect(wineInput.parse({ ...wine, published: 'on' }).published).toBe(true);
    expect(wineInput.parse(wine).published).toBe(false);
  });
});

describe('terroir slug', () => {
  it.each(['Мезыбь', 'Rocky', 'rocky shore', 'rocky_shore'])('rejects %s', (slug) => {
    expect(terroirInput.safeParse({ ...terroir, slug }).success).toBe(false);
  });

  it('accepts lowercase latin with dashes', () => {
    expect(terroirInput.parse({ ...terroir, slug: 'rocky-shore-2' }).slug).toBe('rocky-shore-2');
  });
});

describe('terroir polygon', () => {
  it('parses a valid outline', () => {
    const polygon = '[[44.52, 38.105], [44.524, 38.142], [44.508, 38.166]]';
    expect(terroirInput.parse({ ...terroir, polygon }).polygon).toHaveLength(3);
  });

  it('allows an empty outline', () => {
    expect(terroirInput.parse({ ...terroir, polygon: '' }).polygon).toEqual([]);
  });

  it.each([
    ['not json', 'Не удалось разобрать координаты'],
    ['{}', 'Формат: [[широта, долгота]'],
    ['[[1], [2], [3]]', 'Каждая точка — пара чисел'],
    ['[[100, 1], [1, 1], [2, 2]]', 'Широта от −90 до 90'],
    ['[[1, 1], [2, 2]]', 'Нужно минимум 3 точки'],
  ])('rejects %s', (polygon, message) => {
    expect(firstError(terroirInput.safeParse({ ...terroir, polygon }))).toContain(message);
  });
});
