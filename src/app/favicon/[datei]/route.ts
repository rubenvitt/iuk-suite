import { zeichenZuDatei } from "@/core/favicon";

/**
 * Die Favicons der Suite, auf JEDEM Host unter `/favicon/<name>.svg` — der Pfad
 * steht in der Durchlassliste von `core/routing.ts` und wird nicht in ein Modul
 * umgeschrieben. Welches Zeichen eine Seite verlinkt, entscheidet
 * `core/favicon`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ datei: string }> }) {
  const svg = zeichenZuDatei((await params).datei);
  if (!svg) return new Response("Nicht gefunden", { status: 404 });
  return new Response(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      // Die Links tragen die Prüfsumme als `?v=`, ein neues Zeichen ist eine neue URL.
      "Cache-Control": "public, max-age=604800",
    },
  });
}
