import { Card, Col, Row } from "antd";
import { SPACE } from "@/core/theme/tokens";

/**
 * DER LADEZUSTAND DER DETAILROUTEN (DRK-201, DRK-424) — lagerbuch mit sieben
 * Detailrouten, feedback mit dem Cockpit. Er liegt in `core`, seit ihn ein
 * zweites Modul braucht; vorher war er `lagerbuch/_ui/SeiteLaedt.tsx`.
 *
 * ⛔ WARUM ES IHN SEIT DEM 19.09.2026 GIBT, und warum die alte Entscheidung
 * NICHT falsch war, sondern nur halb: lagerbuch verbot `loading.tsx`
 * ausdruecklich, mit der Begruendung „alle Einstiegsseiten sind
 * `force-dynamic`; jede Navigation wartet in BEIDEN WELTEN auf denselben
 * Server-Rundlauf. Eine Ladegrenze kuerzte nichts ab, sondern erzeugte eine
 * zweite Anmutung."
 *
 * Der erste Halbsatz gilt nur unter `next dev`. Nexts eigene Doku schreibt aus,
 * dass Vorabladen AUSSCHLIESSLICH in Produktion stattfindet — und dort wird
 * eine dynamische Route MIT `loading.tsx` partiell vorabgeladen: die Adresse
 * wechselt sofort statt erst nach dem Rundlauf. Ohne die Datei bekommt der
 * Anwender bis zur fertigen Seite GAR NICHTS: keine neue Adresse, keinen
 * Ladezustand, keine Rueckmeldung. Die Anwendung wirkt eingefroren.
 *
 * ⚠️ GEMESSEN (DRK-424, 24.09.2026, `build`/`start`, 150 ms Rundlaufzeit
 * simuliert): Gruppenliste → feedback-Cockpit ohne Grenze 432 ms ohne jede
 * Reaktion, mit Grenze Adresse und Ladezustand nach 47 ms. Unter `next dev`
 * (2026-08-14, Geraetedetailseite) gab es dagegen keine einzige Anfrage mit
 * `next-router-prefetch` — die Testsuite faehrt gegen `next dev` und kann den
 * Unterschied strukturell nicht sehen.
 *
 * ⛔ UND DESHALB BELEGT KEIN GRUENER E2E-LAUF DIE WIRKUNG. Was hier geprueft
 * werden KANN, ist die Bauform (`SeiteLaedt.test.tsx`); die Wirkung liegt in
 * einem `build`/`start`-Lauf oder in Produktion. Wer das verwechselt, haelt
 * einen gruenen Playwright-Lauf fuer einen Nachweis, den er nicht fuehrt.
 *
 * ⚠️ VORABGELADEN WIRD NUR UEBER `<Link>` (oder den Router). Ein antd-`Button`
 * mit `href`, ein QR-Code und ein externer Link sind harte Aufrufe — dort
 * bringt eine Ladegrenze keinen Adresswechsel, sondern nur einen gestreamten
 * Ladezustand vor der fertigen Seite. Wo eine Detailroute nur so erreicht
 * wird, gehoert keine Grenze hin (DRK-424: files, Trend, oeffentliche Seiten).
 *
 * ⛔ DER PREIS: OHNE JAVASCRIPT BLEIBT DIE SEITE BEIM LADEZUSTAND STEHEN. Die
 * Grenze ist eine Suspense-Grenze; beim harten Aufruf streamt React erst
 * diesen Ladezustand und reicht den Inhalt versteckt nach — eingetauscht wird
 * er von einem Skript. Gemessen am Cockpit: 31 statt 2131 Zeichen sichtbarer
 * Text. Wo eine Seite ohne JavaScript lesbar bleiben MUSS, keine Grenze.
 *
 * ⛔ SERVER COMPONENT, UND DAS IST DIE TEURE HAELFTE. Eine `loading.tsx` ist
 * eine Server Component; ein `Skeleton.Button` waere ein Compound-Zugriff und
 * dort `undefined` — HTTP 500, und zwar genau dann, wenn der Ladezustand
 * greifen soll. Aus demselben Grund kein Zeichen aus dem antd-Zeichenpaket:
 * das ergaebe 500 schon beim Import. `<Card loading />` ist die Form, die das
 * Repo dafuer bereits fuehrt (Vorbild `files/_ui/SharesUebersicht.tsx`,
 * Suspense-Grenze der Ablage-Kachel).
 *
 * ⚠️ EIN BAUTEIL FUER ALLE GRENZEN, NICHT EINE KOPIE JE ROUTE. Die Routen
 * tragen unterschiedliche Inhalte, aber denselben Aufbau — Kopf, dann Karten.
 * Handgepflegte Fassungen liefen auseinander, und die erste, die es taete,
 * faenge niemand: ein Ladezustand steht nie lange genug auf dem Schirm, als
 * dass jemand ihn pruefte.
 */
export function SeiteLaedt() {
  return (
    <>
      {/* Der Platz des Seitenkopfs — eine Zeile Titel, eine Zeile Beschreibung. */}
      <Card loading style={{ marginBlockEnd: SPACE.lg }} />
      <Row gutter={[SPACE.md, SPACE.md]}>
        <Col xs={24} md={12}>
          <Card loading />
        </Col>
        <Col xs={24} md={12}>
          <Card loading />
        </Col>
      </Row>
    </>
  );
}
