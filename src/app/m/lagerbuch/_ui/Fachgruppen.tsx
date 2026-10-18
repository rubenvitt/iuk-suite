"use client";

import { useMemo, useState, type ReactNode } from "react";
import { AutoComplete, Button, Collapse, Flex, InputNumber, Select, Switch } from "antd";
import { SPACE } from "@/core/theme/tokens";
import {
  fachFilter,
  fachZaehltext,
  positionTrifft,
  type ArtikelOption,
  type FachGruppe,
  type PositionsKern,
} from "../_lib/positionen";
import { SCHRIFT } from "../_lib/schrift";
import { Ikone } from "./ikonen";
import { Suchfeld } from "./Suchfeld";

/**
 * DIE BEDIENTEILE EINER POSITIONSLISTE NACH FACH (IDA-239).
 *
 * Gebaut für die Soll-Bestückung einer Einheit (IDA-232) und jetzt auch von der
 * Positionsliste einer Vorlage genutzt: Leiste mit Suche, „Alle aufklappen",
 * Schalter „Bearbeiten" und „Position hinzufügen", darunter je Fach ein
 * aufklappbarer Abschnitt. WAS IN EINEM FACH STEHT (Spalten, Speichern), bleibt
 * beim Aufrufer — die beiden Listen unterscheiden sich genau dort (Ist und
 * Herkunft gibt es nur am Soll einer Einheit).
 */

/**
 * Welche Fächer offen sind — und die Suche, die ihre Treffer aufklappt.
 *
 * EINE SUCHE KLAPPT IHRE TREFFER AUF — einmal, beim Ändern des Suchworts, und
 * im Rendern statt in einem Effekt (Reacts Muster „Zustand bei geänderter
 * Eingabe anpassen"). Danach gehört der Zustand wieder der Person: ein Fach,
 * das sie während der Suche zuklappt, bleibt zu.
 */
export function useFachgruppen<T extends PositionsKern>(
  gruppen: FachGruppe<T>[],
  suche: string,
  startOffen: boolean,
) {
  const [offene, setOffene] = useState<string[]>(() =>
    startOffen ? gruppen.map((gruppe) => gruppe.fach) : []);

  const sichtbare = useMemo(() => gruppen
    .map((gruppe) => ({
      ...gruppe,
      positionen: gruppe.positionen.filter((position) => positionTrifft(position, suche)),
    }))
    .filter((gruppe) => gruppe.positionen.length > 0), [gruppen, suche]);

  const [gesuchtFuer, setGesuchtFuer] = useState(suche);
  if (gesuchtFuer !== suche) {
    setGesuchtFuer(suche);
    if (suche.trim()) setOffene(sichtbare.map((gruppe) => gruppe.fach));
  }

  const alleOffen = sichtbare.length > 0
    && sichtbare.every((gruppe) => offene.includes(gruppe.fach));

  return {
    sichtbare,
    offene,
    setOffene,
    alleOffen,
    alleUmschalten: () => setOffene(alleOffen ? [] : sichtbare.map((gruppe) => gruppe.fach)),
    /** Ein Fach aufklappen — z. B. das einer eben hinzugefügten Position. */
    oeffnen: (fach: string) => setOffene((vorher) => (
      vorher.includes(fach) ? vorher : [...vorher, fach])),
  };
}

/** Die Leiste über der Liste. */
export function PositionenLeiste({
  suche,
  onSuche,
  mehrereGruppen,
  alleOffen,
  onAlleUmschalten,
  bearbeiten,
  onBearbeiten,
  neuOffen,
  onNeu,
}: {
  suche: string;
  onSuche: (wert: string) => void;
  mehrereGruppen: boolean;
  alleOffen: boolean;
  onAlleUmschalten: () => void;
  bearbeiten: boolean;
  onBearbeiten: (an: boolean) => void;
  neuOffen: boolean;
  onNeu: () => void;
}) {
  return (
    <Flex gap={SPACE.md} wrap align="center">
      <Suchfeld wert={suche} onWert={onSuche} platzhalter="Artikel oder Fach suchen…" />
      {mehrereGruppen ? (
        <Button
          onClick={onAlleUmschalten}
          icon={<Ikone name={alleOffen ? "zuklappen" : "aufklappen"} groesse={16} />}
        >
          {alleOffen ? "Alle zuklappen" : "Alle aufklappen"}
        </Button>
      ) : null}
      {/* Die Beschriftung umschliesst den Schalter: ein Tippen auf das Wort
          schaltet mit, und der Name des Schalters ist das sichtbare Wort. */}
      <label style={{ display: "inline-flex", alignItems: "center", gap: SPACE.sm, minHeight: 44 }}>
        <Switch checked={bearbeiten} onChange={onBearbeiten} />
        Bearbeiten
      </label>
      <Button
        icon={<Ikone name="plus" groesse={16} />}
        onClick={onNeu}
        disabled={neuOffen}
      >
        Position hinzufügen
      </Button>
    </Flex>
  );
}

export type NeuePositionWerte = { fachLabel: string; artikelId: string; soll: number };

/**
 * Die Zeile für eine neue Position. Ein bestehendes Fach steht zur Wahl, ein
 * neues lässt sich tippen — so entsteht kein zweites Fach aus einem Tippfehler.
 *
 * `onHinzufuegen` meldet, ob gespeichert wurde; nur dann leeren sich Artikel und
 * Menge. Das Fach bleibt stehen: wer ein Fach befüllt, legt meist mehrere
 * Positionen hintereinander an.
 */
export function NeuePosition({
  faecher,
  artikel,
  laeuft,
  onHinzufuegen,
  onSchliessen,
}: {
  faecher: string[];
  artikel: ArtikelOption[];
  laeuft: boolean;
  onHinzufuegen: (werte: NeuePositionWerte) => Promise<boolean>;
  onSchliessen: () => void;
}) {
  const [fach, setFach] = useState("");
  const [artikelId, setArtikelId] = useState<string>();
  const [soll, setSoll] = useState<number | null>(1);

  async function hinzufuegen(): Promise<void> {
    const erfolgreich = await onHinzufuegen({
      fachLabel: fach.trim(),
      artikelId: artikelId!,
      soll: soll!,
    });
    if (erfolgreich) {
      setArtikelId(undefined);
      setSoll(1);
    }
  }

  return (
    <div
      data-rolle="neue-position"
      style={{
        display: "grid",
        gap: SPACE.sm,
        padding: SPACE.md,
        border: "1px solid var(--iuk-linie)",
        borderRadius: 6,
      }}
    >
      <span style={SCHRIFT.feldname}>Neue Position</span>
      <Flex gap={SPACE.sm} wrap align="center">
        <AutoComplete
          placeholder="Fach"
          aria-label="Fach"
          value={fach}
          onChange={(wert: string) => setFach(wert)}
          options={faecher.map((wert) => ({ value: wert }))}
          filterOption={(eingabe, option) => String(option?.value ?? "")
            .toLocaleLowerCase("de")
            .includes(eingabe.trim().toLocaleLowerCase("de"))}
          style={{ minWidth: 200 }}
        />
        <Select<string, ArtikelOption>
          showSearch
          filterOption={fachFilter}
          value={artikelId}
          onChange={setArtikelId}
          placeholder="Artikel"
          aria-label="Artikel"
          style={{ minWidth: 240 }}
          options={artikel}
        />
        <InputNumber
          min={1}
          max={9999}
          precision={0}
          value={soll}
          onChange={setSoll}
          aria-label="Soll"
        />
        <Button
          type="primary"
          icon={<Ikone name="plus" groesse={16} />}
          loading={laeuft}
          disabled={!fach.trim() || !artikelId || !soll || laeuft}
          onClick={() => { void hinzufuegen(); }}
        >
          Hinzufügen
        </Button>
        <Button onClick={onSchliessen}>Schließen</Button>
      </Flex>
    </div>
  );
}

/** Je Fach ein aufklappbarer Abschnitt; der Inhalt kommt vom Aufrufer. */
export function FachgruppenListe<T>({
  gruppen,
  offene,
  onOffene,
  inhalt,
}: {
  gruppen: FachGruppe<T>[];
  offene: string[];
  onOffene: (offene: string[]) => void;
  inhalt: (gruppe: FachGruppe<T>) => ReactNode;
}) {
  return (
    <Collapse
      activeKey={offene}
      onChange={(schluessel) => onOffene(
        Array.isArray(schluessel) ? schluessel.map(String) : [String(schluessel)],
      )}
      items={gruppen.map((gruppe) => ({
        key: gruppe.fach,
        label: <strong data-rolle="fachkopf">{gruppe.fach}</strong>,
        extra: <span style={SCHRIFT.neben}>{fachZaehltext(gruppe)}</span>,
        children: inhalt(gruppe),
      }))}
    />
  );
}
