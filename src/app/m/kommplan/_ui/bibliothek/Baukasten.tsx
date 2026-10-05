"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { Alert, Input, Segmented, Select } from "antd";
import type { SymbolSpec } from "@einsatzzeichen/schema";
import {
  ACHSEN, FELDTITEL, MITTELGROESSEN, ZONEN_AUSSEN, ZONEN_IM_KOERPER, ZONENNAMEN, abgeleiteteTeile, befunde, bezeichnung, gewaehlt,
  mittelgroesse, ohneFeldnamen, ohneTexte, setze, setzeAchse, setzeMittelgroesse, setzeZone,
  type Achse, type Mittelgroesse, type WahlFeld, type Wertbefund, type Zone,
} from "../../_lib/zeichen/eigen/vokabular";
import { zeichneEigenes } from "../../_lib/zeichen/eigen/zeichne";
import { passt } from "../../_lib/bibliothek/typen";

/** Suche in langen Auswahlen (88 Fähigkeiten, 134 Körpermarken): jedes Wort im Namen, wie in der übrigen Bibliothek. */
const SUCHE = { filterOption: (eingabe: string, o?: { label?: unknown }) => passt(eingabe, [String(o?.label ?? "")]) };

/**
 * DER BAUKASTEN FÜR EIGENE ZEICHEN (Vorbild: der Baukasten des früheren Moduls `zeichen`, DRK-465). Lädt den Kern
 * `@einsatzzeichen/core` in den Browser — deshalb NUR per `import()` aus `ZeichenBereich.tsx` (`grenze.test.ts`):
 * statisch gezogen läge der Kern in jedem Bündel der Bibliothek.
 *
 * Die Vorschau zeichnet mit DERSELBEN Funktion wie der Server (`zeichneEigenes`) — was hier steht, steht im Plan.
 * Gespeichert wird nur `spec`; der Server prüft und zeichnet selbst. Gesperrte Werte stehen ausgegraut mit Grund
 * in der Auswahl, statt erst nach dem Klick zu scheitern.
 *
 * GEPRÜFT WIRD ERST BEIM ÖFFNEN EINER AUSWAHL (DRK-507): seit core 4.0.0 leitet `vocabulary` fehlende Fassungen ab,
 * und die Körpermarken kosten je neuer Kombination ~1,5 s (Node; core 3.0.0: ~20 ms). Alle Achsen bei jeder
 * Änderung zu prüfen, fror die Seite ein. Texte ändern die Prüfung nicht (`ohneTexte`), also prüfen sie nicht neu.
 */
export default function Baukasten({ spec, onSpec, schrift }: { spec: SymbolSpec; onSpec(neu: SymbolSpec): void; schrift: string }) {
  const basis = useId();
  const bild = useMemo(() => zeichneEigenes(spec, "kpe-vorschau"), [spec]);
  const hinweise = bild.ok ? [] : bild.art === "regel" ? bild.hinweise : [{ titel: "Nicht vermessen", erklaerung: bild.meldung, feld: null }];

  const zone = (z: Zone) => (
    <div key={z}>
      <label className="kp-feldname" htmlFor={`${basis}-zone-${z}`}>{ZONENNAMEN[z]}</label>
      <Input id={`${basis}-zone-${z}`} value={spec.labels?.[z] ?? ""} maxLength={24} onChange={(e) => onSpec(setzeZone(spec, z, e.target.value))} />
    </div>
  );
  const mitte = (spec.labels?.center ?? "") !== "";

  return (
    <div className="kp-baukasten">
      <div className="kp-baukasten-vorschau" aria-live="polite">
        {bild.ok ? (
          <svg role="img" aria-label={bild.beschreibung} viewBox={bild.quelle.viewBox} style={{ fontFamily: schrift }}
            dangerouslySetInnerHTML={{ __html: bild.quelle.inhalt }} />
        ) : <span className="kp-baukasten-leer" aria-hidden="true" />}
        <div>
          {bild.ok ? <p className="kp-hilfe">{bild.beschreibung}</p> : null}
          {bild.ok && bild.abgeleitet.length > 0 ? (
            <p className="kp-hilfe kp-baukasten-abgeleitet">
              Abgeleitet: {abgeleiteteTeile(bild.abgeleitet).join(", ")}. Diese Teile sind nicht an der Vorschrift vermessen,
              sondern aus vermessenen Nachbarformen abgeleitet.
            </p>
          ) : null}
          {hinweise.map((h) => (
            <Alert key={h.titel} type="warning" showIcon title={h.titel} description={ohneFeldnamen(h.erklaerung) || undefined} />
          ))}
        </div>
      </div>

      {ACHSEN.map((achse) => (
        <AchsenFeld key={achse.key} basis={basis} achse={achse} spec={spec} onSpec={onSpec} />
      ))}

      <fieldset className="kp-abschnitt"><legend>Beschriftung im Körper</legend>
        <p className="kp-hilfe">Text im Körper, etwa „ILS“ in der Mitte. Zu lange Texte meldet die Vorschau.</p>
        <div className="kp-baukasten-zonen">
          {ZONEN_IM_KOERPER.map(zone)}
          <div>
            <span className="kp-feldname" id={`${basis}-groesse`}>Größe des mittigen Textes</span>
            <Segmented aria-labelledby={`${basis}-groesse`} disabled={!mitte} value={mittelgroesse(spec)}
              options={MITTELGROESSEN.map((g) => ({ value: g.wert, label: g.name }))}
              onChange={(g) => onSpec(setzeMittelgroesse(spec, g as Mittelgroesse))} />
          </div>
        </div>
      </fieldset>

      <fieldset className="kp-abschnitt"><legend>Beschriftung außerhalb</legend>
        <p className="kp-hilfe">Text neben dem Zeichen, etwa das Kreiskürzel unter dem Zeichen rechts.</p>
        <div className="kp-baukasten-zonen">
          {ZONEN_AUSSEN.map(zone)}
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
    const name = bezeichnung(feld, b.wert);
    const label = !b.frei ? `${name} — ${b.grund ?? "passt hier nicht"}` : name;
    // `title`: am Telefon kürzt die Liste den Sperrgrund ab; so steht er wenigstens im Tooltip ganz. „Abgeleitet" steht
    // nur dort (wie im Einsatzzeichen-Baukasten seit 4.2.0) — als Zusatz an jedem zweiten Eintrag machte es die Liste unlesbar.
    const title = b.frei && b.abgeleitet ? `${name} (abgeleitet, nicht vermessen)` : label;
    return { value: mitFeld ? `${feld}:${b.wert}` : b.wert, label, title, disabled: !b.frei };
  });
}

/**
 * EIN BEDIENFELD JE ACHSE (`vokabular.ts`): mehrere Quellen stehen als Gruppen in derselben Auswahl, der Wert trägt
 * `feld:wert`. Wer die Quelle wechselt, leert die anderen derselben Achse im selben Schritt (`setzeAchse`).
 */
function AchsenFeld({ basis, achse, spec, onSpec }: { basis: string; achse: Achse; spec: SymbolSpec; onSpec(neu: SymbolSpec): void }) {
  const id = `${basis}-${achse.key}`;
  const { sperren, pruefe, prueft } = usePruefung(achse, spec);
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
          value={liste} options={optionen(feld, sperren?.get(feld) ?? liste.map((wert) => ({ wert, frei: true })), false)}
          onOpenChange={pruefe} loading={prueft} notFoundContent={prueft ? PRUEFT : undefined}
          onChange={(werte: string[]) => onSpec(setze(spec, [[feld, werte]]))} />
      </div>
    );
  }
  const wert = gewaehlt(spec, achse);
  // Noch ungeprüft trägt die Auswahl nur den gesetzten Wert — sonst stünde dort die rohe Kennung statt des Namens.
  const vorlaeufig = (f: WahlFeld): Wertbefund[] => (wert?.startsWith(`${f}:`) ? [{ wert: wert.slice(f.length + 1), frei: true }] : []);
  const gruppen = achse.felder
    .map((f) => ({ label: FELDTITEL[f], title: FELDTITEL[f], options: optionen(f, sperren?.get(f) ?? vorlaeufig(f), true) }))
    .filter((g) => sperren || g.options.length > 0);
  return (
    <div className="kp-baukasten-achse" data-achse={achse.key}>
      {kopf}
      <Select id={id} aria-describedby={`${id}-hilfe`} allowClear={achse.key !== "grundzeichen"} showSearch={SUCHE} placeholder="— ohne —"
        value={wert ?? undefined} options={mehrere ? gruppen : (gruppen[0]?.options ?? [])}
        onOpenChange={pruefe} loading={prueft} notFoundContent={prueft ? PRUEFT : undefined}
        onChange={(roh: string | undefined) => {
          if (!roh) { onSpec(setzeAchse(spec, achse, null, null)); return; }
          const i = roh.indexOf(":");
          onSpec(setzeAchse(spec, achse, roh.slice(0, i) as WahlFeld, roh.slice(i + 1)));
        }} />
    </div>
  );
}

const PRUEFT = "Prüfe, was passt …";

/**
 * Die Befunde einer Achse, erst nach dem Öffnen und eine Runde später gerechnet: so malt die Liste zuerst „Prüfe …“,
 * statt beim Klick einzufrieren. Bis eine neue Prüfung fertig ist, bleiben die letzten Befunde stehen (Ladeanzeige
 * daneben) — wer mehrere Körpermarken nacheinander wählt, sieht die Liste nicht bei jedem Klick verschwinden.
 */
function usePruefung(achse: Achse, spec: SymbolSpec) {
  const [offen, setOffen] = useState(false);
  const [stand, setStand] = useState<{ schluessel: string; sperren: Map<WahlFeld, Wertbefund[]> } | null>(null);
  const schluessel = useMemo(() => JSON.stringify(ohneTexte(spec)), [spec]);
  const aktuell = stand?.schluessel === schluessel;
  useEffect(() => {
    if (!offen || aktuell) return;
    const t = setTimeout(() => setStand({ schluessel, sperren: new Map(achse.felder.map((f) => [f, befunde(spec, achse, f)])) }), 0);
    return () => clearTimeout(t);
  }, [offen, aktuell, schluessel, spec, achse]);
  return { sperren: stand?.sperren ?? null, pruefe: setOffen, prueft: offen && !aktuell };
}
