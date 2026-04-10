export function toBytes(value: string): number[] {
  return Array.from(new TextEncoder().encode(value.trim()));
}

export function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function shortId(value: string, size = 6): string {
  if (!value) return "";
  if (value.length <= size * 2 + 2) return value;
  return `${value.slice(0, size + 2)}...${value.slice(-size)}`;
}
