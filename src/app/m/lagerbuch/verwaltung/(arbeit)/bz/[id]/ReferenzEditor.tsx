"use client";

import { useState, useTransition, type ReactNode } from "react";
import { Input, InputNumber, Select } from "antd";
import { geraetSpeichern } from "../../../../_actions/bz";
import { standortMeta } from "../../../../_lib/konstanten";
import type { LagerortOption } from "../../../../_lib/lesepfade/bz";
import { Stammdaten, StammdatenEingabe } from "../../../../_ui/Stammdaten";

const SPEICHER_FEHLER = "BZ-Gerät konnte nicht gespeichert werden.";

export type BzEditorWerte = {
  id: string;
  name: string;
  barcode: string | null;
  lagerortId: string;
  streifenLot: string | null;
  level1Label: string | null;
  level1Min: number | null;
  level1Max: number | null;
  level2Label: string | null;
  level2Min: number | null;
  level2Max: number | null;
};

type TextFeld = "name" | "barcode" | "streifenLot" | "level1Label" | "level2Label";
type ZahlFeld = "level1Min" | "level1Max" | "level2Min" | "level2Max";

export type LagerortSuchOption = {
  label?: ReactNode;
  keywords?: string;
};

type LagerortSelectOption = LagerortSuchOption & {
  value: string;
  label: ReactNode;
};

export function lagerortFilter(
  eingabe: string,
  option?: LagerortSuchOption,
): boolean {
  const nadel = eingabe.trim().toLocaleLowerCase("de");
  const label = typeof option?.label === "string" ? option.label : "";
  return `${label} ${option?.keywords ?? ""}`.toLocaleLowerCase("de").includes(nadel);
}

function optionalerText(wert: string | null): string | undefined {
  const normalisiert = wert?.trim() ?? "";
  return normalisiert || undefined;
}

function optionalZahl(wert: number | null): number | undefined {
  return wert ?? undefined;
}

function payload(w: BzEditorWerte) {
  return {
    id: w.id,
    name: w.name.trim(),
    barcode: optionalerText(w.barcode),
    lagerortId: w.lagerortId,
    streifenLot: optionalerText(w.streifenLot),
    level1Label: optionalerText(w.level1Label),
    level1Min: optionalZahl(w.level1Min),
    level1Max: optionalZahl(w.level1Max),
    level2Label: optionalerText(w.level2Label),
    level2Min: optionalZahl(w.level2Min),
    level2Max: optionalZahl(w.level2Max),
  };
}

/** Der Referenzbereich als Lesetext: „40–60", „ab 40", „bis 60", „–". */
export function bereichText(min: number | null, max: number | null): string {
  if (min !== null && max !== null) return `${min}–${max}`;
  if (min !== null) return `ab ${min}`;
  if (max !== null) return `bis ${max}`;
  return "–";
}

/** „Kontrolle niedrig · 40–60" — die Bezeichnung nur, wenn eine gepflegt ist. */
function levelText(bezeichnung: string | null, min: number | null, max: number | null): string {
  const bereich = bereichText(min, max);
  return bezeichnung ? `${bezeichnung} · ${bereich}` : bereich;
}

/**
 * REFERENZ & STREIFEN-LOT — SEIT IDA-239 EIN LESEMODUS MIT „BEARBEITEN".
 *
 * Vorher standen alle zehn Felder immer offen zwischen Kacheln und „Kontrolle
 * erfassen", und jedes speicherte beim Verlassen (Text) bzw. nach 400 ms
 * (Zahl). Eine vertippte Referenzgrenze ging so ohne Rückweg durch — und sie
 * entscheidet, ob die nächste Kontrolle als bestanden zählt. Jetzt wird
 * gelesen, „Bearbeiten" öffnet die Felder, „Speichern" schreibt alle zehn auf
 * einmal, „Abbrechen" verwirft.
 *
 * ⚠️ `payload()` SCHICKT WEITER ALLE ZEHN FELDER — `geraetSpeichern` schreibt
 * die Stammzeile ganz. Ein Fehler kommt deshalb als Satz der Action an (eine
 * Barcode-Kollision lässt sonst jedes Speichern scheitern, ohne dass jemand
 * den Grund erfährt), und der Bearbeitungsmodus bleibt offen, damit nichts
 * Getipptes verloren geht.
 *
 * Der Lesemodus zeigt immer die Serverwerte; der Entwurf entsteht erst beim
 * Klick auf „Bearbeiten" aus ihnen und gehört dann der Person — ein neuer
 * Serverstand überschreibt nichts, was sie gerade tippt.
 *
 * ⚠️ DER AUFRUFER SETZT `key={geraet.id}`: beim Wechsel auf ein ANDERES Gerät
 * darf kein offener Entwurf des vorigen stehen bleiben.
 */
export function ReferenzEditor({
  geraet,
  lagerorte,
  zusatz,
}: {
  geraet: BzEditorWerte;
  lagerorte: LagerortOption[];
  /** Unter der Liste: Status und Löschen (IDA-239, vorher im Seitenkopf). */
  zusatz?: ReactNode;
}) {
  const [bearbeiten, setBearbeiten] = useState(false);
  const [entwurf, setEntwurf] = useState(geraet);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, starten] = useTransition();

  function aendern(aenderung: Partial<BzEditorWerte>): void {
    setEntwurf((vorher) => ({ ...vorher, ...aenderung }));
  }

  function umschalten(an: boolean): void {
    setFehler(null);
    setEntwurf(geraet);
    setBearbeiten(an);
  }

  function speichern(): void {
    const werte = { ...entwurf, name: entwurf.name.trim() };
    setFehler(null);
    starten(async () => {
      try {
        const ergebnis = await geraetSpeichern(payload(werte));
        if (!ergebnis.ok) {
          setFehler(ergebnis.fehler);
          return;
        }
        setBearbeiten(false);
      } catch {
        setFehler(SPEICHER_FEHLER);
      }
    });
  }

  /*
   * ⚠️ `keywords` STAND SCHON AUF `lagerort.typ`, UND GENAU DAS REICHT SEIT
   * DRK-309 NICHT MEHR: `typ` ist für jede Tasche `"fahrzeug"`, wer „tasche"
   * tippt, fand also nichts. Die Art gehört jetzt in beides — ins sichtbare
   * Label, weil Namen in `lagerorte` nicht eindeutig sind, und in die
   * Suchworte, weil eine Tasche das Wort nicht im Namen tragen muss.
   */
  const standortOptionen: LagerortSelectOption[] = lagerorte.map((lagerort) => {
    const meta = standortMeta(lagerort);
    return {
      value: lagerort.id,
      label: `${lagerort.name} · ${meta}`,
      keywords: `${lagerort.name} ${lagerort.typ} ${meta}`,
    };
  });
  const standortText = standortOptionen
    .find((option) => option.value === geraet.lagerortId)?.label ?? geraet.lagerortId;

  function textFeld(feld: TextFeld, label: string) {
    return (
      <StammdatenEingabe label={label}>
        <Input
          aria-label={label}
          autoComplete="off"
          value={entwurf[feld] ?? ""}
          onChange={(ereignis) => aendern({ [feld]: ereignis.target.value })}
        />
      </StammdatenEingabe>
    );
  }

  function zahlFeld(feld: ZahlFeld, label: string) {
    return (
      <StammdatenEingabe label={label}>
        <InputNumber<number>
          aria-label={label}
          value={entwurf[feld]}
          precision={0}
          onChange={(wert) => aendern({ [feld]: wert })}
          style={{ width: "100%" }}
        />
      </StammdatenEingabe>
    );
  }

  return (
    <Stammdaten
      titel="Referenz & Streifen-Lot"
      bearbeiten={bearbeiten}
      onBearbeiten={umschalten}
      laeuft={laeuft}
      onSpeichern={speichern}
      fehler={fehler}
      zusatz={zusatz}
      felder={[
        { name: "Name", wert: geraet.name },
        { name: "Barcode", wert: geraet.barcode ?? "–" },
        { name: "Standort", wert: standortText },
        { name: "Streifen-Lot", wert: geraet.streifenLot ?? "–" },
        { name: "Level 1", wert: levelText(geraet.level1Label, geraet.level1Min, geraet.level1Max) },
        { name: "Level 2", wert: levelText(geraet.level2Label, geraet.level2Min, geraet.level2Max) },
      ]}
      eingaben={(
        <>
          {textFeld("name", "Name")}
          {textFeld("barcode", "Barcode")}
          <StammdatenEingabe label="Standort">
            <Select<string, LagerortSelectOption>
              aria-label="Standort"
              value={entwurf.lagerortId}
              options={standortOptionen}
              showSearch
              optionFilterProp="label"
              filterOption={lagerortFilter}
              onChange={(lagerortId) => aendern({ lagerortId })}
              style={{ width: "100%" }}
            />
          </StammdatenEingabe>
          {textFeld("streifenLot", "Streifen-Lot")}
          {textFeld("level1Label", "Level-1-Bezeichnung")}
          {zahlFeld("level1Min", "Level-1-Untergrenze")}
          {zahlFeld("level1Max", "Level-1-Obergrenze")}
          {textFeld("level2Label", "Level-2-Bezeichnung")}
          {zahlFeld("level2Min", "Level-2-Untergrenze")}
          {zahlFeld("level2Max", "Level-2-Obergrenze")}
        </>
      )}
    />
  );
}
