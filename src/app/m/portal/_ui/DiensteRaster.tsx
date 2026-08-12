"use client";

import { useMemo, useState } from "react";
import { AppstoreOutlined, LinkOutlined } from "@ant-design/icons";
import { Card, Col, Empty, Input, Result, Row } from "antd";

import { ICONS } from "@/core/shell/icons";
import type { LauncherEintrag } from "@/core/shell/types";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/**
 * DAS PORTAL ALS VOLLFLÄCHIGE ANSICHT DERSELBEN LISTE, die der Umschalter als
 * Popover zeigt. Eine Wahrheit, zwei Darstellungen.
 *
 * Client-Insel, aus zwei Gründen zugleich: die Suche braucht Zustand, und die
 * Icons dürfen nur hier auflösen (`@ant-design/icons` in RSC ist HTTP 500
 * schon beim Import, Falle 7). Die Seite darüber bleibt Server Component und
 * übergibt fertige Daten.
 *
 * KEIN `Alert type="error"` im Leerzustand: `colorError === colorPrimary ===
 * #c8000f`, ein fehlender Zugang sähe damit aus wie eine Primäraktion — und
 * er ist keine Störung, sondern eine Auskunft (Falle 3).
 */
export function DiensteRaster({
  eintraege,
  ansprechpartner,
}: {
  eintraege: LauncherEintrag[];
  ansprechpartner: string | null;
}) {
  const [suche, setSuche] = useState("");

  const abschnitte = useMemo(() => {
    const nadel = suche.trim().toLowerCase();
    const gefiltert = nadel
      ? eintraege.filter(
          (e) =>
            e.title.toLowerCase().includes(nadel) ||
            (e.beschreibung?.toLowerCase().includes(nadel) ?? false),
        )
      : eintraege;
    const map = new Map<string, LauncherEintrag[]>();
    for (const e of gefiltert) {
      const bisher = map.get(e.abschnitt);
      if (bisher) bisher.push(e);
      else map.set(e.abschnitt, [e]);
    }
    return [...map.entries()];
  }, [eintraege, suche]);

  // Nichts freigeschaltet — nicht dasselbe wie „Suche ohne Treffer". Deshalb
  // steht dieser Zweig VOR dem Suchfeld: ein Suchfeld über einer leeren Liste
  // lädt zu einer Suche ein, die nichts finden kann.
  if (eintraege.length === 0) {
    return (
      <Result
        data-testid="portal-leer"
        status="info"
        title="Für dich ist noch nichts freigeschaltet"
        subTitle={
          <>
            <p>
              Welche Apps und Dienste du hier siehst, hängt an deinen Gruppen. Im Moment ist
              für dich keine hinterlegt.
            </p>
            {ansprechpartner ? (
              <p data-testid="portal-kontakt">
                <strong>Ansprechpartner:</strong> {ansprechpartner}
              </p>
            ) : null}
          </>
        }
      />
    );
  }

  return (
    <div
      data-testid="portal-grid"
      style={{ display: "flex", flexDirection: "column", gap: SPACE.lg }}
    >
      <Input
        data-testid="portal-suche"
        type="search"
        value={suche}
        placeholder="Apps und Dienste durchsuchen"
        aria-label="Apps und Dienste durchsuchen"
        onChange={(e) => setSuche(e.target.value)}
        style={{ maxInlineSize: 420 }}
      />

      {abschnitte.length === 0 ? (
        <Empty data-testid="portal-ohne-treffer" description={`Nichts gefunden für „${suche}".`} />
      ) : (
        abschnitte.map(([titel, liste]) => (
          <section key={titel}>
            {/* `--iuk-gedaempft` statt `opacity`: Deckkraft dimmt den Kontrast
                unprüfbar mit und hat keinen Dunkelzweig (übernommen aus der
                Typografie-Runde, die diese Seite zuletzt angefasst hat). */}
            <h2
              data-testid="portal-abschnitt"
              style={{ ...SCHRIFT.kicker, color: "var(--iuk-gedaempft)", marginBlock: "0 12px" }}
            >
              {titel}
            </h2>
            <Row gutter={[SPACE.lg, SPACE.lg]}>
              {liste.map((e) => {
                const Icon = e.icon ? (ICONS[e.icon] ?? AppstoreOutlined) : LinkOutlined;
                return (
                  <Col key={e.key} xs={12} sm={8}>
                    {/* Der Link liegt AUSSEN: antds Card rendert kein <a>, und
                        die Kachel ist die einzige Navigation ins Ziel. */}
                    <a
                      href={e.href}
                      target={e.extern ? "_blank" : undefined}
                      rel={e.extern ? "noopener noreferrer" : undefined}
                      data-testid="service-tile"
                      className="portal-kachel-link"
                      style={{ display: "block", blockSize: "100%" }}
                    >
                      {/* Die beiden Klassen tragen die Kachelkante und den
                          Fokusabgriff aus `portal.css` — `e2e/portal.spec.ts`
                          misst sie in Ruhe und im Hover, und die Kaskade
                          dahinter besitzt kein Quelltext-Scan. Ohne sie fällt
                          der Test, nicht der Build.

                          KEIN Kicker mit `e.abschnitt` auf der Kachel: die
                          Rubrik steht jetzt als Abschnittsüberschrift darüber,
                          und zweimal dasselbe Wort wäre Dekoration im Gewand
                          von Struktur. */}
                      <Card
                        hoverable
                        size="small"
                        className="portal-kachel"
                        style={{ blockSize: "100%" }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          {e.iconUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={e.iconUrl} alt="" width={20} height={20} />
                          ) : (
                            <Icon aria-hidden="true" />
                          )}
                          <span style={SCHRIFT.unterTitel}>{e.title}</span>
                        </div>
                        {e.beschreibung ? (
                          <div
                            style={{
                              ...SCHRIFT.neben,
                              color: "var(--iuk-gedaempft)",
                              marginBlockStart: 4,
                            }}
                          >
                            {e.beschreibung}
                          </div>
                        ) : null}
                      </Card>
                    </a>
                  </Col>
                );
              })}
            </Row>
          </section>
        ))
      )}
    </div>
  );
}
