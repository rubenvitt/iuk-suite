export function parseGroups(source: Record<string, unknown>, claim = process.env.POCKET_ID_GROUPS_CLAIM ?? "groups"): string[] {
  const value = source[claim];
  return Array.isArray(value) ? (value as string[]) : [];
}

export function parseDevGroups(raw: unknown): string[] {
  return String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
