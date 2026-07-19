const UMLAUT_MAP: Record<string, string> = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" };

export function slugify(input: string): string {
  const lower = input.toLowerCase();
  const transliterated = lower.replace(/[äöüß]/g, (c) => UMLAUT_MAP[c] ?? c);
  const slug = transliterated
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    // Erst schneiden, dann trimmen: umgekehrt kann der Schnitt auf 60 Zeichen
    // mitten in einem Trennstrich landen und einen Bindestrich am Ende stehen
    // lassen. Slugs sind zugleich Preset-IDs, und die ID-Prüfung verbietet den.
    .slice(0, 60)
    .replace(/^-+|-+$/g, "");
  return slug || "preset";
}

/** `taken` beantwortet, ob eine ID schon vergeben ist — so bleibt die Funktion
 *  ohne DB testbar. */
export function uniqueSlug(taken: (id: string) => boolean, base: string): string {
  let candidate = base;
  let suffix = 2;
  while (taken(candidate)) {
    candidate = `${base}-${suffix++}`;
    if (suffix > 1000) throw new Error("uniqueSlug: Suffix-Raum erschöpft");
  }
  return candidate;
}
