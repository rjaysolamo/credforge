export function shortId(value: string, size = 6): string {
  if (!value) return "";
  if (value.length <= size * 2 + 2) return value;
  return `${value.slice(0, size + 2)}...${value.slice(-size)}`;
}

export function asIssuerList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.filter((v): v is string => typeof v === "string");

  const maybeContents = (raw as { fields?: { contents?: unknown[] } })?.fields
    ?.contents;

  if (Array.isArray(maybeContents)) {
    return maybeContents.filter((v): v is string => typeof v === "string");
  }

  return [];
}
