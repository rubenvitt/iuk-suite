"use client";

/**
 * DRK-299 — die aufgeklappte Zeile einer Inventurposition: je Charge zaehlen,
 * im Regal gefundene Chargen ergaenzen, die Chargenzaehlung verwerfen.
 *
 * DIE KERNREGEL (Spec §B): eine nicht angefasste Charge wird nicht gesendet und
 * nie implizit 0. Die Komponente haelt deshalb KEINEN Zaehlzustand selbst — jede
 * Aenderung geht als Umbau ueber `onAendern` an die reinen Funktionen aus
 * `inventurZustand.ts`, die nur Angefasstes eintragen. Lokal sind allein die
 * drei Felder der Ergaenzen-Zeile.
 *
 * Eine LISTE, kein zweites `Table`: die Unterzeilen tragen je nach Art andere
 * Felder, und ein verschachteltes `Table` braechte eine zweite Spaltenlogik.
 *
 * Bediendichte: KEIN `size` an irgendeinem Element (Falle 4) — 44px gilt auch in
 * den Unterzeilen. Das native Monatsfeld ist kein antd-Feld und bekommt seine
 * Tapgroesze ueber `.monatsfeld` in `verwaltung.module.css`.
 */
import { useState } from "react";
import { Button, Input, InputNumber } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { ampelTon, fmtVerfall } from "../../../_lib/format";
import { CHARGE_INVENTUR, MONAT_REGEX } from "../../../_lib/konstanten";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import s from "../../../_ui/verwaltung.module.css";
import {
  chargeSetzen,
  chargenzaehlungVerwerfen,
  neueChargeEntfernen,
  neueChargeHinzufuegen,
  neuSchluessel,
  type ZaehlStand,
  type Zaehlung,
} from "./inventurZustand";

/** Serverseitige Obergrenze (`IST` in `_actions/inventur.ts`). */
const IST_MAX = 99_999;

const ZEILE_STIL = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: SPACE.sm,
} as const;

const LISTE_STIL = {
  listStyle: "none",
  margin: 0,
  padding: 0,
  display: "flex",
  flexDirection: "column",
  gap: SPACE.sm,
} as const;

/** Wie die Hauptzeile: Minus rot, Plus gelb, ASCII-Vorzeichen im Text. */
function AbweichungsChip({ differenz }: { differenz: number }) {
  if (differenz === 0) return null;
  return (
    <Chip ton={differenz < 0 ? "rot" : "gelb"}>
      {differenz > 0 ? `+${differenz}` : `${differenz}`}
    </Chip>
  );
}

export function ChargenZaehlung({
  zeile,
  zaehlung,
  gesperrt,
  onAendern,
}: {
  zeile: InventurZeile;
  zaehlung: Zaehlung | undefined;
  gesperrt: boolean;
  onAendern: (umbau: (stand: ZaehlStand) => ZaehlStand) => void;
}) {
  const [verfall, setVerfall] = useState("");
  const [nummer, setNummer] = useState("");
  const [menge, setMenge] = useState<number | null>(1);

  const chargenzaehlung = zaehlung?.art === "chargen" ? zaehlung : undefined;
  const neue = chargenzaehlung?.neu ?? [];

  // Beide Quellen: eine gelistete Charge UEBERSCHRIEBE der Server still (er nimmt
  // die juengste passende und setzt ihren Rest), eine doppelt ergaenzte wiese er
  // als `chargeDoppelt` ab. Die Oberflaeche laesst beides gar nicht erst entstehen.
  const bekannt = new Set([
    ...zeile.chargen.map((c) => neuSchluessel(c.verfall, c.chargenNr)),
    ...neue.map((n) => n.schluessel),
  ]);
  const schluessel = neuSchluessel(verfall, nummer);
  const monatGueltig = MONAT_REGEX.test(verfall);
  const doppelt = monatGueltig && bekannt.has(schluessel);
  const kannErgaenzen = !gesperrt && monatGueltig && !doppelt
    && menge !== null && Number.isInteger(menge) && menge >= 1 && menge <= IST_MAX;

  function chargeWert(chargeId: string, wert: number | null): void {
    // Ein geleertes Feld ist eine ausdrueckliche 0, kein „nicht gezaehlt":
    // wer eine Charge nicht findet, setzt sie auf 0 (Spec §B).
    onAendern((stand) => chargeSetzen(stand, zeile.id, chargeId, wert ?? 0));
  }

  function ergaenzen(): void {
    if (!kannErgaenzen || menge === null) return;
    const neu = { schluessel, verfall, chargenNr: nummer.trim(), ist: menge };
    onAendern((stand) => neueChargeHinzufuegen(stand, zeile.id, neu));
    setVerfall("");
    setNummer("");
    setMenge(1);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: SPACE.md }}>
      {zeile.chargen.length === 0 ? (
        <p style={{ margin: 0 }}>Keine Charge mit Bestand im Handlager.</p>
      ) : (
        <ul style={LISTE_STIL} aria-label={`Chargen ${zeile.name}`}>
          {zeile.chargen.map((c) => {
            const angefasst = chargenzaehlung !== undefined && c.id in chargenzaehlung.chargen;
            const wert = chargenzaehlung?.chargen[c.id] ?? c.rest;
            return (
              <li key={c.id} data-rolle="charge" data-charge-id={c.id} style={ZEILE_STIL}>
                <span style={{ ...SCHRIFT.mono, fontWeight: 600 }}>{c.chargenNr}</span>
                <Chip ton={ampelTon(c.ampel)}>{fmtVerfall(c.verfall)}</Chip>
                <span style={SCHRIFT.mono}>erwartet {c.rest} {zeile.einheit}</span>
                {angefasst ? <AbweichungsChip differenz={wert - c.rest} /> : null}
                <span style={{ ...ZEILE_STIL, gap: SPACE.xs, marginInlineStart: "auto" }}>
                  <Button
                    disabled={gesperrt || wert <= 0}
                    aria-label={`Ist Charge ${c.chargenNr} verringern`}
                    onClick={() => chargeWert(c.id, wert - 1)}
                    icon={<Ikone name="minus" groesse={14} />}
                  />
                  <InputNumber<number>
                    min={0}
                    max={IST_MAX}
                    disabled={gesperrt}
                    aria-label={`Ist Charge ${c.chargenNr}`}
                    value={wert}
                    onChange={(neuerWert) => chargeWert(c.id, neuerWert)}
                  />
                  <Button
                    disabled={gesperrt || wert >= IST_MAX}
                    aria-label={`Ist Charge ${c.chargenNr} erhöhen`}
                    onClick={() => chargeWert(c.id, wert + 1)}
                    icon={<Ikone name="plus" groesse={14} />}
                  />
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {neue.length > 0 ? (
        <ul style={LISTE_STIL} aria-label={`Ergänzte Chargen ${zeile.name}`}>
          {neue.map((n) => (
            <li key={n.schluessel} data-rolle="neue-charge" style={ZEILE_STIL}>
              <Chip ton="grau">neu</Chip>
              <span style={{ ...SCHRIFT.mono, fontWeight: 600 }}>{n.chargenNr || CHARGE_INVENTUR}</span>
              <Chip ton="grau">{fmtVerfall(n.verfall)}</Chip>
              <span style={SCHRIFT.mono}>Ist {n.ist} {zeile.einheit}</span>
              <AbweichungsChip differenz={n.ist} />
              <Button
                disabled={gesperrt}
                aria-label="Ergänzte Charge entfernen"
                onClick={() => onAendern((stand) => neueChargeEntfernen(stand, zeile.id, n.schluessel))}
                icon={<Ikone name="papierkorb" groesse={14} />}
                style={{ marginInlineStart: "auto" }}
              />
            </li>
          ))}
        </ul>
      ) : null}

      <div data-rolle="charge-ergaenzen" style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
        <div style={ZEILE_STIL}>
          {/* Natives Monatsfeld wie `CheckFlow.tsx` — kein antd-DatePicker, keine
              Dayjs-Umrechnung. `pattern`/`inputMode` sind der Rueckfall fuer
              Browser, die `month` als Textfeld rendern; streng ist der Server. */}
          <input
            type="month"
            inputMode="numeric"
            pattern="\d{4}-\d{2}"
            aria-label="MHD der neuen Charge"
            className={s.monatsfeld}
            disabled={gesperrt}
            value={verfall}
            onChange={(e) => setVerfall(e.target.value)}
          />
          <Input
            aria-label="Chargennummer der neuen Charge"
            placeholder="optional"
            disabled={gesperrt}
            style={{ width: 180 }}
            value={nummer}
            onChange={(e) => setNummer(e.target.value)}
          />
          <InputNumber<number>
            min={1}
            max={IST_MAX}
            aria-label="Menge der neuen Charge"
            disabled={gesperrt}
            value={menge}
            onChange={(wert) => setMenge(wert)}
          />
          <Button
            aria-label="Charge ergänzen"
            disabled={!kannErgaenzen}
            onClick={ergaenzen}
            icon={<Ikone name="plus" groesse={14} />}
          >
            Charge ergänzen
          </Button>
        </div>
        {doppelt ? (
          <p data-rolle="charge-doppelt" style={{ margin: 0 }}>
            Diese Charge steht schon in der Liste — zähle sie dort.
          </p>
        ) : null}
      </div>

      {chargenzaehlung ? (
        <div>
          <Button
            disabled={gesperrt}
            onClick={() => onAendern((stand) => chargenzaehlungVerwerfen(stand, zeile.id))}
          >
            Chargenzählung verwerfen
          </Button>
        </div>
      ) : null}
    </div>
  );
}
