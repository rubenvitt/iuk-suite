"use client";

import { useRef, useState } from "react";
import { Button, Input, type InputRef } from "antd";
import { nachText, Zellentext } from "@/core/tabelle";
import { loescheBibEintragAction, speichereBibStelleAction } from "../../_actions/bibliothek";
import { BIB_GRENZE } from "../../_lib/bibliothek/schema";
import type { BibStelle } from "../../_lib/bibliothek/typen";
import { KONTAKT_NAME } from "../../_lib/plan/kontakte";
import { LAENGE, type Kontakt } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import { KontaktZeilen } from "../editor/KontaktZeilen";
import { ZeichenWahl } from "../editor/ZeichenWahl";
import type { Symbolsatz } from "../zeichnung/Symbole";
import { BibBereich, useBibFormular, type BibBereichZustand } from "./BibBereich";
import { BibFlyin } from "./BibFlyin";

export function StellenBereich({ stellen, zeichenIndex, symbole, ladeSymbole }: {
  stellen: BibStelle[]; zeichenIndex: readonly ZeichenIndexEintrag[]; symbole: Symbolsatz; ladeSymbole: (k: string[]) => void;
}) {
  const titelVon = new Map(zeichenIndex.map((e) => [e.schluessel, e.titel]));
  return (
    <BibBereich<BibStelle> name="Stellen der Bibliothek" mehrzahl="Stellen" neu="Neue Stelle" eintraege={stellen}
      leer={{ nichts: "Noch keine Stellen in der Bibliothek.", gefiltert: "Keine Stelle passt zur Suche." }}
      sucheIn={(s) => [s.titel, s.leiter, s.notiz, ...s.kontakte.map((k) => k.wert)]} karte={{ titel: "titel" }}
      spalten={(z) => [
        { key: "titel", title: "Titel", dataIndex: "titel", sorter: nachText<BibStelle>((s) => s.titel),
          render: (_: unknown, s: BibStelle) => <Button type="link" className="kp-zeilenlink" onClick={() => z.oeffne(s)}>{s.titel}</Button> },
        { key: "zeichen", title: "Zeichen", render: (_: unknown, s: BibStelle) => (s.zeichen ? titelVon.get(s.zeichen) ?? s.zeichen : "—") },
        { key: "leiter", title: "Leiter", render: (_: unknown, s: BibStelle) => s.leiter ?? "—" },
        // Freitext über Zellentext (docs/design/README.md „Mobil"): EIN langer Eintrag schöbe sonst alle Spalten dahinter aus dem Bild.
        { key: "kontakte", title: "Kontakte", render: (_: unknown, s: BibStelle) => <Zellentext text={s.kontakte.length === 0 ? "—" : s.kontakte.map((k) => `${KONTAKT_NAME[k.art]} ${k.wert}`).join(" · ")} /> },
        { key: "notiz", title: "Notiz", render: (_: unknown, s: BibStelle) => <Zellentext text={s.notiz ?? "—"} /> },
      ]}>
      {(z) => <StelleFlyin {...z.flyin} zeichenIndex={zeichenIndex} symbole={symbole} ladeSymbole={ladeSymbole} />}
    </BibBereich>
  );
}

function StelleFlyin({ eintrag, zeichenIndex, symbole, ladeSymbole, onSchliessen, onFertig, onWeiter }: BibBereichZustand<BibStelle>["flyin"] & {
  zeichenIndex: readonly ZeichenIndexEintrag[]; symbole: Symbolsatz; ladeSymbole: (k: string[]) => void;
}) {
  const erstesFeld = useRef<InputRef>(null);
  const fm = useBibFormular(eintrag, erstesFeld);
  const { basis, f } = fm;
  const alt = eintrag !== null && eintrag !== "neu" ? eintrag : null;
  const [titel, setTitel] = useState(alt?.titel ?? "");
  const [zeichen, setZeichen] = useState<string | null>(alt?.zeichen ?? null);
  const [leiter, setLeiter] = useState(alt?.leiter ?? "");
  const [kontakte, setKontakte] = useState<Kontakt[]>(alt?.kontakte ?? []);
  const [notiz, setNotiz] = useState(alt?.notiz ?? "");
  async function speichern(weiter: boolean) {
    const r = await fm.sende(() => speichereBibStelleAction({ id: alt?.id ?? null, titel, zeichen, leiter, kontakte, notiz }));
    if (r) (weiter ? onWeiter : onFertig)(`„${r.eintrag.titel}“ gespeichert.`);
  }
  async function loeschen() {
    if (alt && await fm.sende(() => loescheBibEintragAction({ art: "stelle", id: alt.id }))) onFertig(`„${alt.titel}“ gelöscht.`);
  }
  return (
    <BibFlyin offen={eintrag !== null} titel={alt ? "Stelle bearbeiten" : "Neue Stelle"} formName="Stelle der Bibliothek" fehler={fm.fehler} laeuft={fm.laeuft}
      onSchliessen={onSchliessen} onSpeichern={() => void speichern(false)} onWeiter={alt ? undefined : () => void speichern(true)}
      onLoeschen={alt ? () => void loeschen() : undefined} onGeoeffnet={fm.onGeoeffnet}>
      <label className="kp-feldname" htmlFor={`${basis}-titel`}>Titel</label>
      <Input ref={erstesFeld} id={`${basis}-titel`} name="titel" value={titel} maxLength={LAENGE.titel} onChange={(e) => setTitel(e.target.value)} {...f("titel").attr} />
      {f("titel").text}
      <fieldset className="kp-abschnitt"><legend>Zeichen</legend>
        <ZeichenWahl wert={zeichen} index={zeichenIndex} symbole={symbole} ladeSymbole={ladeSymbole} planZeichen={[]} onWahl={setZeichen} />
      </fieldset>
      <label className="kp-feldname" htmlFor={`${basis}-leiter`}>Leiter</label>
      <Input id={`${basis}-leiter`} name="leiter" value={leiter} maxLength={LAENGE.leiter} onChange={(e) => setLeiter(e.target.value)} {...f("leiter").attr} />
      {f("leiter").text}
      <KontaktZeilen kontakte={kontakte} onAendere={(neu) => setKontakte(neu)} />
      <label className="kp-feldname" htmlFor={`${basis}-notiz`}>Notiz</label>
      <Input.TextArea id={`${basis}-notiz`} name="notiz" value={notiz} maxLength={BIB_GRENZE.notiz} autoSize={{ minRows: 2, maxRows: 6 }} onChange={(e) => setNotiz(e.target.value)} {...f("notiz").attr} />
      {f("notiz").text}
    </BibFlyin>
  );
}
