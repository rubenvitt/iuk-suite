import type { Metadata } from "next";
import { headers } from "next/headers";
import { getDb } from "../../../_db/client";
import { requireGemeinschaftHost } from "../../../_lib/host";
import { meineSeite, mitgliedZuLink } from "../../../_lib/meinLink";
import { MeineSeite } from "../../../_ui/mein/MeineSeite";
import { OffenerRahmen } from "../../../_ui/offen/OffenerRahmen";
import s from "../../../_ui/mein/mein.module.css";

export const dynamic = "force-dynamic";

/**
 * Wer den Link hat, kommt hinein: kein Name im Titel (Verlauf, Vorschaukarten), keine Suchmaschine, kein Referer
 * (sonst trüge jeder Klick nach außen den Link mit). Vorbild `kommplan/_lib/tokenMetadaten.ts`. Die Antwortköpfe
 * (`no-store`, `noindex`, `no-referrer`) setzt nur der Proxy — dafür braucht `VERTRAULICHE_ANSICHTEN` in
 * `core/registry.ts` einen Eintrag für `/m/gemeinschaft/mein/`.
 */
export const metadata: Metadata = {
  title: "Gemeinschaft",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
  referrer: "no-referrer",
};

/**
 * Der persönliche Link eines Mitglieds (`/mein/<link>`), ohne Anmeldung und ohne antd. Das Mitglied kommt nur
 * über den Code aus der Datenbank. Ein ungültiger Link bekommt eine freundliche Seite ohne Details — bewusst
 * kein `notFound()`: wer einen erneuerten Link aufruft, soll erfahren, was zu tun ist.
 */
export default async function MeinLinkSeite({ params }: { params: Promise<{ link: string }> }) {
  requireGemeinschaftHost(await headers());
  const { link } = await params;
  const db = getDb();
  const mitglied = mitgliedZuLink(db, link);
  if (!mitglied) {
    return (
      <OffenerRahmen kicker="Gemeinschaft">
        <h1 className="go-titel">Link nicht gültig</h1>
        <div className={s.karte} style={{ marginTop: 20 }}>
          <p className="go-text">Dieser Link gilt nicht mehr. Frag bei der Leitung der Gemeinschaft nach einem neuen.</p>
        </div>
      </OffenerRahmen>
    );
  }
  return (
    <OffenerRahmen kicker="Gemeinschaft">
      <MeineSeite link={link} daten={meineSeite(db, mitglied)} />
    </OffenerRahmen>
  );
}
