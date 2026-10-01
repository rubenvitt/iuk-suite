"use client";

import { useRef, useState } from "react";
import { Button, Input, Select, type InputRef } from "antd";
import { nachText, Zellentext } from "@/core/tabelle";
import { loescheBibEintragAction, speichereBibVerbindungAction } from "../../_actions/bibliothek";
import { BIB_GRENZE } from "../../_lib/bibliothek/schema";
import type { BibVerbindung } from "../../_lib/bibliothek/typen";
import { ART_NAME, LAENGE, VERBINDUNGS_ARTEN, type VerbindungsArt } from "../../_lib/plan/schema";
import { BibBereich, useBibFormular, type BibBereichZustand } from "./BibBereich";
import { BibFlyin } from "./BibFlyin";

/** Verbindungen der Bibliothek (Entscheidung 11) — im gemeinsamen Rahmen `BibBereich`. */
export function VerbindungenBereich({ verbindungen }: { verbindungen: BibVerbindung[] }) {
  return (
    <BibBereich<BibVerbindung> name="Verbindungen der Bibliothek" mehrzahl="Verbindungen" neu="Neue Verbindung" eintraege={verbindungen}
      leer={{ nichts: "Noch keine Verbindungen in der Bibliothek.", gefiltert: "Keine Verbindung passt zur Suche." }}
      sucheIn={(v) => [v.bezeichnung, ART_NAME[v.art], v.notiz]} karte={{ titel: "bezeichnung" }}
      spalten={(z) => [
        { key: "bezeichnung", title: "Bezeichnung", dataIndex: "bezeichnung", sorter: nachText<BibVerbindung>((v) => v.bezeichnung),
          render: (_: unknown, v: BibVerbindung) => <Button type="link" className="kp-zeilenlink" onClick={() => z.oeffne(v)}>{v.bezeichnung}</Button> },
        { key: "art", title: "Art", render: (_: unknown, v: BibVerbindung) => ART_NAME[v.art] },
        { key: "notiz", title: "Notiz", render: (_: unknown, v: BibVerbindung) => <Zellentext text={v.notiz ?? "—"} /> },
      ]}>
      {(z) => <VerbindungFlyin {...z.flyin} />}
    </BibBereich>
  );
}

function VerbindungFlyin({ eintrag, onSchliessen, onFertig, onWeiter }: BibBereichZustand<BibVerbindung>["flyin"]) {
  const erstesFeld = useRef<InputRef>(null);
  const fm = useBibFormular(eintrag, erstesFeld);
  const { basis, f } = fm;
  const alt = eintrag !== null && eintrag !== "neu" ? eintrag : null;
  const [bezeichnung, setBezeichnung] = useState(alt?.bezeichnung ?? "");
  const [art, setArt] = useState<VerbindungsArt>(alt?.art ?? "tmo");
  const [notiz, setNotiz] = useState(alt?.notiz ?? "");
  async function speichern(weiter: boolean) {
    const r = await fm.sende(() => speichereBibVerbindungAction({ id: alt?.id ?? null, art, bezeichnung, notiz }));
    if (r) (weiter ? onWeiter : onFertig)(`„${r.eintrag.bezeichnung}“ gespeichert.`);
  }
  async function loeschen() {
    if (alt && await fm.sende(() => loescheBibEintragAction({ art: "verbindung", id: alt.id }))) onFertig(`„${alt.bezeichnung}“ gelöscht.`);
  }
  return (
    <BibFlyin offen={eintrag !== null} titel={alt ? "Verbindung bearbeiten" : "Neue Verbindung"} formName="Verbindung der Bibliothek" fehler={fm.fehler} laeuft={fm.laeuft}
      onSchliessen={onSchliessen} onSpeichern={() => void speichern(false)} onWeiter={alt ? undefined : () => void speichern(true)}
      onLoeschen={alt ? () => void loeschen() : undefined} onGeoeffnet={fm.onGeoeffnet}>
      <label className="kp-feldname" htmlFor={`${basis}-bezeichnung`}>Bezeichnung</label>
      <Input ref={erstesFeld} id={`${basis}-bezeichnung`} name="bezeichnung" value={bezeichnung} maxLength={LAENGE.bezeichnung}
        onChange={(e) => setBezeichnung(e.target.value)} {...f("bezeichnung").attr} />
      {f("bezeichnung").text}
      <label className="kp-feldname" htmlFor={`${basis}-art`}>Art</label>
      <Select id={`${basis}-art`} value={art} onChange={setArt} options={VERBINDUNGS_ARTEN.map((a) => ({ value: a, label: ART_NAME[a] }))} {...f("art").attr} />
      {f("art").text}
      <label className="kp-feldname" htmlFor={`${basis}-notiz`}>Notiz</label>
      <Input.TextArea id={`${basis}-notiz`} name="notiz" value={notiz} maxLength={BIB_GRENZE.notiz} autoSize={{ minRows: 2, maxRows: 6 }} onChange={(e) => setNotiz(e.target.value)} {...f("notiz").attr} />
      {f("notiz").text}
    </BibFlyin>
  );
}
