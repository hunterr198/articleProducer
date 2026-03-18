export function logNormalize(value: number, maxValue: number): number {
  if (maxValue <= 0) return 0;
  if (value <= 0) return 0;
  return (Math.log(1 + value) / Math.log(1 + maxValue)) * 100;
}
