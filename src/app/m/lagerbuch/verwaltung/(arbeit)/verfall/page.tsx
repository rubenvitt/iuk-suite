import type { ReactNode } from "react";
import Link from "next/link";
import { Card, Empty } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { getDb, type DB } from "../../../_db/client";
import { ampelTon } from "../../../_lib/format";
import { lagerortVerfallListe, verfallListe } from "../../../_lib/lesepfade/verfall";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import s from "../../../_ui/verwaltung.module.css";
import { AussondernRow } from "./AussondernRow";
import { VerfallItem } from "./VerfallItem";

export const dynamic = "force-dynamic";

/**
 * Diese Ansicht bleibt eine Kartenliste mit eigenem `ul`/`li`: Handlager-
 * Chargen tragen Plakette und gegebenenfalls eine Aktion, Fahrzeugmeldungen
 * dagegen nur ihren Meldekontext. Die beiden Quellen bleiben deshalb auch in
 * getrennten Karten; eine Fahrzeugmeldung kann hier nicht ausgesondert werden.
 */
export function verfallSeitenInhalt(db: DB, jetzt: Date): ReactNode {
  const chargen = verfallListe(db, jetzt);
  const gemeldet = lagerortVerfallListe(db, { nurWarnend: true }, jetzt);

  return (
    <>
      <SeitenKopf
        titel="Verfall"
        beschreibung="Chargen im Handlager nach Verfallsampel — und die im Fahrzeug gemeldeten Angaben."
      />

      <Card title="Chargen im Handlager" style={{ marginBlockEnd: SPACE.xl }}>
        {chargen.length === 0 ? (
          <Empty description="Keine auffällige Charge im Handlager." />
        ) : (
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {chargen.map((charge) => (
              <VerfallItem
                key={charge.chargeId}
                artikelName={charge.artikelName}
                chargenNr={charge.chargenNr}
                verfall={charge.verfall}
                ampel={charge.ampel}
                text={charge.text}
                rest={charge.rest}
                einheit={charge.einheit}
                aktion={charge.abgelaufen ? (
                  <AussondernRow
                    chargeId={charge.chargeId}
                    bezeichnung={`${charge.chargenNr} · ${charge.artikelName}`}
                  />
                ) : undefined}
              />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Im Fahrzeug gemeldet">
        {gemeldet.length === 0 ? (
          <Empty description="Keine auffällige Verfallsmeldung aus einem Fahrzeug." />
        ) : (
          <ul role="list" style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {gemeldet.map((meldung) => (
              <li
                role="listitem"
                key={`${meldung.lagerortId}:${meldung.artikelId}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: SPACE.md,
                  padding: `${SPACE.md}px 0`,
                  borderBlockEnd: "1px solid var(--lb-linie)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ ...SCHRIFT.text, fontWeight: 600 }}>{meldung.artikelName}</div>
                  <div
                    style={{
                      display: "flex",
                      // 6 liegt nicht auf der SPACE-Skala; bleibt Literal.
                      gap: 6,
                      flexWrap: "wrap",
                      marginBlockStart: SPACE.xs,
                    }}
                  >
                    <Link
                      href={`/verwaltung/fahrzeuge/${meldung.lagerortId}`}
                      className={s.fach}
                    >
                      {meldung.lagerortName}
                      {meldung.lagerortKennung ? ` · ${meldung.lagerortKennung}` : ""}
                    </Link>
                    <Chip ton={ampelTon(meldung.ampel)}>{meldung.text}</Chip>
                    <span style={SCHRIFT.neben}>
                      gemeldet {meldung.erfasstAt.toLocaleDateString("de-DE", {
                        timeZone: "Europe/Berlin",
                      })}
                    </span>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function VerfallSeite() {
  return verfallSeitenInhalt(getDb(), new Date());
}
