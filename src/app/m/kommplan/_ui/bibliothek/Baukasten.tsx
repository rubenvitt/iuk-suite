"use client";

import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Alert, Input, Segmented, Select } from "antd";
import type { BodySign } from "@einsatzzeichen/schema";
import {
  ABSCHNITTE, FELDTITEL, MITTELGROESSEN, SOFORT_GEPRUEFT, ZONEN_AUSSEN, ZONEN_IM_KOERPER, ZONENNAMEN, befunde, feldname, gesetzt,
  gewaehlt, mittelgroesse, ohneFeldnamen, ohneTexte, setzeAbschnitt, setzeFachaufgaben, setzeMittelgroesse, setzeText, sichtbar, textIn,
  type Abschnitt, type Mittelgroesse, type WahlFeld, type Wertbefund, type Zone,
} from "../../_lib/zeichen/eigen/vokabular";
import { zeichneEigenes } from "../../_lib/zeichen/eigen/zeichne";
import { passt } from "../../_lib/bibliothek/typen";

/** Suche in langen Auswahlen (rund 90 Fachaufgaben): jedes Wort im Namen, wie in der übrigen Bibliothek. */
const SUCHE = { filterOption: (eingabe: string, o?: { label?: unknown }) => passt(eingabe, [String(o?.label ?? "")]) };

const TREUE = { measured: "Vermessen", derived: "Abgeleitet", simplified: "Vereinfacht" } as const;

/**
 * DER BAUKASTEN FÜR EIGENE ZEICHEN — auf der Beschreibung (`Sign`, Einsatzzeichen 7; IDA-408), nach dem Vorbild des
 * Einsatzzeichen-Baukastens (ESZ-150). Lädt den Kern `@einsatzzeichen/core` in den Browser — deshalb NUR per
 * `import()` aus `ZeichenBereich.tsx` (`grenze.test.ts`): statisch gezogen läge der Kern in jedem Bündel der Bibliothek.
 *
 * Die Vorschau zeichnet mit DERSELBEN Funktion wie der Server (`zeichneEigenes`) — was hier steht, steht im Plan.
 * `draw` wirft nie: über der Vorschau steht die Treue, und bei „Vereinfacht“ nennt die Warnung, was nicht im Bild ist.
 * Gespeichert wird nur die Beschreibung; der Server prüft streng und zeichnet selbst.
 *
 * Ein Abschnitt erscheint nur, wenn ein Wert passt oder einer gesetzt ist; was nicht passt, steht unten in der Auswahl
 * unter „Passt hier nicht“ mit Grund. Die Fachaufgaben prüft er erst beim Öffnen (~0,4 s je Beschreibung).
 */
export default function Baukasten({ zeichen, onZeichen, schrift }: { zeichen: BodySign; onZeichen(neu: BodySign): void; schrift: string }) {
  const basis = useId();
  const bild = useMemo(() => zeichneEigenes(zeichen, "kpe-vorschau"), [zeichen]);
  const befund = useSofortBefunde(zeichen);

  const zone = (z: Zone) => (
    <div key={z}>
      <label className="kp-feldname" htmlFor={`${basis}-zone-${z}`}>{ZONENNAMEN[z]}</label>
      <Input id={`${basis}-zone-${z}`} value={textIn(zeichen, z)} maxLength={24} onChange={(e) => onZeichen(setzeText(zeichen, z, e.target.value))} />
    </div>
  );
  const mitte = textIn(zeichen, "center") !== "";

  return (
    <div className="kp-baukasten">
      <div className="kp-baukasten-vorschau" aria-live="polite">
        <svg role="img" aria-label={bild.beschreibung} viewBox={bild.quelle.viewBox} style={{ fontFamily: schrift }}
          dangerouslySetInnerHTML={{ __html: bild.quelle.inhalt }} />
        <div>
          <p className="kp-hilfe kp-baukasten-treue" data-treue={bild.treue}>{TREUE[bild.treue]}</p>
          <p className="kp-hilfe">{bild.beschreibung}</p>
          {bild.weggelassen.length > 0 ? (
            <Alert type="warning" showIcon title="Nicht im Bild" description={
              <ul className="kp-baukasten-weggelassen">
                {bild.weggelassen.map((w) => <li key={`${w.feld}|${w.wert}`}>{feldname(w.feld)}: {ohneFeldnamen(w.grund) || w.grund}</li>)}
              </ul>
            } />
          ) : null}
        </div>
      </div>

      {ABSCHNITTE.filter((a) => sichtbar(zeichen, a, befund)).map((abschnitt) => (
        <AbschnittFeld key={abschnitt.key} basis={basis} abschnitt={abschnitt} zeichen={zeichen} befund={befund} onZeichen={onZeichen} />
      ))}

      <fieldset className="kp-abschnitt"><legend>Beschriftung im Körper</legend>
        <div className="kp-baukasten-zonen">
          {ZONEN_IM_KOERPER.map(zone)}
          <div>
            <span className="kp-feldname" id={`${basis}-groesse`}>Größe des mittigen Textes</span>
            <Segmented aria-labelledby={`${basis}-groesse`} disabled={!mitte} value={mittelgroesse(zeichen)}
              options={MITTELGROESSEN.map((g) => ({ value: g.wert, label: g.name }))}
              onChange={(g) => onZeichen(setzeMittelgroesse(zeichen, g as Mittelgroesse))} />
          </div>
        </div>
      </fieldset>

      <fieldset className="kp-abschnitt"><legend>Beschriftung außerhalb</legend>
        <div className="kp-baukasten-zonen">{ZONEN_AUSSEN.map(zone)}</div>
      </fieldset>
    </div>
  );
}

/**
 * Die Auswahl eines Feldes: passende Werte in den Gruppen des Pakets, dahinter „Passt hier nicht“ mit Grund. Ein
 * abgeleiteter Wert ist wählbar und sagt es nur im Tooltip (wie im Einsatzzeichen-Baukasten).
 */
interface Option { value: string; label: string; title: string; disabled: boolean }
type Eintrag = Option | { label: string; title: string; options: Option[] };

function optionen(feld: WahlFeld, befund: readonly Wertbefund[], mitFeld: boolean, gruppeNach: "paket" | "feld"): Eintrag[] {
  const option = (b: Wertbefund): Option => ({
    value: mitFeld ? `${feld}:${b.wert}` : b.wert,
    label: b.frei ? b.name : `${b.name} — ${b.grund ?? "passt hier nicht"}`,
    title: b.frei && b.abgeleitet ? `${b.name} (abgeleitet, nicht vermessen)` : b.frei ? b.name : `${b.name} — ${b.grund ?? "passt hier nicht"}`,
    disabled: !b.frei,
  });
  const frei = befund.filter((b) => b.frei);
  const gesperrt = befund.filter((b) => !b.frei);
  const gruppen = new Map<string, Wertbefund[]>();
  for (const b of frei) {
    const g = gruppeNach === "feld" ? FELDTITEL[feld] : (b.gruppe ?? "");
    gruppen.set(g, [...(gruppen.get(g) ?? []), b]);
  }
  const passend = [...gruppen].flatMap(([g, liste]): Eintrag[] => (g === "" ? liste.map(option) : [{ label: g, title: g, options: liste.map(option) }]));
  return gesperrt.length === 0 ? passend : [...passend, { label: "Passt hier nicht", title: "Passt hier nicht", options: gesperrt.map(option) }];
}

/**
 * EIN BEDIENFELD JE ABSCHNITT (`vokabular.ts`): mehrere Felder stehen als Gruppen in derselben Auswahl, der Wert trägt
 * `feld:wert`. Wer das Feld wechselt, leert die anderen desselben Abschnitts im selben Schritt (`setzeAbschnitt`).
 */
function AbschnittFeld({ basis, abschnitt, zeichen, befund, onZeichen }: {
  basis: string; abschnitt: Abschnitt; zeichen: BodySign; befund: ReadonlyMap<WahlFeld, readonly Wertbefund[]>; onZeichen(neu: BodySign): void;
}) {
  const id = `${basis}-${abschnitt.key}`;
  const kopf = <label className="kp-feldname" htmlFor={id}>{abschnitt.titel}</label>;
  if (abschnitt.art === "mehrfach") return <Fachaufgaben id={id} kopf={kopf} abschnitt={abschnitt} zeichen={zeichen} onZeichen={onZeichen} />;

  const wert = gewaehlt(zeichen, abschnitt);
  // Noch ungeprüft trägt die Auswahl nur den gesetzten Wert — sonst stünde dort die rohe Kennung statt des Namens.
  const vorlaeufig = (f: WahlFeld): Wertbefund[] => gesetzt(zeichen, f).map((w) => ({ wert: w, name: w, frei: true }));
  const mehrere = abschnitt.felder.length > 1;
  const liste = abschnitt.felder.flatMap((f) => optionen(f, befund.get(f) ?? vorlaeufig(f), true, mehrere ? "feld" : "paket"));
  return (
    <div className="kp-baukasten-achse" data-achse={abschnitt.key}>
      {kopf}
      <Select id={id} allowClear={abschnitt.key !== "grundzeichen"} showSearch={SUCHE} placeholder="— ohne —"
        value={wert ?? undefined} options={liste}
        onChange={(roh: string | undefined) => {
          if (!roh) { onZeichen(setzeAbschnitt(zeichen, abschnitt, abschnitt.felder[0], null)); return; }
          const i = roh.indexOf(":");
          onZeichen(setzeAbschnitt(zeichen, abschnitt, roh.slice(0, i) as WahlFeld, roh.slice(i + 1)));
        }} />
    </div>
  );
}

function Fachaufgaben({ id, kopf, abschnitt, zeichen, onZeichen }: {
  id: string; kopf: ReactNode; abschnitt: Abschnitt; zeichen: BodySign; onZeichen(neu: BodySign): void;
}) {
  const feld = abschnitt.felder[0];
  const { liste: geprueft, pruefe, prueft } = usePruefungBeimOeffnen(zeichen, feld);
  const werte = gesetzt(zeichen, feld);
  return (
    <div className="kp-baukasten-achse" data-achse={abschnitt.key}>
      {kopf}
      <Select id={id} mode="multiple" allowClear showSearch={SUCHE} placeholder="— ohne —"
        value={werte} options={optionen(feld, geprueft ?? werte.map((wert) => ({ wert, name: wert, frei: true })), false, "paket")}
        onOpenChange={pruefe} loading={prueft} notFoundContent={prueft ? PRUEFT : undefined}
        onChange={(neu: string[]) => onZeichen(setzeFachaufgaben(zeichen, neu))} />
    </div>
  );
}

const PRUEFT = "Prüfe, was passt …";

/**
 * Die günstigen Felder (`SOFORT_GEPRUEFT`, je ein paar Millisekunden) nach jeder Änderung an der Beschreibung, eine
 * Runde später gerechnet; Texte ändern die Prüfung nicht (`ohneTexte`). Bis eine neue Prüfung fertig ist, bleiben die
 * letzten Befunde stehen — die Abschnitte springen nicht bei jedem Tastendruck.
 */
function useSofortBefunde(zeichen: BodySign): ReadonlyMap<WahlFeld, readonly Wertbefund[]> {
  const schluessel = useMemo(() => JSON.stringify(ohneTexte(zeichen)), [zeichen]);
  const [stand, setStand] = useState<{ schluessel: string; befund: Map<WahlFeld, Wertbefund[]> } | null>(null);
  const aktuell = stand?.schluessel === schluessel;
  useEffect(() => {
    if (aktuell) return;
    const t = setTimeout(() => setStand({ schluessel, befund: new Map(SOFORT_GEPRUEFT.map((f) => [f, befunde(zeichen, f)])) }), 0);
    return () => clearTimeout(t);
  }, [aktuell, schluessel, zeichen]);
  return stand?.befund ?? LEER;
}
const LEER: ReadonlyMap<WahlFeld, readonly Wertbefund[]> = new Map();

/**
 * Die Fachaufgaben, erst nach dem Öffnen und eine Runde später gerechnet: so malt die Liste zuerst „Prüfe …“, statt
 * beim Klick einzufrieren. Bis eine neue Prüfung fertig ist, bleiben die letzten Befunde stehen (Ladeanzeige daneben).
 */
function usePruefungBeimOeffnen(zeichen: BodySign, feld: WahlFeld) {
  const [offen, setOffen] = useState(false);
  const [stand, setStand] = useState<{ schluessel: string; liste: Wertbefund[] } | null>(null);
  const schluessel = useMemo(() => JSON.stringify(ohneTexte(zeichen)), [zeichen]);
  const aktuell = stand?.schluessel === schluessel;
  useEffect(() => {
    if (!offen || aktuell) return;
    const t = setTimeout(() => setStand({ schluessel, liste: befunde(zeichen, feld) }), 0);
    return () => clearTimeout(t);
  }, [offen, aktuell, schluessel, zeichen, feld]);
  return { liste: stand?.liste ?? null, pruefe: setOffen, prueft: offen && !aktuell };
}
