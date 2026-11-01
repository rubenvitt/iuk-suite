import type { Metadata } from "next";
import { headers } from "next/headers";
import { auth } from "@/core/auth";
import { tagesGrenzenInZone } from "@/core/zeit";
import { getDb } from "../../_db/client";
import { oeffentlicheBelegung } from "../../_lib/belegung";
import { requireGemeinschaftHost } from "../../_lib/host";
import { ladeBelegendeEintraege } from "../../_lib/vermietung";
import { tagInZone } from "../../_lib/zeit";
import { BarAnfrage, type Vorbelegung } from "../../_ui/bar/BarAnfrage";
import { OffenerRahmen } from "../../_ui/offen/OffenerRahmen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Bar mieten" };

/**
 * `/bar` — Bar anfragen, ohne Anmeldung (IDA-315). Öffentlich steht nur „frei“ oder „belegt“: die Seite bekommt
 * zusammengelegte Zeiträume ohne Titel, Kennung oder Art (`oeffentlicheBelegung`). Ist jemand in der Suite
 * angemeldet (egal welche Gruppe), sind Name und E-Mail vorausgefüllt — ohne Anmeldung kein Zwang.
 */
export default async function BarSeite() {
  requireGemeinschaftHost(await headers());
  // Ein unlesbares Sitzungs-Cookie macht die öffentliche Seite nicht kaputt (wie `app/login/page.tsx`).
  const viewer = await auth().then((s) => s?.user ?? null, () => null);
  // `new Date()` statt `Date.now()`: `react-hooks/purity` (Vorbild `files/(verwaltung)/posteingang/page.tsx`).
  const jetzt = new Date().getTime();
  const heute = tagInZone(jetzt);
  const belegt = oeffentlicheBelegung(ladeBelegendeEintraege(getDb(), tagesGrenzenInZone(heute).von));
  const vorbelegung: Vorbelegung = viewer ? { name: viewer.name ?? "", kontakt: viewer.email ?? "" } : null;
  return (
    <OffenerRahmen kicker="Gemeinschaft · Bar">
      <h1 className="go-titel">Bar mieten</h1>
      <p className="go-text" style={{ marginTop: 8 }}>
        Hier siehst du, wann die Bar frei ist, und kannst sie für deine Veranstaltung anfragen. Ob es klappt, siehst du danach über einen Link.
      </p>
      <BarAnfrage belegt={belegt} heute={heute} vorbelegung={vorbelegung} anmeldeHref={`/login?callbackUrl=${encodeURIComponent("/bar")}`} />
    </OffenerRahmen>
  );
}
