"use client";

import { useId, useMemo } from "react";
import { Alert, Input, Select } from "antd";
import type { SymbolSpec } from "@einsatzzeichen/schema";
import {
  ACHSEN, FELDTITEL, ZONEN, ZONENNAMEN, befunde, bezeichnung, gewaehlt, ohneFeldnamen, setze, setzeAchse, setzeZone,
  type Achse, type WahlFeld, type Wertbefund,
} from "../../_lib/zeichen/eigen/vokabular";
import { zeichneEigenes } from "../../_lib/zeichen/eigen/zeichne";
import { passt } from "../../_lib/bibliothek/typen";

/** Suche in langen Auswahlen (88 Fähigkeiten, 133 Körpermarken): jedes Wort im Namen, wie in der übrigen Bibliothek. */
const SUCHE = { filterOption: (eingabe: string, o?: { label?: unknown }) => passt(eingabe, [String(o?.label ?? "")]) };

/**
 * DER BAUKASTEN FÜR EIGENE ZEICHEN (Vorbild: der Baukasten des früheren Moduls `zeichen`, DRK-465). Lädt den Kern
 * `@einsatzzeichen/core` in den Browser — deshalb NUR per `import()` aus `ZeichenBereich.tsx` (`grenze.test.ts`):
 * statisch gezogen läge der Kern in jedem Bündel der Bibliothek.
 *
 * Die Vorschau zeichnet mit DERSELBEN Funktion wie der Server (`zeichneEigenes`) — was hier steht, steht im Plan.
 * Gespeichert wird nur `spec`; der Server prüft und zeichnet selbst. Gesperrte Werte stehen ausgegraut mit Grund
 * in der Auswahl, statt erst nach dem Klick zu scheitern.
 */
export default function Baukasten({ spec, onSpec, schrift }: { spec: SymbolSpec; onSpec(neu: SymbolSpec): void; schrift: string }) {
  const basis = useId();
  const bild = useMemo(() => zeichneEigenes(spec, "kpe-vorschau"), [spec]);
  // Alle Achsen auf einmal und gemerkt: rund 40 ms für ~330 Kandidaten (gemessen in Node, `vocabulary` zeichnet je Wert).
  const sperren = useMemo(() => new Map(ACHSEN.flatMap((a) => a.felder.map((f) => [f, befunde(spec, a, f)] as const))), [spec]);
  const hinweise = bild.ok ? [] : bild.art === "regel" ? bild.hinweise : [{ titel: "Nicht vermessen", erklaerung: bild.meldung, feld: null }];

  return (
    <div className="kp-baukasten">
      <div className="kp-baukasten-vorschau" aria-live="polite">
        {bild.ok ? (
          <svg role="img" aria-label={bild.beschreibung} viewBox={bild.quelle.viewBox} width={128} height={128} style={{ fontFamily: schrift }}
            dangerouslySetInnerHTML={{ __html: bild.quelle.inhalt }} />
        ) : <span className="kp-baukasten-leer" aria-hidden="true" />}
        <div>
          {bild.ok ? <p className="kp-hilfe">{bild.beschreibung}</p> : null}
          {hinweise.map((h) => (
            <Alert key={h.titel} type="warning" showIcon title={h.titel} description={ohneFeldnamen(h.erklaerung) || undefined} />
          ))}
        </div>
      </div>

      {ACHSEN.map((achse) => (
        <AchsenFeld key={achse.key} basis={basis} achse={achse} spec={spec} sperren={sperren} onSpec={onSpec} />
      ))}

      <fieldset className="kp-abschnitt"><legend>Beschriftung</legend>
        <p className="kp-hilfe">Text im Körper, etwa „ILS“ in der Mitte und das Kreiskürzel unten rechts. Zu lange Texte meldet die Vorschau.</p>
        <div className="kp-baukasten-zonen">
          {ZONEN.map((zone) => (
            <div key={zone}>
              <label className="kp-feldname" htmlFor={`${basis}-zone-${zone}`}>{ZONENNAMEN[zone]}</label>
              <Input id={`${basis}-zone-${zone}`} value={spec.labels?.[zone] ?? ""} maxLength={24} onChange={(e) => onSpec(setzeZone(spec, zone, e.target.value))} />
            </div>
          ))}
          <div>
            <label className="kp-feldname" htmlFor={`${basis}-unten`}>Unter dem Körper</label>
            <Input id={`${basis}-unten`} value={spec.designation ?? ""} maxLength={24}
              onChange={(e) => onSpec(setze(spec, e.target.value !== "" ? [["vehicleCategory", undefined], ["designation", e.target.value]] : [["designation", undefined]]))} />
          </div>
        </div>
      </fieldset>
    </div>
  );
}

function optionen(feld: WahlFeld, befund: readonly Wertbefund[], mitFeld: boolean) {
  return befund.map((b) => {
    const label = b.frei ? bezeichnung(feld, b.wert) : `${bezeichnung(feld, b.wert)} — ${b.grund ?? "passt hier nicht"}`;
    // `title`: am Telefon kürzt die Liste den Sperrgrund ab; so steht er wenigstens im Tooltip ganz.
    return { value: mitFeld ? `${feld}:${b.wert}` : b.wert, label, title: label, disabled: !b.frei };
  });
}

/**
 * EIN BEDIENFELD JE ACHSE (`vokabular.ts`): mehrere Quellen stehen als Gruppen in derselben Auswahl, der Wert trägt
 * `feld:wert`. Wer die Quelle wechselt, leert die anderen derselben Achse im selben Schritt (`setzeAchse`).
 */
function AchsenFeld({ basis, achse, spec, sperren, onSpec }: {
  basis: string; achse: Achse; spec: SymbolSpec; sperren: Map<WahlFeld, Wertbefund[]>; onSpec(neu: SymbolSpec): void;
}) {
  const id = `${basis}-${achse.key}`;
  const mehrere = achse.felder.length > 1;
  const kopf = (
    <>
      <label className="kp-feldname" htmlFor={id}>{achse.titel}</label>
      <p className="kp-hilfe" id={`${id}-hilfe`}>{achse.hilfe}</p>
    </>
  );
  if (achse.art === "mehrfach") {
    const feld = achse.felder[0];
    const liste = ((spec as unknown as Record<string, unknown>)[feld] as string[] | undefined) ?? [];
    return (
      <div className="kp-baukasten-achse" data-achse={achse.key}>
        {kopf}
        <Select id={id} aria-describedby={`${id}-hilfe`} mode="multiple" allowClear showSearch={SUCHE} placeholder="— ohne —"
          value={liste} options={optionen(feld, sperren.get(feld) ?? [], false)} onChange={(werte: string[]) => onSpec(setze(spec, [[feld, werte]]))} />
      </div>
    );
  }
  const wert = gewaehlt(spec, achse);
  const gruppen = achse.felder.map((f) => ({ label: FELDTITEL[f], title: FELDTITEL[f], options: optionen(f, sperren.get(f) ?? [], true) }));
  return (
    <div className="kp-baukasten-achse" data-achse={achse.key}>
      {kopf}
      <Select id={id} aria-describedby={`${id}-hilfe`} allowClear={achse.key !== "grundzeichen"} showSearch={SUCHE} placeholder="— ohne —"
        value={wert ?? undefined} options={mehrere ? gruppen : gruppen[0].options}
        onChange={(roh: string | undefined) => {
          if (!roh) { onSpec(setzeAchse(spec, achse, null, null)); return; }
          const i = roh.indexOf(":");
          onSpec(setzeAchse(spec, achse, roh.slice(0, i) as WahlFeld, roh.slice(i + 1)));
        }} />
    </div>
  );
}
