import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { deleteMediaIfUnused, getMedia, imageUrl, saveImage } from '../src/lib/media';
import {
  SETTING_FIELDS, getOgImage, getSettings, saveSettings, setOgImage, settingsInput, type Settings,
} from '../src/lib/settings';

const defaults = () => Object.fromEntries(SETTING_FIELDS.map((field) => [field.key, field.default])) as Settings;
const firstError = (values: Record<string, string>) => {
  const result = settingsInput.safeParse(values);
  return result.success ? null : result.error.issues[0].message;
};

describe('settings', () => {
  it('falls back to the original site copy for fields never edited', () => {
    expect(getSettings().heroTitleAccent).toBe('вкус места');
  });

  it('persists edited values', () => {
    saveSettings({ ...defaults(), heroTitleAccent: 'характер места' });
    expect(getSettings().heroTitleAccent).toBe('характер места');
  });

  it('accepts the defaults as a valid form', () => {
    expect(settingsInput.safeParse(defaults()).success).toBe(true);
  });

  it('requires mandatory texts', () => {
    expect(firstError({ ...defaults(), heroTitle: '  ' })).toBe('Обязательное поле');
  });

  it('validates e-mails', () => {
    expect(firstError({ ...defaults(), contactEmail: 'hello@' })).toContain('Введите e-mail');
  });

  it('allows empty social links but rejects non-http ones', () => {
    expect(firstError({ ...defaults(), telegramUrl: '' })).toBeNull();
    expect(firstError({ ...defaults(), telegramUrl: 'javascript:alert(1)' })).toContain('https://');
  });
});

describe('link preview image', () => {
  const upload = async () =>
    saveImage(await sharp({ create: { width: 1400, height: 735, channels: 3, background: '#172018' } }).png().toBuffer());

  it('replaces the previous image and deletes its files', async () => {
    const first = await upload();
    setOgImage(first);
    expect(getOgImage()?.id).toBe(first);

    const second = await upload();
    setOgImage(second);
    expect(getOgImage()?.id).toBe(second);
    expect(getMedia(first)).toBeNull();
  });

  it('is protected from cleanup while it is in use', async () => {
    const image = await upload();
    setOgImage(image);
    deleteMediaIfUnused(image);
    expect(getMedia(image)).not.toBeNull();
  });

  it('uses a ~1200px variant for previews', async () => {
    const image = await upload();
    expect(imageUrl(getMedia(image)!, 1280)).toBe(`/media/${image}-1280.webp`);
  });
});
