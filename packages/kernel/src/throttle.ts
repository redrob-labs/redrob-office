export function slowdownPct(timingsMs: readonly number[]): number {
  if (timingsMs.length < 2) {
    return 0;
  }
  const decileSize = Math.max(1, Math.floor(timingsMs.length / 10));
  const first = timingsMs.slice(0, decileSize);
  const last = timingsMs.slice(-decileSize);
  const mean = (values: readonly number[]): number =>
    values.reduce((total, value) => total + value, 0) / values.length;
  const firstMean = mean(first);
  if (firstMean === 0) {
    return 0;
  }
  return ((mean(last) - firstMean) / firstMean) * 100;
}
