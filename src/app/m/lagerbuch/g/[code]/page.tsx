import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Button } from "antd";
import { requireLagerbuchHost } from "@/app/m/lagerbuch/_lib/host";
import { viewerOderNull, istLagerbuchAdmin } from "@/app/m/lagerbuch/_lib/zugang";
import { helferZugangOderNull } from "@/app/m/lagerbuch/_lib/helferZugang";
import { normalisiereBarcode } from "@/app/m/lagerbuch/_lib/barcode";
import { geraetByBarcode } from "@/app/m/lagerbuch/_lib/lesepfade/geraete";
import { bzGeraetByBarcode } from "@/app/m/lagerbuch/_lib/lesepfade/bz";
import { getDb } from "@/app/m/lagerbuch/_db/client";
import { VerwaltungsRahmen } from "@/app/m/lagerbuch/_ui/VerwaltungsRahmen";
import { SeitenKopf } from "@/app/m/lagerbuch/_ui/SeitenKopf";
import { LAGERBUCH_NAV } from "@/app/m/lagerbuch/_lib/nav";
import {
  BARCODE_TITEL, BARCODE_TEXT, BARCODE_NOCHMAL, BARCODE_LISTE,
} from "@/app/m/lagerbuch/_lib/zustandTexte";

export const dynamic = "force-dynamic";

/**
 * DEEP-LINK VOM GESCANNTEN GERAETE-BARCODE (Spec §8.1 Form 4, §11.3, 8-C2).
 *
 * DIESE DATEI IST EINE ROLLEN-WEICHE, KEIN GERIEGELTER BEREICH (§3.2.1). Hier
 * ist „keine Sitzung" ein DRITTER gueltiger Fall, kein Fehlerfall — deshalb
 * steht hier das nicht-werfende Paar viewerOderNull + istLagerbuchAdmin und
 * NICHT requireLagerbuchAdmin. Ein Riegel schickte jeden anonymen Scan nach
 * /login statt aufs Gate: genau der Ausfall, gegen den requiresAuth:false gebaut
 * ist (§11.5, Zustand 18). _lib/bauform.test.ts haelt das fest.
 *
 * requireLagerbuchHost ist die ERSTE Anweisung (§2.6): ohne sie beantwortet
 * JEDER Host, der auf den Suite-Container terminiert, /m/lagerbuch/g/<code> —
 * decideRoute gatet interne Pfade nach dem SEGMENT, nicht nach dem Host, und fuer
 * ein Modul mit requiresAuth:false steigt canAccess sofort mit true aus
 * (Falle 61).
 *
 * DER BARCODE-NAMENSRAUM IST GLOBAL EINDEUTIG ueber generische Geraete UND
 * BZ-Geraete (geraetSpeichern prueft das beim Anlegen), daher genuegt „erst
 * Geraete, dann BZ".
 *
 * FALLE 29: der Routenparameter wird normalisiert, BEVOR gesucht wird. Beide
 * Schreibwege trimmen (actions/geraete.ts, actions/bz.ts) und der andere
 * Leseweg ebenfalls (db/geraete.ts) — ein roh durchgereichter Parameter waere
 * die einzige unnormalisierte Lesestelle des Bestands. Trimmen kann nur
 * Treffer HINZUFUEGEN, nie einen bestehenden verlieren.
 *
 * DER EINE GERENDERTE ZUSTAND traegt _ui/VerwaltungsRahmen.tsx, also Shell und
 * Modulnavigation (§2.9). Das ist kein Zierrat: „ohne Shell und ohne
 * Modulnavigation" ist der ERSTE der drei Maengel, die 8-C2 behebt —
 * not-found.tsx schriebe genau das ueber sich selbst aus. Ein eigener,
 * shell-loser Rahmen baute den Mangel nach.
 *
 * ANTD IN EINER SERVER COMPONENT: `Button` ist gedeckt (die Suite-404 benutzt
 * ihn so), ebenso Card/Result/Table/Tag. Verboten ist der COMPOUND-Zugriff
 * (Typography.Title & Geschwister, Falle 1) und JEDER @ant-design/icons-Import
 * — der wirft schon beim Import, und "use client" behebt das nicht, es macht
 * es still (Falle 7).
 */
type Props = { params: Promise<{ code: string }> };

export default async function GeraetDeepLink({ params }: Props) {
  requireLagerbuchHost(await headers());
  const { code } = await params;

  const viewer = await viewerOderNull();
  if (!istLagerbuchAdmin(viewer)) {
    // Kein Verwaltungsrecht: eine Helfer-Geraeteansicht gibt es in V1 nicht.
    const helfer = await helferZugangOderNull(getDb());
    if (helfer) redirect("/helfer");
    // AUFS GATE, nie nach /login — mit Rueckkehrziel in AEUSSERER Pfadform.
    redirect(`/?returnTo=${encodeURIComponent(`/g/${code}`)}`);
  }

  const gesucht = normalisiereBarcode(code);
  const db = getDb();

  const ger = geraetByBarcode(db, gesucht);
  if (ger) redirect(`/verwaltung/geraete/${ger.id}`);
  const bz = bzGeraetByBarcode(db, gesucht);
  if (bz) redirect(`/verwaltung/bz/${bz.id}`);

  /**
   * §11.5, ZUSTAND 15 — HTTP 200 statt 404 (Entscheidung 8-C2). notFound() ist
   * hier absichtlich nicht aufgerufen: die Suite-404 spricht von „dieser
   * Suite" und verweist an „die Administration" — auf einem Host, der bis
   * eben nur die Wortmarke des Moduls zeigte —, und sie nennt den gescannten
   * Code nicht.
   *
   * §11.7: BEIDE Wege stehen IM Zustand und werden nicht durch die Navigation
   * ersetzt.
   */
  return (
    <VerwaltungsRahmen nav={LAGERBUCH_NAV}>
      {/* Review-Nachtrag T164: nacktes <h1>/<p> ersetzt durch den etablierten
         Seitenkopf — jede andere Verwaltungsseite unter demselben Rahmen setzt
         ihre Ueberschrift so (_ui/SeitenKopf.tsx), sonst faellt die Typografie
         auf Default zurueck und weicht sichtbar von zwanzig anderen Seiten ab. */}
      <SeitenKopf titel={BARCODE_TITEL} beschreibung={BARCODE_TEXT} />
      <p>
        Gescannt:{" "}
        <code data-testid="lb-barcode-code">{code}</code>
        {" — bitte mit dem Typenschild vergleichen."}
      </p>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {/* Kein `size`: controlHeight ist 56 und schon das richtige Mass (Falle 4). */}
        <Button
          type="primary"
          href="/verwaltung/geraete/scan"
          data-testid="lb-barcode-nochmal"
        >
          {BARCODE_NOCHMAL}
        </Button>
        <Button href="/verwaltung/geraete" data-testid="lb-barcode-liste">
          {BARCODE_LISTE}
        </Button>
      </div>
    </VerwaltungsRahmen>
  );
}
