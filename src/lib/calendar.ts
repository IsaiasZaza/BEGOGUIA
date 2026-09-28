const TIME_ZONE = 'America/Sao_Paulo';

export function hojeSaoPaulo(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

export function mesAtualSaoPaulo(now = new Date()) {
  return hojeSaoPaulo(now).slice(0, 7);
}

export function diaDaSemanaDaData(isoDate: string) {
  return diaDaSemanaSaoPaulo(new Date(`${isoDate}T12:00:00-03:00`));
}

export function diaDaSemanaSaoPaulo(now = new Date()) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'short' }).format(now);
  const map: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return map[name] ?? 0;
}

export function addDays(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function semanaAtualSaoPaulo(now = new Date()) {
  const hoje = hojeSaoPaulo(now);
  const weekday = diaDaSemanaSaoPaulo(now);
  const desdeSegunda = weekday === 0 ? 6 : weekday - 1;
  const inicio = addDays(hoje, -desdeSegunda);
  return { inicio, fim: addDays(inicio, 6) };
}

export function proximaSegundaFeira(now = new Date()) {
  const hoje = hojeSaoPaulo(now);
  const weekday = diaDaSemanaSaoPaulo(now);
  const delta = weekday === 0 ? 1 : weekday === 1 ? 0 : 8 - weekday;
  return addDays(hoje, delta);
}

export function instanteSaoPaulo(data: string, horario: string) {
  return `${data}T${horario}:00-03:00`;
}

export function isDataValida(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

export function isHorarioValido(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}
