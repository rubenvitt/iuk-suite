"use client";

import { useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Button, Input, type InputRef } from "antd";
import type { SymbolSpec } from "@einsatzzeichen/schema";
import { nachText, Zellentext } from "@/core/tabelle";
import { loescheEigenesZeichenAction, speichereEigenesZeichenAction } from "../../_actions/eigeneZeichen";
import { EIGENER_TITEL_MAX, type EigenesZeichen } from "../../_lib/zeichen/eigen/typen";
import { symbolId, type Symbolsatz } from "../zeichnung/Symbole";
import { BibBereich, useBibFormular, type BibBereichZustand } from "./BibBereich";
import { BibFlyin } from "./BibFlyin";

/**
 * Der Baukasten bringt den Zeichenkern mit (rund 1,7 MB ungepackt) und lädt deshalb erst, wenn ein Flyin aufgeht —
 * EINZIGER Ladeweg (`grenze.test.ts`). `ssr: false`: er rechnet nur im Browser, und das Flyin rendert ohnehin erst offen.
 */
const Baukasten = dynamic(() => import("./Baukasten"), { ssr: false, loading: () => <p className="kp-hilfe">Baukasten wird geladen …</p> });

/** Neues Zeichen: eine Funktionsstelle der Führung mit Kürzel — der häufigste Anlass (Leitstellen), sofort lesbar. */
const START = { kind: "post", organization: "fuehrung-leitung", labels: { center: "ILS" } } as SymbolSpec;

/**
 * EIGENE ZEICHEN (Bibliothek, Reiter „Zeichen"): zusammengestellt im Baukasten, modulweit in der Zeichensuche von
 * Editor und Bibliothek. Anders als Stellen und Einheiten werden sie NICHT in den Plan kopiert — der Plan verweist
 * per Schlüssel, eine Änderung hier ändert jeden Plan, der das Zeichen nutzt (darum die Spalte „In Plänen").
 */
export function ZeichenBereich({ zeichen, symbole, schrift }: { zeichen: EigenesZeichen[]; symbole: Symbolsatz; schrift: string }) {
  const vorschau = (z: EigenesZeichen) => symbole[z.schluessel]
    ? <svg viewBox="0 0 10 10" width={36} height={36} aria-hidden="true" className="kp-zeichen-mini" style={{ fontFamily: schrift }}><use href={`#${symbolId(z.schluessel)}`} width={10} height={10} /></svg>
    : <span className="kp-zeichen-platz" aria-hidden="true" />;
  return (
    <BibBereich<EigenesZeichen> name="Eigene Zeichen" mehrzahl="Eigene Zeichen" neu="Neues Zeichen" eintraege={zeichen}
      leer={{ nichts: "Noch keine eigenen Zeichen. Fehlt dir ein Zeichen im Katalog, etwa für eine Leitstelle, bau es hier.", gefiltert: "Kein Zeichen passt zur Suche." }}
      sucheIn={(z) => [z.titel, z.beschreibung]} karte={{ titel: "titel" }}
      spalten={(b) => [
        { key: "bild", title: "Zeichen", width: 64, render: (_: unknown, z: EigenesZeichen) => vorschau(z) },
        { key: "titel", title: "Name", dataIndex: "titel", sorter: nachText<EigenesZeichen>((z) => z.titel),
          render: (_: unknown, z: EigenesZeichen) => <Button type="link" className="kp-zeilenlink" onClick={() => b.oeffne(z)}>{z.titel}</Button> },
        { key: "beschreibung", title: "Bedeutung", render: (_: unknown, z: EigenesZeichen) => <Zellentext text={z.beschreibung} /> },
        { key: "nutzung", title: "In Plänen", render: (_: unknown, z: EigenesZeichen) => (z.nutzung === 0 ? "—" : String(z.nutzung)) },
      ]}>
      {(b) => <ZeichenFlyin {...b.flyin} schrift={schrift} />}
    </BibBereich>
  );
}

function ZeichenFlyin({ eintrag, schrift, onSchliessen, onFertig, onWeiter }: BibBereichZustand<EigenesZeichen>["flyin"] & { schrift: string }) {
  const erstesFeld = useRef<InputRef>(null);
  const fm = useBibFormular(eintrag, erstesFeld);
  const { basis, f } = fm;
  const alt = eintrag !== null && eintrag !== "neu" ? eintrag : null;
  const [titel, setTitel] = useState(alt?.titel ?? "");
  const [spec, setSpec] = useState<SymbolSpec>(alt?.spec ?? START);
  async function speichern(weiter: boolean) {
    const r = await fm.sende(() => speichereEigenesZeichenAction({ id: alt?.id ?? null, titel, spec }));
    if (r) (weiter ? onWeiter : onFertig)(`„${r.titel}“ gespeichert. Du findest es in der Zeichensuche.`);
  }
  async function loeschen() {
    if (alt && await fm.sende(() => loescheEigenesZeichenAction({ id: alt.id }))) onFertig(`„${alt.titel}“ gelöscht.`);
  }
  const hinweis = alt && alt.nutzung > 0
    ? `${alt.nutzung === 1 ? "Ein Plan nutzt" : `${alt.nutzung} Pläne nutzen`} dieses Zeichen. Dort steht danach nur noch der Titel.`
    : "Kein Plan nutzt dieses Zeichen.";
  return (
    <BibFlyin offen={eintrag !== null} titel={alt ? "Zeichen bearbeiten" : "Neues Zeichen"} formName="Eigenes Zeichen" fehler={fm.fehler} laeuft={fm.laeuft}
      breite={640} loeschHinweis={hinweis}
      onSchliessen={onSchliessen} onSpeichern={() => void speichern(false)} onWeiter={alt ? undefined : () => void speichern(true)}
      onLoeschen={alt ? () => void loeschen() : undefined} onGeoeffnet={fm.onGeoeffnet}>
      <label className="kp-feldname" htmlFor={`${basis}-titel`}>Name</label>
      <Input ref={erstesFeld} id={`${basis}-titel`} name="titel" value={titel} maxLength={EIGENER_TITEL_MAX} placeholder="z. B. ILS Schweinfurt"
        onChange={(e) => setTitel(e.target.value)} {...f("titel").attr} />
      {f("titel").text}
      {alt && alt.nutzung > 0 ? <p className="kp-hilfe">Änderungen gelten sofort in {alt.nutzung === 1 ? "dem Plan" : `allen ${alt.nutzung} Plänen`}, die dieses Zeichen nutzen.</p> : null}
      <Baukasten spec={spec} onSpec={setSpec} schrift={schrift} />
    </BibFlyin>
  );
}
