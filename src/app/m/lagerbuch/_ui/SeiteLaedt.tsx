import { Card, Col, Row } from "antd";
import { SPACE } from "@/core/theme/tokens";

/**
 * DER LADEZUSTAND DER SECHS DETAILROUTEN (DRK-201).
 *
 * ⛔ WARUM ES IHN SEIT DEM 19.09.2026 GIBT, und warum die alte Entscheidung
 * NICHT falsch war, sondern nur halb: das Modul verbot `loading.tsx`
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
 * ⚠️ GEMESSEN WURDE DAS AM 2026-08-14 GEGEN `next dev` (Geraetedetailseite,
 * kaltes `.next`): keine einzige Anfrage mit `next-router-prefetch`, Antwort
 * bei 6213 ms, Adresswechsel bei 6519 ms — also erst NACH der Antwort. Genau
 * deshalb ist der Unterschied niemandem aufgefallen: die Testsuite faehrt
 * gegen `next dev` und kann ihn strukturell nicht sehen.
 *
 * ⛔ UND DESHALB BELEGT KEIN GRUENER E2E-LAUF DIE WIRKUNG. Was hier geprueft
 * werden KANN, ist die Bauform (`SeiteLaedt.test.tsx`); die Wirkung liegt in
 * einem `build`/`start`-Lauf oder in Produktion. Wer das verwechselt, haelt
 * einen gruenen Playwright-Lauf fuer einen Nachweis, den er nicht fuehrt.
 *
 * ⛔ SERVER COMPONENT, UND DAS IST DIE TEURE HAELFTE. Eine `loading.tsx` ist
 * eine Server Component; ein `Skeleton.Button` waere ein Compound-Zugriff und
 * dort `undefined` — HTTP 500, und zwar genau dann, wenn der Ladezustand
 * greifen soll. Aus demselben Grund kein Zeichen aus dem antd-Zeichenpaket:
 * das ergaebe 500 schon beim Import. `<Card loading />` ist die Form, die das
 * Repo dafuer bereits fuehrt (Vorbild `files/_ui/SharesUebersicht.tsx`,
 * Suspense-Grenze der Ablage-Kachel).
 *
 * ⚠️ EIN BAUTEIL FUER ALLE SECHS, NICHT SECHS KOPIEN. Die Routen tragen
 * unterschiedliche Inhalte, aber denselben Aufbau — Kopf, dann Karten. Sechs
 * handgepflegte Fassungen liefen auseinander, und die erste, die es taete,
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
