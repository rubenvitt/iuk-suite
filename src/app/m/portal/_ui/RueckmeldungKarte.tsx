import { Card } from "antd";

import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * DER WEG ZUM RÜCKMELDEFORMULAR AUF DER PORTAL-STARTSEITE (DRK-453) — der
 * zweite der drei Wege. Die anderen beiden sind der Eintrag im Avatar-Menü
 * (`core/shell/SuiteNav`) und der schwebende Knopf auf den Arbeitsflächen
 * (`core/rueckmeldung`), der nach einmaliger Benutzung verschwindet.
 *
 * ⚠️ WARUM DIESE DATEI IM MODUL LIEGT UND NICHT IN `core/rueckmeldung`, obwohl
 * der Rest der Einbindung dort steht: der Maßstab für `core` ist ein zweiter,
 * heute belegbarer Nutznießer (`docs/design/README.md`). Für die Adresse und
 * ihre Prüfung gibt es den — `FullShell` und `SuiteHeader` lesen beide
 * `rueckmeldungUrl()`. Für DIESE Kachel gibt es ihn nicht: sie steht auf genau
 * einer Seite, sie trägt die Kachelsprache des Portals (`portal.css`), und ein
 * zweites Modul mit einer Startseite voller Kacheln existiert nicht.
 *
 * ⚠️ SIE IST GEBAUT WIE EINE DIENSTE-KACHEL, NICHT WIE EIN EIGENER ENTWURF, und
 * das ist die tragende Entscheidung. `portal-kachel-link` und `portal-kachel`
 * sind die beiden Klassen, an denen die Kachelkante und der Fokusabgriff aus
 * `portal.css` hängen — `e2e/portal.spec.ts` misst sie in Ruhe und im Hover.
 * Eine Karte, die daneben anders aussähe, wäre für den Leser ein anderer
 * Gegenstand, obwohl sie dasselbe tut: ein Link auf eine Fläche.
 *
 * ⚠️ DER LINK LIEGT AUSSEN UM DIE `Card`, weil antds Card kein `<a>` rendert —
 * übernommen aus `DiensteRaster`, wo derselbe Satz steht. Innen wäre nur der
 * Text anklickbar, und die Kachel sähe bedienbar aus, ohne es zu sein.
 *
 * KEIN `"use client"` und kein Icon: `@ant-design/icons` in einer Server
 * Component ist HTTP 500 schon beim Import (Falle 7), und `Card` selbst ist als
 * Direktimport unbedenklich (Falle 1 betrifft den COMPOUND-Zugriff, also
 * `Card.Meta`). Es gibt hier auch nichts zu bedienen — ein Link braucht keinen
 * Zustand.
 */
export function RueckmeldungKarte({ url }: { url: string }) {
  return (
    /*
     * ⚠️ DER ABSTAND NACH OBEN GEHÖRT HIERHER, NICHT AUF DIE SEITE.
     * `DiensteRaster` ist eine Flexspalte mit eigenem `gap`; diese Kachel steht
     * als Geschwister DANEBEN und bekäme davon nichts ab. Ohne die Zeile klebt
     * sie an der letzten Dienstezeile.
     *
     * `maxInlineSize` deckelt die Breite auf etwa eine Kachel: über die volle
     * Inhaltsbreite gezogen wäre dieselbe Karte optisch das Wichtigste auf der
     * Seite — und das ist der Rückmeldeweg ausdrücklich nicht.
     */
    <section style={{ marginBlockStart: SPACE.lg, maxInlineSize: 420 }}>
      {/* Dieselbe Abschnittsüberschrift wie über den Dienste-Gruppen in
          `DiensteRaster` — die Kachel steht damit in derselben Gliederung und
          nicht daneben. `--iuk-gedaempft` statt `opacity`: Deckkraft dimmt den
          Kontrast unprüfbar mit und hat keinen Dunkelzweig. */}
      <h2
        style={{ ...SCHRIFT.kicker, color: "var(--iuk-gedaempft)", marginBlock: "0 12px" }}
      >
        Rückmeldung
      </h2>
      <a
        href={url}
        target="_blank"
        /* `rel` gehört zu `target="_blank"`: ohne `noopener` bekäme die fremde
           Seite über `window.opener` einen Griff auf das Fenster der Suite. */
        rel="noopener noreferrer"
        data-testid="portal-feedback"
        className="portal-kachel-link"
        style={{ display: "block" }}
      >
        <Card hoverable size="small" className="portal-kachel">
          <span style={SCHRIFT.unterTitel}>Feedback geben</span>
          <div
            style={{
              ...SCHRIFT.neben,
              color: "var(--iuk-gedaempft)",
              marginBlockStart: SPACE.xs,
            }}
          >
            {/* ⚠️ „öffnet in einem neuen Tab" steht da, weil es stimmt und weil
                ein Link, der unangekündigt das Fenster wechselt, für jeden ein
                Bruch ist, der gerade nicht hinsieht. */}
            Etwas klappt nicht, fehlt oder geht besser? Schreib es auf — das Formular öffnet in
            einem neuen Tab.
          </div>
        </Card>
      </a>
    </section>
  );
}
