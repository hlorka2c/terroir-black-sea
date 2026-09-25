import { z } from 'astro/zod';
import { saveImage } from './media';

export type FieldErrors = Record<string, string>;
export type FormValues = Record<string, string>;

/** 'new' → null (create), positive integer → id, anything else → undefined (404). */
export function parseId(param: string | undefined): number | null | undefined {
  if (param === 'new') return null;
  const id = Number(param);
  return Number.isInteger(id) && id > 0 ? id : undefined;
}

export function validate<T extends z.ZodType>(schema: T, form: FormData) {
  const values: FormValues = {};
  for (const [key, value] of form.entries()) {
    if (typeof value === 'string') values[key] = value;
  }
  const result = schema.safeParse(values);
  if (result.success) return { data: result.data as z.output<T>, errors: {} as FieldErrors, values };

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    errors[String(issue.path[0] ?? 'form')] ??= issue.message;
  }
  return { data: null, errors, values };
}

export async function uploadedImage(form: FormData, name = 'image'): Promise<string | null> {
  const file = form.get(name);
  if (!(file instanceof File) || file.size === 0) return null;
  if (!file.type.startsWith('image/')) throw new Error('Загрузите изображение: JPG, PNG или WebP');
  try {
    return await saveImage(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    throw new Error(message.startsWith('Файл') ? message : 'Не удалось обработать изображение');
  }
}

export const isUniqueViolation = (error: unknown) =>
  error instanceof Error && error.message.includes('UNIQUE constraint failed');

export const hasErrors = (errors: FieldErrors) => Object.keys(errors).length > 0;
