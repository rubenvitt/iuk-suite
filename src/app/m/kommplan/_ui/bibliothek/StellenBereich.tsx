"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Input, type InputRef, type TableProps } from "antd";
import { Kartentabelle, nachText, Zellentext } from "@/core/tabelle";
import { loescheBibEintragAction, speichereBibStelleAction } from "../../_actions/bibliothek";
import { passt, type BibStelle } from "../../_lib/bibliothek/typen";
import { KONTAKT_NAME } from "../../_lib/plan/kontakte";
import { LAENGE, type Kontakt } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import { KontaktZeilen } from "../editor/KontaktZeilen";
import { ZeichenWahl } from "../editor/ZeichenWahl";
import type { Symbolsatz } from "../zeichnung/Symbole";
import { BibFlyin, feldHilfe, useFokusNachFlyin } from "./BibFlyin";

const NETZ = "Das ging nicht durch. Prüfe die Verbindung und versuche es noch einmal.";

export function StellenBereich({ stellen, zeichenIndex, symbole, ladeSymbole }: {
  stellen: BibStelle[]; zeichenIndex: readonly ZeichenIndexEintrag[]; symbole: Symbolsatz; ladeSymbole: (k: string[]) => void;
}) {
  const router = useRouter();
  const [suche, setSuche] = useState("");
  const [offen, setOffen] = useState<BibStelle | "neu" | null>(null);
  const neuKnopf = useFokusNachFlyin(offen !== null);
  const [meldung, setMeldung] = useState<string | null>(null);
  /** Zählt „Speichern und nächste": jede Runde montiert ein leeres Formular neu (Fokus wieder im Titel). */
  const [runde, setRunde] = useState(0);
  const titelVon = new Map(zeichenIndex.map((e) => [e.schluessel, e.titel]));
  const sichtbar = stellen.filter((s) => passt(suche, [s.titel, s.leiter, s.notiz, ...s.kontakte.map((k) => k.wert)]));
  const spalten: NonNullable<TableProps<BibStelle>["columns"]> = [
    { key: "titel", title: "Titel", dataIndex: "titel", sorter: nachText<BibStelle>((s) => s.titel),
      render: (_: unknown, s: BibStelle) => <Button type="link" className="kp-zeilenlink" onClick={() => setOffen(s)}>{s.titel}</Button> },
    { key: "zeichen", title: "Zeichen", render: (_: unknown, s: BibStelle) => (s.zeichen ? titelVon.get(s.zeichen) ?? s.zeichen : "—") },
    { key: "leiter", title: "Leiter", render: (_: unknown, s: BibStelle) => s.leiter ?? "—" },
    // Freitext über Zellentext (docs/design/README.md „Mobil"): EIN langer Eintrag schöbe sonst alle Spalten dahinter aus dem Bild.
    { key: "kontakte", title: "Kontakte", render: (_: unknown, s: BibStelle) => <Zellentext text={s.kontakte.length === 0 ? "—" : s.kontakte.map((k) => `${KONTAKT_NAME[k.art]} ${k.wert}`).join(" · ")} /> },
    { key: "notiz", title: "Notiz", render: (_: unknown, s: BibStelle) => <Zellentext text={s.notiz ?? "—"} /> },
  ];
  return (
    <section aria-label="Stellen der Bibliothek" className="kp-bib-bereich">
      <div className="kp-bib-werkzeuge">
        <Input className="kp-bib-suche" aria-label="Stellen suchen" placeholder="Suchen" allowClear value={suche} onChange={(e) => setSuche(e.target.value)} />
        <Button ref={neuKnopf} type="primary" onClick={() => setOffen("neu")}>Neue Stelle</Button>
      </div>
      {meldung ? <p className="kp-hinweis" role="status">{meldung}</p> : null}
      <Kartentabelle<BibStelle> aria-label="Stellen" rowKey="id" dataSource={sichtbar} columns={spalten}
        leer={{ nichts: "Noch keine Stellen in der Bibliothek.", gefiltert: "Keine Stelle passt zur Suche.", aktiv: suche.trim() !== "" }}
        karte={{ titel: "titel" }} />
      <StelleFlyin key={offen === null ? "zu" : offen === "neu" ? `neu:${runde}` : offen.id} eintrag={offen} zeichenIndex={zeichenIndex} symbole={symbole} ladeSymbole={ladeSymbole}
        onSchliessen={() => setOffen(null)} onFertig={(text) => { setOffen(null); setMeldung(text); router.refresh(); }}
        onWeiter={(text) => { setMeldung(text); setRunde((n) => n + 1); router.refresh(); }} />
    </section>
  );
}

function StelleFlyin({ eintrag, zeichenIndex, symbole, ladeSymbole, onSchliessen, onFertig, onWeiter }: {
  eintrag: BibStelle | "neu" | null; zeichenIndex: readonly ZeichenIndexEintrag[]; symbole: Symbolsatz; ladeSymbole: (k: string[]) => void;
  onSchliessen: () => void; onFertig: (meldung: string) => void; onWeiter: (meldung: string) => void;
}) {
  const basis = useId();
  const titelFeld = useRef<InputRef>(null);
  // Fokus beim Öffnen ins erste Feld (wie „Neuer Plan"); nach „Speichern und nächste" montiert das Formular neu (key) — derselbe Effekt.
  useEffect(() => { if (eintrag !== null) titelFeld.current?.focus(); }, [eintrag]);
  const alt = eintrag !== null && eintrag !== "neu" ? eintrag : null;
  const [titel, setTitel] = useState(alt?.titel ?? "");
  const [zeichen, setZeichen] = useState<string | null>(alt?.zeichen ?? null);
  const [leiter, setLeiter] = useState(alt?.leiter ?? "");
  const [kontakte, setKontakte] = useState<Kontakt[]>(alt?.kontakte ?? []);
  const [notiz, setNotiz] = useState(alt?.notiz ?? "");
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<Record<string, string>>({});
  const [laeuft, setLaeuft] = useState(false);
  const f = (name: string) => feldHilfe(basis, feldFehler, name);
  async function speichern(weiter: boolean) {
    setLaeuft(true);
    const r = await speichereBibStelleAction({ id: alt?.id ?? null, titel, zeichen, leiter, kontakte, notiz })
      .catch(() => ({ ok: false as const, fehler: NETZ }));
    setLaeuft(false);
    if (r.ok) { (weiter ? onWeiter : onFertig)(`„${r.eintrag.titel}“ gespeichert.`); return; }
    setFehler(r.fehler); setFeldFehler("feldFehler" in r && r.feldFehler ? r.feldFehler : {});
  }
  async function loeschen() {
    if (!alt) return;
    setLaeuft(true);
    const r = await loescheBibEintragAction({ art: "stelle", id: alt.id }).catch(() => ({ ok: false as const, fehler: NETZ }));
    setLaeuft(false);
    if (r.ok) onFertig(`„${alt.titel}“ gelöscht.`); else setFehler(r.fehler);
  }
  return (
    <BibFlyin offen={eintrag !== null} titel={alt ? "Stelle bearbeiten" : "Neue Stelle"} formName="Stelle der Bibliothek" fehler={fehler} laeuft={laeuft}
      onSchliessen={onSchliessen} onSpeichern={() => void speichern(false)} onWeiter={alt ? undefined : () => void speichern(true)}
      onLoeschen={alt ? () => void loeschen() : undefined} onGeoeffnet={() => titelFeld.current?.focus()}>
      <label className="kp-feldname" htmlFor={`${basis}-titel`}>Titel</label>
      <Input ref={titelFeld} id={`${basis}-titel`} name="titel" value={titel} maxLength={LAENGE.titel} onChange={(e) => setTitel(e.target.value)} {...f("titel").attr} />
      {f("titel").text}
      <fieldset className="kp-abschnitt"><legend>Zeichen</legend>
        <ZeichenWahl wert={zeichen} index={zeichenIndex} symbole={symbole} ladeSymbole={ladeSymbole} planZeichen={[]} onWahl={setZeichen} />
      </fieldset>
      <label className="kp-feldname" htmlFor={`${basis}-leiter`}>Leiter</label>
      <Input id={`${basis}-leiter`} name="leiter" value={leiter} maxLength={LAENGE.leiter} onChange={(e) => setLeiter(e.target.value)} {...f("leiter").attr} />
      {f("leiter").text}
      <KontaktZeilen kontakte={kontakte} onAendere={(neu) => setKontakte(neu)} />
      <label className="kp-feldname" htmlFor={`${basis}-notiz`}>Notiz</label>
      <Input.TextArea id={`${basis}-notiz`} name="notiz" value={notiz} maxLength={500} autoSize={{ minRows: 2, maxRows: 6 }} onChange={(e) => setNotiz(e.target.value)} {...f("notiz").attr} />
      {f("notiz").text}
    </BibFlyin>
  );
}
