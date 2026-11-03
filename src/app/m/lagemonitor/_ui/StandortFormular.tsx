"use client";

import { useId, useState, type FormEvent, type ReactNode } from "react";
import { Button, Input, InputNumber, Radio, Select } from "antd";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { standortSetzenAction } from "../_actions/verwaltung";
import type { FeldFehler } from "../_lib/actionErgebnis";
import type { StandortAuswahl, StandortDTO } from "../_lib/standort";
import v from "./verwaltung.module.css";

const ZEICHEN_PX = 40;

/** Das Zeichen eines Standorts als Bild (Data-URI, kein Bild aus dem Netz). */
export function StandortZeichen({ svg, titel }: { svg: string | null; titel: string }) {
  if (!svg) return null;
  // eslint-disable-next-line @next/next/no-img-element -- ein Data-URI-SVG, kein Bild aus dem Netz
  return <img src={`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`} alt={titel} width={ZEICHEN_PX} height={ZEICHEN_PX} />;
}

/** Eine Zeile unter dem Namen des Zugangs: woher der Standort kommt. */
export function standortZeile(s: StandortDTO | undefined): string {
  if (!s) return "kein Standort";
  if (s.art === "gps") return `${s.name ?? "ohne Namen"} · GPS von ${s.fahrzeugName ?? "einem Fahrzeug"}`;
  if (s.breite === null || s.laenge === null) return "kein Standort";
  return `${s.name ?? "ohne Namen"} · fest${s.zeichen ? "" : " · kein Zeichen"}`;
}

/**
 * Der Standort eines Monitors (IDA-333): GPS eines Fahrzeugs auf der Karte oder ein fester Ort mit eigenem Zeichen.
 * Beim GPS sind die Koordinaten der Ort bis zum ersten Fix.
 */
export function StandortFormular({
  zugangId,
  bezeichnung,
  standort,
  auswahl,
  onFertig,
}: {
  zugangId: string;
  bezeichnung: string;
  standort: StandortDTO | undefined;
  auswahl: StandortAuswahl;
  onFertig: () => void;
}) {
  const [art, setArt] = useState<"gps" | "fest">(standort?.art ?? "fest");
  const [name, setName] = useState(standort?.name ?? "");
  const [breite, setBreite] = useState<number | null>(standort?.breite ?? null);
  const [laenge, setLaenge] = useState<number | null>(standort?.laenge ?? null);
  const [zeichen, setZeichen] = useState<string | null>(standort?.zeichen ?? null);
  const [fahrzeugId, setFahrzeugId] = useState<string | null>(standort?.fahrzeugId ?? null);
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);
  const basis = useId();

  const fahrzeuge = auswahl.fahrzeuge.filter((f) => f.zugangId === null || f.zugangId === zugangId);

  function speichern(e: FormEvent<HTMLFormElement>): void {
    e.preventDefault();
    setFehler(null);
    setFeldFehler({});
    setLaeuft(true);
    const eingabe = art === "gps"
      ? { zugangId, art, name, fahrzeugId: fahrzeugId ?? "", breite, laenge }
      : { zugangId, art, name, breite, laenge, zeichen: zeichen ?? "" };
    void standortSetzenAction(eingabe)
      .then((r) => {
        if (r.ok) return onFertig();
        setFehler(r.fehler);
        setFeldFehler(r.feldFehler ?? {});
      })
      .catch(() => setFehler("Speichern ist fehlgeschlagen. Bitte noch einmal versuchen."))
      .finally(() => setLaeuft(false));
  }

  const zahl = (feld: "breite" | "laenge", label: string, wert: number | null, setze: (w: number | null) => void) => (
    <Feld id={`${basis}-${feld}`} label={label} fehler={feldFehler[feld]}>
      <InputNumber
        id={`${basis}-${feld}`}
        value={wert}
        step={0.0001}
        controls={false}
        decimalSeparator=","
        style={{ width: "100%" }}
        status={feldFehler[feld] ? "error" : undefined}
        onChange={(w) => setze(typeof w === "number" ? w : null)}
      />
    </Feld>
  );

  return (
    <form onSubmit={speichern} className={v.standortFormular} aria-label={`Standort von ${bezeichnung}`}>
      <Radio.Group
        aria-label="Woher der Standort kommt"
        value={art}
        onChange={(e) => setArt(e.target.value as "gps" | "fest")}
        options={[
          { value: "gps", label: "GPS eines Fahrzeugs" },
          { value: "fest", label: "Fester Ort" },
        ]}
        optionType="button"
      />
      <Feld id={`${basis}-name`} label="Name" fehler={feldFehler.name}>
        <Input id={`${basis}-name`} value={name} placeholder="zum Beispiel Unterkunft Uelzen" status={feldFehler.name ? "error" : undefined} onChange={(e) => setName(e.target.value)} />
      </Feld>
      {art === "gps" ? (
        <Feld id={`${basis}-fahrzeug`} label="Fahrzeug" fehler={feldFehler.fahrzeugId}>
          <Select
            id={`${basis}-fahrzeug`}
            value={fahrzeugId}
            onChange={setFahrzeugId}
            placeholder="Fahrzeug auf der Karte"
            options={fahrzeuge.map((f) => ({ value: f.id, label: f.funkrufname }))}
            notFoundContent="Kein freies Fahrzeug auf der Karte."
            status={feldFehler.fahrzeugId ? "error" : undefined}
            style={{ width: "100%" }}
          />
        </Feld>
      ) : (
        <Feld id={`${basis}-zeichen`} label="Taktisches Zeichen" fehler={feldFehler.zeichen}>
          <Select
            id={`${basis}-zeichen`}
            value={zeichen}
            onChange={setZeichen}
            placeholder="Taktisches Zeichen"
            showSearch={{ optionFilterProp: "label" }}
            options={auswahl.zeichen.map((z) => ({ value: z.schluessel, label: z.titel }))}
            status={feldFehler.zeichen ? "error" : undefined}
            style={{ width: "100%" }}
          />
        </Feld>
      )}
      <div className={v.standortKoordinaten}>
        {zahl("breite", art === "gps" ? "Breitengrad ohne GPS-Fix" : "Breitengrad", breite, setBreite)}
        {zahl("laenge", art === "gps" ? "Längengrad ohne GPS-Fix" : "Längengrad", laenge, setLaenge)}
      </div>
      {fehler ? <span style={SCHRIFT.neben}>{fehler}</span> : null}
      <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
        <Button htmlType="submit" loading={laeuft}>
          Standort speichern
        </Button>
        <Button onClick={onFertig}>Abbrechen</Button>
      </div>
    </form>
  );
}

function Feld({ id, label, fehler, children }: { id: string; label: string; fehler?: string; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} style={{ ...SCHRIFT.neben, display: "block", marginBlockEnd: SPACE.xs }}>
        {label}
      </label>
      {children}
      {fehler ? <div style={{ ...SCHRIFT.neben, marginBlockStart: SPACE.xs }}>{fehler}</div> : null}
    </div>
  );
}
