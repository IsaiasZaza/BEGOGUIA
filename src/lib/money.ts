export function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

export function toCents(value: number) {
  return Math.round(value * 100);
}
