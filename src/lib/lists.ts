import { AppError } from './errors';

export type Parada = { nome: string; lat: number; lng: number };

export function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === 'string');
}

export function asParadas(value: unknown): Parada[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
    const record = item as Record<string, unknown>;
    if (typeof record.nome !== 'string' || typeof record.lat !== 'number' || typeof record.lng !== 'number') {
      return [];
    }
    return [{ nome: record.nome, lat: record.lat, lng: record.lng }];
  });
}

export function fieldError(field: string, message: string): never {
  throw new AppError(400, 'Dados inválidos', 'VALIDATION_ERROR', { [field]: message });
}

export function parseStringList(value: unknown, field: string): string[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;

  let raw: unknown = value;
  if (Array.isArray(raw)) {
    if (raw.length === 1 && typeof raw[0] === 'string' && raw[0].trim().startsWith('[')) {
      raw = parseJson(raw[0], field);
    } else {
      return raw.map((item) => String(item).trim()).filter(Boolean);
    }
  }

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('[')) raw = parseJson(trimmed, field);
    else return [trimmed];
  }

  if (!Array.isArray(raw) || raw.some((item) => typeof item !== 'string')) {
    fieldError(field, 'Lista inválida');
  }

  return (raw as string[]).map((item) => item.trim()).filter(Boolean);
}

export function parseParadas(value: unknown): Parada[] | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  const raw = typeof value === 'string' ? parseJson(value, 'paradas') : value;
  if (!Array.isArray(raw)) fieldError('paradas', 'Paradas inválidas');

  return raw.map((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) fieldError('paradas', 'Paradas inválidas');
    const record = item as Record<string, unknown>;
    const nome = typeof record.nome === 'string' ? record.nome.trim() : '';
    const lat = typeof record.lat === 'number' ? record.lat : Number(record.lat);
    const lng = typeof record.lng === 'number' ? record.lng : Number(record.lng);
    if (!nome || !Number.isFinite(lat) || lat < -90 || lat > 90 || !Number.isFinite(lng) || lng < -180 || lng > 180) {
      fieldError('paradas', `Parada ${index + 1} inválida`);
    }
    return { nome, lat, lng };
  });
}

function parseJson(value: string, field: string) {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    fieldError(field, 'JSON inválido');
  }
}
