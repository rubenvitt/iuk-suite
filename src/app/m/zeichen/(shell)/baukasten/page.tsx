import { Alert, Card } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SPACE } from "@/core/theme/tokens";
import { BaukastenLader } from "../../_ui/baukasten/BaukastenLader";
import { VORBEHALT } from "../../_lib/vorbehalt";

/*
 * DIE RSC-HUELLE. Sie fasst den Katalog NICHT an: `BaukastenLader` ist eine
 * Client-Komponente, und eine KOMPONENTE ueber die RSC-Grenze zu reichen ist die
 * gewoehnliche Naht — Falle 6 betrifft WERTE aus "use client"-Modulen, nicht
 * Komponenten. Die Insel selbst wird NIRGENDS direkt importiert; nur der Lader
 * kennt sie, und er laedt sie mit `dynamic(..., { ssr: false })`
 * (`_lib/naht.test.ts`).
 *
 * ⛔ Kein `Typography.Title`, kein `Descriptions.Item` (Falle 1): natives `<h1>`
 * kommt aus `Seitenkopf`. Kein `@ant-design/icons` (Falle 7) — `showIcon` an
 * `Alert` ist keiner, das Zeichen kommt aus antds eigenem Bundle.
 *
 * DER VORBEHALT KOMMT AUS `_lib/vorbehalt.ts`, nicht als abgeschriebener Satz:
 * eine zweite Fassung liefe von der auf der Startseite und auf `/lernen`
 * auseinander, und kein Tor saehe es.
 */
export default function BaukastenSeite() {
  return (
    <>
      <Seitenkopf
        titel="Baukasten"
        beschreibung="Ein Zeichen zusammenstellen, herunterladen und speichern."
      />
      {/* `type="warning"`, nie `type="error"` — Falle 3. */}
      <Alert
        type="warning"
        showIcon
        style={{ marginBlockEnd: SPACE.lg }}
        title={<span data-testid="zeichen-vorbehalt">{VORBEHALT.titel}</span>}
        description={VORBEHALT.text}
      />
      <Card>
        <BaukastenLader />
      </Card>
    </>
  );
}
