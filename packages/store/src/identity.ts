/** Blocking key only; it is intentionally not a full transliteration algorithm. */
export function phoneticNormalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort((left, right) => left.localeCompare(right))
    .join("-");
}

export function phoneSuffix(phone: string, n = 4): string {
  if (!Number.isInteger(n) || n < 1) throw new Error("phone suffix length must be a positive integer");
  return phone.replace(/\D/g, "").slice(-n);
}
