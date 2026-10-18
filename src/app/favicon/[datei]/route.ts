import { pngZuDatei, zeichenZuDatei } from "@/core/favicon";

/**
 * Die Favicons und App-Icons der Suite, auf JEDEM Host unter
 * `/favicon/<name>.svg` bzw. `/favicon/<zeichen>-<raster>.png` — der Pfad
 * steht in der Durchlassliste von `core/routing.ts` und wird nicht in ein
 * Modul umgeschrieben. Welches Zeichen eine Seite verlinkt, entscheidet
 * `core/favicon`.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ datei: string }> }) {
  const datei = (await params).datei;
  const svg = zeichenZuDatei(datei);
  const png = svg ? null : pngZuDatei(datei);
  if (!svg && !png) return new Response("Nicht gefunden", { status: 404 });
  return new Response(svg ?? new Uint8Array(png!), {
    headers: {
      "Content-Type": svg ? "image/svg+xml" : "image/png",
      // Die Links tragen die Prüfsumme als `?v=`, ein neues Zeichen ist eine neue URL.
      "Cache-Control": "public, max-age=604800",
    },
  });
}
