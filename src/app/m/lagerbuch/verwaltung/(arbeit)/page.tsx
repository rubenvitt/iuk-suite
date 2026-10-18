import { Card, Col, Empty, Row } from "antd";
import { headers } from "next/headers";
import Link from "next/link";
import { SPACE } from "@/core/theme/tokens";
import { getDb, type DB } from "../../_db/client";
import { verfallSchwellen, verfallStatus } from "../../_lib/domain/verfall";
import { ampelTon, chargeText, type AmpelTon } from "../../_lib/format";
import { journalZeile } from "../../_lib/journalZeile";
import { requireLagerbuchHost } from "../../_lib/host";
import { artikelListe } from "../../_lib/lesepfade/artikel";
import { kennzahlen } from "../../_lib/lesepfade/bestand";
import {
  journalEintraege,
  type JournalZeileRoh,
} from "../../_lib/lesepfade/journal";
import { SCHRIFT } from "../../_lib/schrift";
import { fmtTs } from "../../_lib/zeit";
import { requireLagerbuchAdmin } from "../../_lib/zugang";
import { Chip } from "../../_ui/Chip";
import { Kachel } from "../../_ui/Kachel";
import { SeitenKopf } from "../../_ui/SeitenKopf";
import s from "../../_ui/verwaltung.module.css";
import {
  LetzteBuchungenTable,
  type UebersichtJournalZeile,
} from "./LetzteBuchungenTable";
import { zeitzone } from "@/core/zeit";

export const dynamic = "force-dynamic";

export type KritischeZeile = {
  id: string;
  name: string;
  fach: string;
  bestand: number;
  mindestbestand: number;
  unterMindest: boolean;
  chargeText: string | null;
  chargeTon: AmpelTon | null;
};

export function kritischeArtikel(db: DB, jetzt: Date): KritischeZeile[] {
  const schwellen = verfallSchwellen();
  return artikelListe(db, {}, jetzt)
    .filter((zeile) => zeile.unterMindest || zeile.chargeKritisch)
    .map((zeile) => {
      const status = zeile.chargeKritisch && zeile.naechsteCharge
        ? verfallStatus(zeile.naechsteCharge.verfall, schwellen, jetzt)
        : null;
      return {
        id: zeile.id,
        name: zeile.name,
        fach: zeile.fach,
        bestand: zeile.bestand,
        mindestbestand: zeile.mindestbestand,
        unterMindest: zeile.unterMindest,
        chargeText: status && zeile.naechsteCharge
          ? chargeText(status, zeile.naechsteCharge.verfall)
          : null,
        chargeTon: status ? ampelTon(status.ampel) : null,
      };
    });
}

/**
 * IDA-239 — SO VIELE KRITISCHE ARTIKEL ZEIGT DIE ÜBERSICHT HÖCHSTENS.
 *
 * Die Liste hatte keine Obergrenze: mit vielen Unterbeständen wurde die
 * Startseite der Verwaltung über 15 000 px lang (gemessen 9 980 px mit 120
 * Unterbeständen bei 1440×900), und „Letzte Buchungen" stand ganz unten. Die
 * Übersicht soll sagen, DASS etwas zu tun ist und WAS zuerst; die vollständige
 * Liste steht einen Klick weiter in der Artikelliste mit passendem Filter.
 */
export const KRITISCH_ANZEIGE = 10;

/**
 * Was zuerst angesehen werden muss: eine rote Charge (abgelaufen bzw. kurz
 * davor), dann Unterbestände nach Füllgrad (leer zuerst), dann der Rest —
 * innerhalb gleich nach Name. Arbeitet auf einer Kopie.
 */
export function kritischeReihenfolge(zeilen: readonly KritischeZeile[]): KritischeZeile[] {
  const rang = (zeile: KritischeZeile) =>
    zeile.chargeTon === "rot" ? 0 : zeile.unterMindest ? 1 : 2;
  const fuellgrad = (zeile: KritischeZeile) =>
    zeile.mindestbestand > 0 ? zeile.bestand / zeile.mindestbestand : 1;
  return [...zeilen].sort((a, b) =>
    rang(a) - rang(b)
    || fuellgrad(a) - fuellgrad(b)
    || a.name.localeCompare(b.name, "de"));
}

/** Wohin „alle anzeigen" führt: die Artikelliste mit vorgesetztem Spaltenfilter. */
const ALLE_UNTER_MINDEST = "/verwaltung/artikel?filter=unter-mindest";
const ALLE_CHARGE_KRITISCH = "/verwaltung/artikel?filter=charge-kritisch";

const ZIEL = { display: "inline-flex", alignItems: "center", minHeight: 44 } as const;

/** Ein Artikel der Liste öffnet in der Artikelliste direkt seine Schublade. */
export function artikelAdresse(id: string): string {
  return `/verwaltung/artikel?artikel=${encodeURIComponent(id)}`;
}

function journalAnzeigeZeilen(
  zeilen: JournalZeileRoh[],
): UebersichtJournalZeile[] {
  return zeilen.map((zeile) => {
    const darstellung = journalZeile(zeile);
    return {
      id: zeile.id,
      zeitText: fmtTs(zeile.ts),
      // Der Rohwert NEBEN dem Anzeigetext: `zeitText` ist „14.09. 08:12" und
      // sortierte als Zeichenkette den 2. Oktober vor den 14. September.
      zeitIso: zeile.ts.toISOString(),
      artikelName: zeile.artikelName,
      vorgangText: darstellung.typText
        + (zeile.kommentar ? ` · ${zeile.kommentar}` : ""),
      deltaText: darstellung.mengeText,
      // dito: „−3 Stk" sortierte neben „−30 Stk" falsch.
      deltaZahl: zeile.menge,
      deltaTon: darstellung.zustand,
    };
  });
}

export function verwaltungInhalt(db: DB, jetzt: Date) {
  const k = kennzahlen(db, jetzt);
  const kritisch = kritischeReihenfolge(kritischeArtikel(db, jetzt));
  const sichtbar = kritisch.slice(0, KRITISCH_ANZEIGE);
  const anzahlUnterMindest = kritisch.filter((zeile) => zeile.unterMindest).length;
  const anzahlChargeKritisch = kritisch.filter((zeile) => zeile.chargeTon !== null).length;
  const journal = journalEintraege(db, { grenze: 5 });
  const journalZeilen = journalAnzeigeZeilen(journal.zeilen);

  return (
    <>
      <SeitenKopf
        titel="Übersicht"
        beschreibung={`Stand ${jetzt.toLocaleString("de-DE", {
          timeZone: zeitzone(),
        })} Uhr`}
      />

      <Row gutter={[SPACE.md, SPACE.md]} style={{ marginBlockEnd: SPACE.lg }}>
        <Col xs={24} md={8}>
          {/* IDA-239 — eine Kachel mit Zahl führt zu ihrer Liste: was unter
              dem Mindestbestand liegt, wird über den Bestellvorschlag
              nachgeholt. Bei null gibt es dort nichts zu tun. */}
          <Kachel
            zahl={k.unterMindest}
            beschriftung="Artikel unter Mindestbestand"
            ton={k.unterMindest ? "rot" : "ok"}
            href={k.unterMindest > 0 ? "/verwaltung/bestellung" : undefined}
          />
        </Col>
        <Col xs={24} md={8}>
          <Kachel
            zahl={k.chargenKritisch}
            beschriftung="Chargen bald fällig / kritisch"
            ton={k.chargenKritisch ? "gelb" : "ok"}
            href="/verwaltung/verfall"
          />
        </Col>
        <Col xs={24} md={8}>
          <Kachel
            zahl={k.chargenAbgelaufen}
            beschriftung="abgelaufen — aussondern nötig"
            ton={k.chargenAbgelaufen ? "rot" : "ok"}
            href="/verwaltung/verfall"
          />
        </Col>
        <Col xs={24} md={8}>
          <Kachel
            zahl={k.nichtBestellt}
            beschriftung="unter Mindestbestand, noch nicht bestellt"
            href={k.nichtBestellt > 0 ? "/verwaltung/bestellung" : undefined}
          />
        </Col>
        <Col xs={24} md={8}>
          <Kachel
            zahl={k.buchungenGesamt}
            beschriftung="Buchungen im Journal"
            href={k.buchungenGesamt > 0 ? "/verwaltung/journal" : undefined}
          />
        </Col>
      </Row>

      <Card
        title="Kritische Artikel"
        extra={kritisch.length > sichtbar.length ? (
          <span style={SCHRIFT.neben}>
            {sichtbar.length} von {kritisch.length}
          </span>
        ) : undefined}
        style={{ marginBlockEnd: SPACE.lg }}
      >
        {kritisch.length === 0 ? (
          <Empty description="Alles im grünen Bereich." />
        ) : (
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {sichtbar.map((zeile) => (
              <li
                key={zeile.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  // 10 -> SPACE.md (12): dieselbe Zeilenform wie
                  // VerfallItem.tsx und die "An Fahrzeugen und Taschen"-Liste
                  // (verfall/page.tsx) — dort steht bereits SPACE.md.
                  gap: SPACE.md,
                  padding: `${SPACE.md}px 0`,
                  borderBlockEnd: "1px solid var(--lb-linie)",
                }}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Link
                    href={artikelAdresse(zeile.id)}
                    style={{ ...SCHRIFT.text, fontWeight: 600 }}
                  >
                    {zeile.name}
                  </Link>
                  <div
                    style={{
                      display: "flex",
                      // 6 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32);
                      // bleibt Literal, siehe Bericht.
                      gap: 6,
                      flexWrap: "wrap",
                      marginBlockStart: SPACE.xs,
                    }}
                  >
                    <span className={s.fach}>{zeile.fach}</span>
                    {zeile.unterMindest ? (
                      <Chip ton="rot" zeichen="warnung">
                        unter Mindestbestand
                      </Chip>
                    ) : null}
                    {zeile.chargeText && zeile.chargeTon ? (
                      <Chip ton={zeile.chargeTon}>Charge {zeile.chargeText}</Chip>
                    ) : null}
                  </div>
                </div>
                <span style={SCHRIFT.zahl}>{zeile.bestand}</span>
                <span style={SCHRIFT.neben}>/ min. {zeile.mindestbestand}</span>
              </li>
            ))}
          </ul>
        )}
        {kritisch.length > sichtbar.length ? (
          /*
            ⚠️ ZWEI WEGE, NICHT EINER: „kritisch" heißt Unterbestand ODER
            kritische Charge, und die Artikelliste filtert je Spalte — eine
            Oder-Verknüpfung über zwei Spalten kann sie nicht ausdrücken. Jeder
            Weg nennt deshalb seine eigene Zahl.
          */
          <p
            data-rolle="alle-kritischen"
            style={{
              ...SCHRIFT.text,
              display: "flex",
              flexWrap: "wrap",
              columnGap: SPACE.lg,
              margin: `${SPACE.sm}px 0 0`,
            }}
          >
            {/* 44 px Zielhöhe auch für einen Textlink (Arbeitsdichte). */}
            {anzahlUnterMindest > 0 ? (
              <Link href={ALLE_UNTER_MINDEST} style={ZIEL}>
                Alle {anzahlUnterMindest} unter Mindestbestand anzeigen
              </Link>
            ) : null}
            {anzahlChargeKritisch > 0 ? (
              <Link href={ALLE_CHARGE_KRITISCH} style={ZIEL}>
                Alle {anzahlChargeKritisch} mit kritischer Charge anzeigen
              </Link>
            ) : null}
          </p>
        ) : null}
      </Card>

      <Card title="Letzte Buchungen">
        <LetzteBuchungenTable zeilen={journalZeilen} />
      </Card>
    </>
  );
}

export default async function VerwaltungUebersicht() {
  requireLagerbuchHost(await headers());
  await requireLagerbuchAdmin();

  return verwaltungInhalt(getDb(), new Date());
}
