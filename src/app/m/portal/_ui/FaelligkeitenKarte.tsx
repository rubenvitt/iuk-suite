import { Card } from "antd";

import type { Zaehlung } from "@/app/m/portal/_lib/faelligkeiten/sammeln";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * DIE KACHEL „WAS STEHT AN" AUF DER PORTAL-STARTSEITE (IDA-297) — nur für Personen, die mindestens ein
 * Quellmodul verwalten (`sichtbareQuellen`); die Seite entscheidet das, nicht die Kachel.
 *
 * Gebaut wie `RueckmeldungKarte`: dieselben Klassen `portal-kachel-link`/`portal-kachel`, an denen
 * Kachelkante und Fokus aus `portal.css` hängen, der Link außen um die `Card` (antds Card rendert kein
 * `<a>`). Kein `"use client"`, kein Icon (Falle 7).
 *
 * Sie steht ÜBER den Diensten: was fällig ist, soll man sehen, ohne zu scrollen — und eine Kachel, die
 * „nichts" sagt, ist auch eine Auskunft.
 */
export function FaelligkeitenKarte({ zaehlung, ausgefallen }: { zaehlung: Zaehlung; ausgefallen: boolean }) {
  const { ueberfaellig, bald } = zaehlung;
  const teile = [ueberfaellig > 0 && `${ueberfaellig} überfällig`, bald > 0 && `${bald} bald fällig`].filter(Boolean);
  const text = teile.length > 0
    ? teile.join(" · ")
    : ausgefallen ? "Nicht alles war lesbar — sieh in der Liste nach." : "Gerade steht nichts an.";
  return (
    <section style={{ marginBlockEnd: SPACE.lg, maxInlineSize: 420 }}>
      <h2 style={{ ...SCHRIFT.kicker, color: "var(--iuk-gedaempft)", marginBlock: "0 12px" }}>Fristen</h2>
      <a href="/faelligkeiten" data-testid="portal-faelligkeiten" className="portal-kachel-link" style={{ display: "block" }}>
        <Card hoverable size="small" className="portal-kachel">
          <span style={SCHRIFT.unterTitel}>Was steht an</span>
          <div style={{ ...SCHRIFT.neben, color: "var(--iuk-gedaempft)", marginBlockStart: SPACE.xs }}>{text}</div>
        </Card>
      </a>
    </section>
  );
}
