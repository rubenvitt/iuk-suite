import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { getDb } from "../../../_db/client";
import { requireGemeinschaftHost } from "../../../_lib/host";
import { istLinkCode } from "../../../_lib/kennung";
import { anfrageNachCode } from "../../../_lib/vermietung";
import { Statusansicht } from "../../../_ui/bar/Statusansicht";
import { OffenerRahmen } from "../../../_ui/offen/OffenerRahmen";

export const dynamic = "force-dynamic";
// Der Link ist der Schlüssel: nicht in Suchmaschinen, nicht im Referrer an fremde Seiten.
export const metadata: Metadata = { title: "Deine Anfrage", robots: { index: false, follow: false }, referrer: "no-referrer" };

/**
 * `/status/<code>` — der Stand einer Bar-Anfrage, nur über den Code (nie über die Kennung). Ein unbekannter oder
 * formal falscher Code ist `notFound()`, aufgefangen von `status/not-found.tsx` ohne Details. Bewusst KEINE
 * `loading.tsx` in diesem Zweig: darunter würde das `notFound()` zu einem HTTP 200 (Falle 23).
 */
export default async function StatusSeite({ params, searchParams }: { params: Promise<{ code: string }>; searchParams: Promise<{ neu?: string | string[] }> }) {
  requireGemeinschaftHost(await headers());
  const { code } = await params;
  if (!istLinkCode(code)) notFound();
  const a = anfrageNachCode(getDb(), code);
  if (!a) notFound();
  return (
    <OffenerRahmen kicker="Gemeinschaft · Bar">
      <h1 className="go-titel">Stand deiner Anfrage</h1>
      <Statusansicht code={code} a={a} neu={(await searchParams).neu === "1"} />
    </OffenerRahmen>
  );
}
