import { z } from 'astro/zod';
import { db, transaction } from './db';
import { deleteMediaIfUnused, getMedia, type Media } from './media';

type FieldType = 'text' | 'textarea' | 'email' | 'url';

type SettingField = {
  key: string;
  label: string;
  type: FieldType;
  max: number;
  default: string;
  hint?: string;
  optional?: boolean;
};

/**
 * Single source of truth for editable site texts: drives the admin form, validation and defaults.
 * Defaults are the original copy, so the site looks unchanged until someone edits a field.
 */
export const SETTINGS_GROUPS = [
  {
    title: 'Главный экран',
    fields: [
      { key: 'heroTitle', label: 'Заголовок', hint: 'Первая строка H1', type: 'text', max: 40, default: 'Вино —' },
      { key: 'heroTitleAccent', label: 'Заголовок, акцент', hint: 'Вторая строка, выделена курсивом', type: 'text', max: 40, default: 'вкус места' },
      {
        key: 'heroLead', label: 'Подзаголовок', type: 'textarea', max: 240,
        default: 'Мы исследуем, как почва, рельеф, свет, ветер и близость моря участвуют в формировании характера вина.',
      },
      {
        key: 'manifestoBefore', label: 'Манифест: начало', hint: 'Печатается по буквам при прокрутке', type: 'textarea', max: 300,
        default: 'Мы собираем эту коллекцию, чтобы различия между местами можно было не только увидеть, но и',
      },
      { key: 'manifestoAccent', label: 'Манифест: акцент', hint: 'Выделенное слово в середине', type: 'text', max: 60, default: 'почувствовать.' },
      {
        key: 'manifestoAfter', label: 'Манифест: окончание', type: 'textarea', max: 300,
        default: 'Каждый участок — собственное сочетание земли, света, воздуха и времени.',
      },
    ],
  },
  {
    title: 'Где купить',
    fields: [
      {
        key: 'buyIntro', label: 'Вступление', type: 'textarea', max: 200,
        default: 'Узнайте о точках присутствия или оставьте запрос на сотрудничество с проектом.',
      },
      { key: 'buyRetailTitle', label: 'Для гостей: заголовок', type: 'text', max: 60, default: 'Винотеки и рестораны' },
      {
        key: 'buyRetailText', label: 'Для гостей: текст', type: 'textarea', max: 200,
        default: 'Подскажем ближайшее место, где можно найти и попробовать вина проекта.',
      },
      { key: 'buyPartnersTitle', label: 'Для партнёров: заголовок', type: 'text', max: 60, default: 'Ресторанам и винотекам' },
      {
        key: 'buyPartnersText', label: 'Для партнёров: текст', type: 'textarea', max: 200,
        default: 'Предоставим информацию о доступности вин и условиях сотрудничества.',
      },
    ],
  },
  {
    title: 'Контакты',
    fields: [
      { key: 'contactEmail', label: 'Общие вопросы', type: 'email', max: 120, default: 'hello@terroir-black-sea.ru' },
      { key: 'partnersEmail', label: 'Ресторанам и винотекам', type: 'email', max: 120, default: 'partners@terroir-black-sea.ru' },
      { key: 'telegramUrl', label: 'Telegram', hint: 'Пусто — название без ссылки', type: 'url', max: 200, default: '', optional: true },
      { key: 'vkUrl', label: 'ВКонтакте', hint: 'Пусто — название без ссылки', type: 'url', max: 200, default: '', optional: true },
    ],
  },
  {
    title: 'Поисковики и соцсети',
    fields: [
      {
        key: 'seoTitle', label: 'Заголовок страницы', hint: 'Вкладка браузера и выдача поисковиков, до 70 символов', type: 'text', max: 70,
        default: 'Терруар Чёрного моря — коллекция авторских вин',
      },
      {
        key: 'seoDescription', label: 'Описание', hint: 'Сниппет в поиске и превью ссылки, до 200 символов', type: 'textarea', max: 200,
        default: 'Коллекция авторских вин, в которой почва, рельеф, свет, ветер и близость моря становятся характером.',
      },
    ],
  },
] as const satisfies readonly { title: string; fields: readonly SettingField[] }[];

export const SETTING_FIELDS: readonly SettingField[] = SETTINGS_GROUPS.flatMap((group): readonly SettingField[] => group.fields);

export type SettingKey = (typeof SETTINGS_GROUPS)[number]['fields'][number]['key'];
export type Settings = Record<SettingKey, string>;

function fieldSchema(field: SettingField) {
  const base = z.string({ error: 'Заполните поле' }).trim().max(field.max, `Не длиннее ${field.max} символов`);
  const typed =
    field.type === 'email' ? base.regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'Введите e-mail, например hello@example.ru')
    : field.type === 'url' ? base.regex(/^(https?:\/\/\S+)?$/, 'Ссылка должна начинаться с https://')
    : base;
  return field.optional ? typed : typed.min(1, 'Обязательное поле');
}

export const settingsInput = z.object(
  Object.fromEntries(SETTING_FIELDS.map((field) => [field.key, fieldSchema(field)])),
);

export function getSettings(): Settings {
  const rows = db().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const stored = new Map(rows.map((row) => [row.key, row.value]));
  return Object.fromEntries(SETTING_FIELDS.map((field) => [field.key, stored.get(field.key) ?? field.default])) as Settings;
}

export function saveSettings(values: Settings): void {
  const upsert = db().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value',
  );
  transaction(() => {
    for (const field of SETTING_FIELDS) upsert.run(field.key, values[field.key as SettingKey]);
  });
}

// The link preview image is a media reference rather than text, so it lives beside the text fields.
const OG_IMAGE_KEY = 'ogImageId';

export function getOgImage(): Media | null {
  const row = db().prepare('SELECT value FROM settings WHERE key = ?').get(OG_IMAGE_KEY) as { value: string } | undefined;
  return getMedia(row?.value ?? null);
}

export function setOgImage(imageId: string): void {
  const previous = getOgImage()?.id ?? null;
  db().prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT (key) DO UPDATE SET value = excluded.value')
    .run(OG_IMAGE_KEY, imageId);
  if (previous !== imageId) deleteMediaIfUnused(previous);
}
