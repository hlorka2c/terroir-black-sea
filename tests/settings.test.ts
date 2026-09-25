import { describe, expect, it } from 'vitest';
import { SETTING_FIELDS, getSettings, saveSettings, settingsInput, type Settings } from '../src/lib/settings';

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
