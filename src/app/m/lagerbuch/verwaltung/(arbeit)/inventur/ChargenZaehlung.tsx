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
 * IDA-276 — vor einem Schrank stehen hier auch die Chargen, die noch auf
 * „Nicht zugeordnet" liegen. Was hier gezaehlt wird, kommt von dort (Rechnung
 * in `_lib/inventurUebernahme.ts`); ein Schalter je Charge entscheidet, ob der
 * Rest dort ausgebucht wird. Und ergaenzte Chargen lassen sich nachtraeglich
 * aendern — Menge per Stepper, MHD und Nummer ueber „Bearbeiten".
 *
 * Eine LISTE, kein zweites `Table`: die Unterzeilen tragen je nach Art andere
 * Felder, und ein verschachteltes `Table` braechte eine zweite Spaltenlogik.
 *
 * Bediendichte: KEIN `size` an irgendeinem Element (Falle 4) — 44px gilt auch in
 * den Unterzeilen. Das native Monatsfeld ist kein antd-Feld und bekommt seine
 * Tapgroesze ueber `.monatsfeld` in `verwaltung.module.css`.
 */
import { useState } from "react";
import { Button, Checkbox, Input, InputNumber } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { ampelTon, fmtVerfall } from "../../../_lib/format";
import { CHARGE_INVENTUR, MONAT_REGEX } from "../../../_lib/konstanten";
import type { InventurCharge, InventurZeile } from "../../../_lib/lesepfade/inventur";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import s from "../../../_ui/verwaltung.module.css";
import {
  ausbuchenFuer,
  ausbuchenSetzen,
  chargeSetzen,
  chargenUebernahme,
  chargenzaehlungVerwerfen,
  neueChargeAendern,
  neueChargeEntfernen,
  neueChargeHinzufuegen,
  neuSchluessel,
  type NeueCharge,
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

/** Die drei Felder einer Ergaenzung — die neue Zeile UND das Bearbeiten einer vorhandenen. */
function ChargenFelder({ verfall, nummer, gesperrt, onVerfall, onNummer, zusatz }: {
  verfall: string;
  nummer: string;
  gesperrt: boolean;
  onVerfall: (wert: string) => void;
  onNummer: (wert: string) => void;
  /** Wie die Felder heissen — „der neuen Charge" oder „der ergänzten Charge". */
  zusatz: string;
}) {
  return (
    <>
      {/* Natives Monatsfeld wie `CheckFlow.tsx` — kein antd-DatePicker, keine
          Dayjs-Umrechnung. `pattern`/`inputMode` sind der Rueckfall fuer
          Browser, die `month` als Textfeld rendern; streng ist der Server. */}
      <input
        type="month"
        inputMode="numeric"
        pattern="\d{4}-\d{2}"
        placeholder="JJJJ-MM"
        aria-label={`MHD ${zusatz}`}
        className={s.monatsfeld}
        disabled={gesperrt}
        value={verfall}
        onChange={(e) => onVerfall(e.target.value)}
      />
      <Input
        aria-label={`Chargennummer ${zusatz}`}
        placeholder="optional"
        disabled={gesperrt}
        style={{ width: 180 }}
        value={nummer}
        onChange={(e) => onNummer(e.target.value)}
      />
    </>
  );
}

/** Minus, Feld, Plus — derselbe Stepper fuer gelistete und ergaenzte Chargen. */
function ChargenStepper({ wert, min, gesperrt, beschriftung, onWert }: {
  wert: number;
  min: number;
  gesperrt: boolean;
  beschriftung: string;
  onWert: (wert: number) => void;
}) {
  return (
    <span style={{ ...ZEILE_STIL, gap: SPACE.xs, marginInlineStart: "auto" }}>
      <Button
        disabled={gesperrt || wert <= min}
        aria-label={`${beschriftung} verringern`}
        onClick={() => onWert(wert - 1)}
        icon={<Ikone name="minus" groesse={14} />}
      />
      <InputNumber<number>
        min={min}
        max={IST_MAX}
        disabled={gesperrt}
        aria-label={beschriftung}
        value={wert}
        // Ein geleertes Feld ist eine ausdrueckliche Untergrenze, kein „nicht
        // gezaehlt": wer eine Charge nicht findet, setzt sie auf 0 (Spec §B).
        onChange={(neuerWert) => onWert(neuerWert ?? min)}
      />
      <Button
        disabled={gesperrt || wert >= IST_MAX}
        aria-label={`${beschriftung} erhöhen`}
        onClick={() => onWert(wert + 1)}
        icon={<Ikone name="plus" groesse={14} />}
      />
    </span>
  );
}

/**
 * IDA-276 — was mit „Nicht zugeordnet" passiert, sobald eine Charge gezaehlt
 * ist, die dort noch Bestand hat. Ein Satz statt einer Formel: wer vor dem
 * Schrank steht, soll lesen, was gebucht wird.
 */
function UebernahmeZeile({ charge, zaehlung, ist, einheit, gesperrt, onAusbuchen }: {
  charge: InventurCharge;
  zaehlung: Zaehlung | undefined;
  ist: number;
  einheit: string;
  gesperrt: boolean;
  onAusbuchen: (an: boolean) => void;
}) {
  const ausbuchen = ausbuchenFuer(zaehlung, charge.id);
  const u = chargenUebernahme(charge, zaehlung, ist);
  const bleibt = charge.ungeordnet - u.umlagern;
  return (
    <div data-rolle="uebernahme" style={{ ...ZEILE_STIL, flexBasis: "100%" }}>
      <span style={SCHRIFT.mono}>
        {u.umlagern > 0
          ? `${u.umlagern} ${einheit} aus „Nicht zugeordnet“ hierher`
          : "Nichts aus „Nicht zugeordnet“ übernommen"}
      </span>
      {bleibt > 0 ? (
        <Checkbox
          checked={ausbuchen}
          disabled={gesperrt}
          onChange={(e) => onAusbuchen(e.target.checked)}
        >
          {`Rest ${bleibt} ${einheit} bei „Nicht zugeordnet“ ausbuchen`}
        </Checkbox>
      ) : (
        <span>„Nicht zugeordnet“ ist danach leer.</span>
      )}
    </div>
  );
}

/**
 * IDA-276 — eine ergaenzte Charge, nachtraeglich aenderbar. Die Menge liegt
 * immer am Stepper; MHD und Nummer erst nach „Bearbeiten", weil sie selten
 * falsch sind und drei Felder je Zeile die Liste unlesbar machten.
 */
function NeueChargeZeile({ n, zeile, bekannt, gesperrt, onAendern }: {
  n: NeueCharge;
  zeile: InventurZeile;
  /** Schluessel aller anderen Chargen dieser Zeile — gegen Doppelte. */
  bekannt: ReadonlySet<string>;
  gesperrt: boolean;
  onAendern: (umbau: (stand: ZaehlStand) => ZaehlStand) => void;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [verfall, setVerfall] = useState(n.verfall);
  const [nummer, setNummer] = useState(n.chargenNr);
  const name = n.chargenNr || CHARGE_INVENTUR;

  const schluessel = neuSchluessel(verfall, nummer);
  const monatGueltig = MONAT_REGEX.test(verfall);
  const doppelt = monatGueltig && schluessel !== n.schluessel && bekannt.has(schluessel);
  const kannSpeichern = !gesperrt && monatGueltig && !doppelt;

  function aendern(neu: Partial<NeueCharge>): void {
    onAendern((stand) => neueChargeAendern(stand, zeile.id, n.schluessel, { ...n, ...neu }));
  }

  function speichern(): void {
    if (!kannSpeichern) return;
    aendern({ schluessel, verfall, chargenNr: nummer.trim() });
    setBearbeiten(false);
  }

  function abbrechen(): void {
    setVerfall(n.verfall);
    setNummer(n.chargenNr);
    setBearbeiten(false);
  }

  return (
    <li data-rolle="neue-charge" style={{ ...ZEILE_STIL, flexDirection: "column", alignItems: "stretch" }}>
      <div style={ZEILE_STIL}>
        <Chip ton="grau">neu</Chip>
        <span style={{ ...SCHRIFT.mono, fontWeight: 600 }}>{name}</span>
        <Chip ton="grau">{fmtVerfall(n.verfall)}</Chip>
        <AbweichungsChip differenz={n.ist} />
        <ChargenStepper
          wert={n.ist}
          min={1}
          gesperrt={gesperrt}
          beschriftung={`Ist ergänzte Charge ${name}`}
          onWert={(ist) => aendern({ ist })}
        />
        <Button
          disabled={gesperrt}
          aria-label={`Ergänzte Charge ${name} bearbeiten`}
          aria-expanded={bearbeiten}
          onClick={() => (bearbeiten ? abbrechen() : setBearbeiten(true))}
          icon={<Ikone name="stift" groesse={14} />}
        />
        <Button
          disabled={gesperrt}
          aria-label="Ergänzte Charge entfernen"
          onClick={() => onAendern((stand) => neueChargeEntfernen(stand, zeile.id, n.schluessel))}
          icon={<Ikone name="papierkorb" groesse={14} />}
        />
      </div>
      {bearbeiten ? (
        <div data-rolle="charge-bearbeiten" style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
          <div style={ZEILE_STIL}>
            <ChargenFelder
              verfall={verfall}
              nummer={nummer}
              gesperrt={gesperrt}
              onVerfall={setVerfall}
              onNummer={setNummer}
              zusatz="der ergänzten Charge"
            />
            <Button type="primary" disabled={!kannSpeichern} onClick={speichern}>Übernehmen</Button>
            <Button onClick={abbrechen}>Abbrechen</Button>
          </div>
          {doppelt ? (
            <p data-rolle="charge-doppelt" style={{ margin: 0 }}>
              Diese Charge steht schon in der Liste — zähle sie dort.
            </p>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

export function ChargenZaehlung({
  zeile,
  zaehlung,
  gesperrt,
  ortText,
  onAendern,
}: {
  zeile: InventurZeile;
  zaehlung: Zaehlung | undefined;
  gesperrt: boolean;
  /**
   * DRK-337 — der Ortsteil des Leertexts („im Handlager" / „an diesem
   * Zählort"). Fertig formuliert statt als Kennung: die Zeile ist ein Satz, und
   * eine zweite Fallunterscheidung hier liefe der in `InventurForm` davon.
   */
  ortText: string;
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

  function chargeWert(chargeId: string, wert: number): void {
    onAendern((stand) => chargeSetzen(stand, zeile.id, chargeId, wert));
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
        <p style={{ margin: 0 }}>{`Keine Charge mit Bestand ${ortText}.`}</p>
      ) : null}
      {zeile.ungeordnet > 0 ? (
        <p data-rolle="ungeordnet-hinweis" style={{ margin: 0 }}>
          Ein Teil liegt noch bei „Nicht zugeordnet“. Was du hier zählst, wird von dort in diesen
          Zählort umgelagert.
        </p>
      ) : null}
      {zeile.chargen.length === 0 ? null : (
        <ul style={LISTE_STIL} aria-label={`Chargen ${zeile.name}`}>
          {zeile.chargen.map((c) => {
            const angefasst = chargenzaehlung !== undefined && c.id in chargenzaehlung.chargen;
            const wert = chargenzaehlung?.chargen[c.id] ?? c.rest;
            return (
              <li key={c.id} data-rolle="charge" data-charge-id={c.id} style={ZEILE_STIL}>
                <span style={{ ...SCHRIFT.mono, fontWeight: 600 }}>{c.chargenNr}</span>
                <Chip ton={ampelTon(c.ampel)}>{fmtVerfall(c.verfall)}</Chip>
                <span style={SCHRIFT.mono}>erwartet {c.rest} {zeile.einheit}</span>
                {c.ungeordnet > 0 ? (
                  <Chip ton="grau">{`nicht zugeordnet ${c.ungeordnet}`}</Chip>
                ) : null}
                {angefasst ? (
                  <AbweichungsChip differenz={chargenUebernahme(c, zaehlung, wert).abweichung} />
                ) : null}
                <ChargenStepper
                  wert={wert}
                  min={0}
                  gesperrt={gesperrt}
                  beschriftung={`Ist Charge ${c.chargenNr}`}
                  onWert={(neu) => chargeWert(c.id, neu)}
                />
                {angefasst && c.ungeordnet > 0 ? (
                  <UebernahmeZeile
                    charge={c}
                    zaehlung={zaehlung}
                    ist={wert}
                    einheit={zeile.einheit}
                    gesperrt={gesperrt}
                    onAusbuchen={(an) => onAendern((stand) => ausbuchenSetzen(stand, zeile.id, c.id, an))}
                  />
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {neue.length > 0 ? (
        <ul style={LISTE_STIL} aria-label={`Ergänzte Chargen ${zeile.name}`}>
          {neue.map((n) => (
            <NeueChargeZeile
              // Aendern sich MHD oder Nummer, steigt die Zeile mit dem neuen
              // Schluessel neu ein — gewollt: ihre Bearbeiten-Felder starten dann
              // mit den gespeicherten Werten. Die Menge aendert den Schluessel nicht.
              key={n.schluessel}
              n={n}
              zeile={zeile}
              bekannt={bekannt}
              gesperrt={gesperrt}
              onAendern={onAendern}
            />
          ))}
        </ul>
      ) : null}

      <div data-rolle="charge-ergaenzen" style={{ display: "flex", flexDirection: "column", gap: SPACE.xs }}>
        <div style={ZEILE_STIL}>
          <ChargenFelder
            verfall={verfall}
            nummer={nummer}
            gesperrt={gesperrt}
            onVerfall={setVerfall}
            onNummer={setNummer}
            zusatz="der neuen Charge"
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
