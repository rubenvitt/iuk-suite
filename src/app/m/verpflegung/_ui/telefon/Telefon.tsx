"use client";

import { useEffect, useRef, useState, useTransition, type HTMLAttributes, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icons8Ikone, type Icons8Name } from "@/core/ikonen/Icons8Ikone";
import {
  ausgebenAction, aussondernAmTelefonAction, einbuchenAction, nachschlagenAmTelefonAction, vorlaeufigAnlegenAction,
} from "../../_actions/telefon";
import {
  AUSGABE_ZIELE, AUSSONDER_GRUENDE, datumLang, EINHEITEN, einheitText, fefo, MHD_ART_TEXT, mengeText, restKurz,
  tageBis, vorschlag as fefoVorschlag, zahlText, type AussonderGrund,
} from "../../_lib/mhd";
import type { ArtikelDTO, ChargeSicht, Ergebnis, OrtDTO } from "../../_lib/typen";
import { Kamera } from "./Kamera";
import { Ampel, ArtikelListe, Fehler, Menge, Stepper, Zurueck, type ListenZeile, type Treffer } from "./teile";
import s from "./telefon.module.css";

/**
 * Buchen am Telefon, aufgebaut wie der Helfer-Weg des Lagerbuchs (`lagerbuch/_ui/HelferRahmen.tsx`,
 * `ArtikelSuche.tsx`, `Entnahme.tsx`): Reiter, je Reiter erst die Artikelliste mit Suche und Scan, dann die
 * Artikelseite mit Bestand, Buchung und Chargenwahl. Der Ort ist ein Filter, keine Pflicht; gebucht wird auf die
 * Charge, und die kennt ihren Ort. Nur das Einbuchen fragt nach dem Ort, wenn keiner gewählt ist.
 */

type Tab = "ausgeben" | "einbuchen" | "aussondern" | "bestand";

export interface TelefonDaten {
  zugang: { art: "konto" | "link"; wer: string; laeuftAb: number | null };
  orte: OrtDTO[];
  artikel: ArtikelDTO[];
  chargen: ChargeSicht[];
  heute: string;
  startOrt: string | null;
}

const NICHT_GESPEICHERT = "Ob gebucht wurde, ist unklar. Bitte unter Bestand nachsehen, bevor du es noch einmal versuchst.";

/** Eine Buchung mit Sperre gegen Doppeltippen; nach Erfolg holt `router.refresh()` den neuen Bestand. */
function useBuchen() {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [erfolg, setErfolg] = useState<string | null>(null);
  const sperre = useRef(false);
  const buche = (aktion: () => Promise<Ergebnis>, danach: (r: Extract<Ergebnis, { ok: true }>) => string) => {
    if (sperre.current) return;
    sperre.current = true;
    setFehler(null);
    setErfolg(null);
    starte(async () => {
      try {
        const r = await aktion();
        if (r.ok) { setErfolg(danach(r)); router.refresh(); } else setFehler(r.fehler);
      } catch {
        setFehler(NICHT_GESPEICHERT);
      } finally {
        sperre.current = false;
      }
    });
  };
  return { laeuft, fehler, erfolg, setErfolg, buche };
}

function Erfolg({ text }: { text: string | null }) {
  return text ? (
    <div className={`${s.hinweis} ${s.ok}`} role="status"><Icons8Ikone name="checkmark" groesse={16} /> {text}</div>
  ) : null;
}

function Karte({ titel, children, pad = true, ...rest }: { titel: string; children: ReactNode; pad?: boolean } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={s.karte} {...rest}>
      <div className={s.kartentitel}>{titel}</div>
      {pad ? <div className={s.pad}>{children}</div> : children}
    </div>
  );
}

// ————————————————————————— Artikelseite —————————————————————————

/** Kopf jeder Artikelseite: Zurück, Name mit Kategorie, Bestand im gewählten Umfang. */
function ArtikelKopf({ art, chargen, ort, onZurueck }: { art: ArtikelDTO; chargen: ChargeSicht[]; ort: OrtDTO | null; onZurueck: () => void }) {
  const summe = chargen.reduce((n, c) => n + c.menge, 0);
  const naechste = fefo(chargen)[0];
  return (
    <>
      <Zurueck onClick={onZurueck} />
      <hr className={s.trenner} />
      <div className={s.titelzeile}>
        <h1 className={s.titel} style={{ margin: 0 }}>{art.name}</h1>
        <span className={s.fach}>{art.kategorie}</span>
      </div>
      <div className={`${s.karte} ${s.pad}`}>
        <div className={s.kartentitel} style={{ padding: 0 }}>{ort ? `Bestand ${ort.kurz}` : "Bestand"}</div>
        <div className={s.unterzeile} style={{ marginTop: 2 }}>
          <div className={s.bestandszahl} data-rolle="bestand-zahl">{zahlText(summe)}<small>{einheitText(summe, art.einheit)}</small></div>
          {naechste && <div className={s.meta} style={{ marginTop: 0 }}><span className={s.mhd} style={{ fontSize: 13 }}>{datumLang(naechste.mhd)}</span><Ampel status={naechste.status} /></div>}
        </div>
        {(art.ean || art.vorlaeufig) && (
          <div className={s.meta}>{art.ean && <span className={s.mono}>{art.ean}</span>}{art.vorlaeufig && <span className={`${s.chip} ${s.gelb}`}>vorläufig</span>}</div>
        )}
      </div>
    </>
  );
}

/** Chargenliste als Radiogruppe; `zuerst` ergänzt oben die Wahl „Zuerst ablaufende“ (FEFO) wie im Lagerbuch. */
function ChargenWahl({ chargen, art, wahl, setWahl, zuerst, sperrtGesperrte, mitOrt }: {
  chargen: ChargeSicht[];
  art: ArtikelDTO;
  wahl: string | null;
  setWahl: (id: string | null) => void;
  zuerst: boolean;
  sperrtGesperrte: boolean;
  mitOrt: boolean;
}) {
  return (
    <div className={`${s.karte} ${s.block}`} role="radiogroup" aria-label="Charge">
      <div className={s.kartentitel}>Charge wählen</div>
      {zuerst && (
        <label className={`${s.zeile} ${wahl === null ? s.gewaehlt : ""}`} style={{ minHeight: 56, cursor: "pointer" }}>
          <input type="radio" className={s.wahl} name="charge" checked={wahl === null} onChange={() => setWahl(null)} />
          <div className={s.zeilehaupt}><div className={s.name}>Zuerst ablaufende</div></div>
        </label>
      )}
      {chargen.map((c) => {
        const aus = sperrtGesperrte && c.status.gesperrt;
        return (
          <label key={c.id} className={`${s.zeile} ${wahl === c.id ? s.gewaehlt : ""} ${aus ? s.aus : ""}`} style={{ minHeight: 56, cursor: aus ? "default" : "pointer" }}>
            <input type="radio" className={s.wahl} name="charge" disabled={aus} checked={wahl === c.id} onChange={() => setWahl(c.id)} />
            <div className={s.zeilehaupt}>
              <div className={s.mhd}>{datumLang(c.mhd)}</div>
              <div className={s.meta}>
                <Ampel status={c.status} />
                {mitOrt && <span className={s.mono}>{c.ortKurz}</span>}
                {aus && <span>Verbrauchsdatum überschritten</span>}
              </div>
            </div>
            <Menge menge={c.menge} einheit={art.einheit} />
          </label>
        );
      })}
    </div>
  );
}

function Ausgeben({ art, chargen, ort, onZurueck }: { art: ArtikelDTO; chargen: ChargeSicht[]; ort: OrtDTO | null; onZurueck: () => void }) {
  const { laeuft, fehler, erfolg, buche } = useBuchen();
  const [wahl, setWahl] = useState<string | null>(null);
  const [menge, setMenge] = useState(1);
  const [ziel, setZiel] = useState<string>("Dienstabend");
  const sortiert = fefo(chargen);
  const zuerst = fefoVorschlag(sortiert);
  const gewaehlt = (wahl !== null ? sortiert.find((c) => c.id === wahl && !c.status.gesperrt) : undefined) ?? zuerst;
  const frueher = gewaehlt && gewaehlt !== zuerst ? sortiert.filter((c) => !c.status.gesperrt && !c.status.abgelaufen && c.mhd < gewaehlt.mhd) : [];
  const m = gewaehlt ? Math.min(menge, gewaehlt.menge) : menge;
  return (
    <div className={s.lesebahn}>
      <ArtikelKopf art={art} chargen={chargen} ort={ort} onZurueck={onZurueck} />
      <Karte titel="Ausgabe" className={`${s.karte} ${s.block}`}>
        {sortiert.length === 0 ? <div className={s.name}>Nichts da.</div> : !gewaehlt ? (
          <div className={s.name}>Alles hier ist über dem Verbrauchsdatum.</div>
        ) : (
          <>
            <div className={s.mengenband}>
              <span className={s.label} style={{ margin: 0 }}>Menge</span>
              <Stepper wert={m} setWert={setMenge} max={gewaehlt.menge} einheit={art.einheit} />
            </div>
            <div className={s.block}>
              <span className={s.label}>Wofür?</span>
              <div className={s.chips}>
                {AUSGABE_ZIELE.map((z) => <button type="button" key={z} className={s.wahlchip} aria-pressed={ziel === z} onClick={() => setZiel(z)}>{z}</button>)}
              </div>
            </div>
            {frueher.length > 0 && <div className={`${s.hinweis} ${s.gelb}`}>Früheres MHD liegt noch da: {datumLang(frueher[0].mhd)}.</div>}
            {gewaehlt.status.abgelaufen && <div className={`${s.hinweis} ${s.gelb}`}>MHD überschritten. Nur nach Sichtprüfung ausgeben.</div>}
            <Fehler text={fehler} />
            <button
              type="button"
              className={`${s.knopf} ${s.knopfRot} ${s.breit} ${s.block}`}
              disabled={laeuft}
              onClick={() => buche(() => ausgebenAction({ chargeId: gewaehlt.id, menge: m, ziel }), (r) => { setMenge(1); return r.text ?? "Ausgegeben."; })}
            >
              {mengeText(m, art.einheit)} ausgeben
            </button>
          </>
        )}
        <Erfolg text={erfolg} />
      </Karte>
      {sortiert.length > 0 && (
        <ChargenWahl chargen={sortiert} art={art} wahl={wahl !== null && gewaehlt?.id === wahl ? wahl : null} setWahl={setWahl} zuerst sperrtGesperrte mitOrt={!ort} />
      )}
    </div>
  );
}

function Einbuchen({ art, chargen, ort, orte, heute, onZurueck }: {
  art: ArtikelDTO; chargen: ChargeSicht[]; ort: OrtDTO | null; orte: OrtDTO[]; heute: string; onZurueck: () => void;
}) {
  const { laeuft, fehler, erfolg, setErfolg, buche } = useBuchen();
  const [mhd, setMhd] = useState("");
  const [menge, setMenge] = useState(1);
  const [wohin, setWohin] = useState<string | null>(ort?.id ?? (orte.length === 1 ? orte[0].id : null));
  const tage = mhd ? tageBis(mhd, heute) : null;
  const vorhanden = mhd && wohin ? chargen.find((c) => c.ortId === wohin && c.mhd === mhd) : undefined;
  return (
    <div className={s.lesebahn}>
      <ArtikelKopf art={art} chargen={chargen} ort={ort} onZurueck={onZurueck} />
      <Karte titel="Eingang" className={`${s.karte} ${s.block}`}>
        <label className={s.label} htmlFor="e-mhd">{MHD_ART_TEXT[art.mhdArt]}</label>
        <input id="e-mhd" type="date" className={`${s.feld} ${s.datum}`} value={mhd} min={heute} onChange={(e) => { setMhd(e.target.value); setErfolg(null); }} />
        {tage !== null && tage < 0 && <div className={`${s.hinweis} ${s.rot}`}>Datum liegt in der Vergangenheit. Abgelaufene Ware nicht einbuchen.</div>}
        {tage !== null && tage >= 0 && tage <= art.rotTage && <div className={`${s.hinweis} ${s.gelb}`}>Läuft {restKurz(tage)} ab.</div>}
        {vorhanden && <div className={`${s.hinweis} ${s.grau}`}>Mit diesem MHD liegen schon {mengeText(vorhanden.menge, art.einheit)} da.</div>}
        <div className={`${s.mengenband} ${s.block}`}>
          <span className={s.label} style={{ margin: 0 }}>Menge</span>
          <Stepper wert={menge} setWert={setMenge} einheit={art.einheit} />
        </div>
        {orte.length === 0 && <div className={`${s.hinweis} ${s.grau}`}>Noch keine Lagerorte.</div>}
        {!ort && orte.length > 1 && (
          <div className={s.block}>
            <span className={s.label}>Wohin?</span>
            <div className={s.chips}>
              {orte.map((o) => <button type="button" key={o.id} className={s.wahlchip} aria-pressed={wohin === o.id} onClick={() => setWohin(o.id)}>{o.name}</button>)}
            </div>
          </div>
        )}
        <Fehler text={fehler} />
        <button
          type="button"
          className={`${s.knopf} ${s.knopfRot} ${s.breit} ${s.block}`}
          disabled={!mhd || !wohin || (tage !== null && tage < 0) || laeuft}
          onClick={() => {
            if (!wohin) return;
            const n = menge;
            buche(() => einbuchenAction({ artikelId: art.id, ortId: wohin, mhd, menge: n }), (r) => {
              setMhd(""); setMenge(1);
              return `${mengeText(n, art.einheit)} ${art.name} ${r.text ?? "eingebucht"}`;
            });
          }}
        >
          {mengeText(menge, art.einheit)} einbuchen
        </button>
        <Erfolg text={erfolg} />
      </Karte>
      {chargen.length > 0 && <ChargenListe chargen={chargen} art={art} titel="Liegt schon da" mitOrt={!ort} />}
    </div>
  );
}

function Aussondern({ art, chargen, ort, onZurueck }: { art: ArtikelDTO; chargen: ChargeSicht[]; ort: OrtDTO | null; onZurueck: () => void }) {
  const { laeuft, fehler, erfolg, buche } = useBuchen();
  const sortiert = fefo(chargen);
  const [wahl, setWahl] = useState<string | null>((sortiert.find((c) => c.status.abgelaufen) ?? sortiert[0])?.id ?? null);
  const gewaehlt = sortiert.find((c) => c.id === wahl) ?? sortiert[0];
  const [menge, setMenge] = useState(gewaehlt?.menge ?? 1);
  const [grund, setGrund] = useState<AussonderGrund>(gewaehlt?.status.abgelaufen ? "abgelaufen" : "beschädigt");
  const [freitext, setFreitext] = useState("");
  const m = gewaehlt ? Math.min(menge, gewaehlt.menge) : menge;
  const waehle = (id: string | null) => {
    const c = sortiert.find((x) => x.id === id);
    setWahl(id);
    if (c) { setMenge(c.menge); setGrund(c.status.abgelaufen ? "abgelaufen" : "beschädigt"); }
  };
  return (
    <div className={s.lesebahn}>
      <ArtikelKopf art={art} chargen={chargen} ort={ort} onZurueck={onZurueck} />
      <Karte titel="Aussonderung" className={`${s.karte} ${s.block}`}>
        {!gewaehlt ? <div className={s.name}>Nichts da.</div> : (
          <>
            <span className={s.label}>Warum?</span>
            <div className={s.chips}>{AUSSONDER_GRUENDE.map((g) => <button type="button" key={g} className={s.wahlchip} aria-pressed={grund === g} onClick={() => setGrund(g)}>{g}</button>)}</div>
            {grund === "Sonstiges" && <input className={s.feld} style={{ marginTop: 10 }} aria-label="Was ist passiert?" placeholder="Was ist passiert?" maxLength={200} value={freitext} onChange={(e) => setFreitext(e.target.value)} />}
            <div className={`${s.mengenband} ${s.block}`}>
              <span className={s.label} style={{ margin: 0 }}>Menge</span>
              <Stepper wert={m} setWert={setMenge} max={gewaehlt.menge} einheit={art.einheit} />
            </div>
            <Fehler text={fehler} />
            <button
              type="button"
              className={`${s.knopf} ${s.knopfRot} ${s.breit} ${s.block}`}
              disabled={(grund === "Sonstiges" && !freitext.trim()) || laeuft}
              onClick={() => buche(() => aussondernAmTelefonAction({ chargeId: gewaehlt.id, menge: m, grund, freitext }), (r) => { setFreitext(""); return r.text ?? "Ausgesondert."; })}
            >
              {mengeText(m, art.einheit)} aussondern
            </button>
          </>
        )}
        <Erfolg text={erfolg} />
      </Karte>
      {sortiert.length > 0 && <ChargenWahl chargen={sortiert} art={art} wahl={gewaehlt?.id ?? null} setWahl={waehle} zuerst={false} sperrtGesperrte={false} mitOrt={!ort} />}
    </div>
  );
}

function ChargenListe({ chargen, art, titel, mitOrt }: { chargen: ChargeSicht[]; art: ArtikelDTO; titel: string; mitOrt: boolean }) {
  return (
    <div className={`${s.karte} ${s.block}`} aria-label={titel}>
      <div className={s.kartentitel}>{titel}</div>
      {fefo(chargen).map((c) => (
        <div key={c.id} className={s.zeile}>
          <div className={s.zeilehaupt}>
            <div className={s.mhd}>{datumLang(c.mhd)}</div>
            <div className={s.meta}><Ampel status={c.status} />{mitOrt && <span>{c.ortName}</span>}</div>
          </div>
          <Menge menge={c.menge} einheit={art.einheit} />
        </div>
      ))}
    </div>
  );
}

function Bestand({ art, chargen, ort, onZurueck }: { art: ArtikelDTO; chargen: ChargeSicht[]; ort: OrtDTO | null; onZurueck: () => void }) {
  return (
    <div className={s.lesebahn}>
      <ArtikelKopf art={art} chargen={chargen} ort={ort} onZurueck={onZurueck} />
      {chargen.length > 0 ? <ChargenListe chargen={chargen} art={art} titel="Chargen" mitOrt={!ort} /> : <div className={`${s.karte} ${s.leer} ${s.block}`}>Nichts da.</div>}
    </div>
  );
}

// ————————————————————————— Unbekannte Packung —————————————————————————

const SCHNELL_EINHEITEN = EINHEITEN.filter((e) => e !== "Karton" && e !== "Laib");

function VorlaeufigAnlegen({ ean, onZurueck, onAngelegt }: { ean: string; onZurueck: () => void; onAngelegt: (a: ArtikelDTO) => void }) {
  const router = useRouter();
  const [laeuft, starte] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [einheit, setEinheit] = useState<string>("Stück");
  const [kategorie, setKategorie] = useState<string | null>(null);
  const [sucht, setSucht] = useState(true);
  useEffect(() => {
    let aus = false;
    nachschlagenAmTelefonAction(ean)
      .then((f) => {
        if (aus || !f) return;
        setName((n) => n || f.name);
        if (f.einheit) setEinheit(f.einheit);
        setKategorie(f.kategorie);
      })
      .catch(() => undefined)
      .finally(() => { if (!aus) setSucht(false); });
    return () => { aus = true; };
  }, [ean]);
  return (
    <div className={s.lesebahn}>
      <Zurueck onClick={onZurueck} />
      <hr className={s.trenner} />
      <div className={s.titelzeile}><h1 className={s.titel} style={{ margin: 0 }}>Neuer Artikel</h1></div>
      <div className={`${s.karte} ${s.pad} ${s.stapel}`}>
        <div><span className={s.label}>Strichcode</span><span className={s.mono}>{ean}</span></div>
        <div>
          <label className={s.label} htmlFor="v-name">Bezeichnung</label>
          <input id="v-name" className={s.feld} value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder={sucht ? "…" : undefined} />
        </div>
        <div>
          <span className={s.label}>Einheit</span>
          <div className={s.chips}>{SCHNELL_EINHEITEN.map((e) => <button type="button" key={e} className={s.wahlchip} aria-pressed={einheit === e} onClick={() => setEinheit(e)}>{e}</button>)}</div>
        </div>
        <Fehler text={fehler} />
        <button
          type="button"
          className={`${s.knopf} ${s.knopfRot} ${s.breit}`}
          disabled={!name.trim() || laeuft}
          onClick={() => starte(async () => {
            setFehler(null);
            try {
              const r = await vorlaeufigAnlegenAction({ name, ean, einheit }, kategorie);
              if (!r.ok) { setFehler(r.fehler); return; }
              onAngelegt({
                id: r.id!, name: name.trim(), ean, kategorie: kategorie ?? "Sonstiges", einheit, mhdArt: "mhd", rotTage: 7, gelbTage: 30,
                mindest: null, vorlaeufig: true, aktiv: true,
              });
              router.refresh();
            } catch {
              setFehler(NICHT_GESPEICHERT);
            }
          })}
        >
          Anlegen und weiter
        </button>
      </div>
    </div>
  );
}

function Unbekannt({ ean, kannAnlegen, onZurueck, onAnlegen }: { ean: string; kannAnlegen: boolean; onZurueck: () => void; onAnlegen: () => void }) {
  return (
    <div className={s.lesebahn}>
      <Zurueck onClick={onZurueck} />
      <div className={`${s.karte} ${s.pad}`}>
        <div className={s.name}>Diesen Strichcode kennt das Lager noch nicht.</div>
        <div className={s.meta}><span className={s.mono}>{ean}</span></div>
      </div>
      {kannAnlegen && <button type="button" className={`${s.knopf} ${s.knopfTinte} ${s.breit} ${s.block}`} onClick={onAnlegen}>Artikel vorläufig anlegen</button>}
    </div>
  );
}

// ————————————————————————— Reiter —————————————————————————

const TABS: { key: Tab; titel: string; ikone: Icons8Name; kopf: string }[] = [
  { key: "ausgeben", titel: "Ausgeben", ikone: "give", kopf: "Ausgeben" },
  { key: "einbuchen", titel: "Einbuchen", ikone: "receive", kopf: "Einbuchen" },
  { key: "aussondern", titel: "Aussondern", ikone: "trash", kopf: "Aussondern" },
  { key: "bestand", titel: "Bestand", ikone: "package", kopf: "Bestand" },
];

type Ansicht = { art: "liste" } | { art: "artikel"; id: string } | { art: "unbekannt"; ean: string } | { art: "anlegen"; ean: string };

function Reiter(p: { tab: Tab; d: TelefonDaten; ort: OrtDTO | null; onOrt: () => void }) {
  const [ansicht, setAnsicht] = useState<Ansicht>({ art: "liste" });
  const anker = useRef<HTMLSpanElement>(null);
  // Ein Wechsel zwischen Liste und Artikelseite beginnt oben, sonst steht die neue Seite mitten im alten Scroll.
  useEffect(() => { anker.current?.closest("main")?.scrollTo(0, 0); }, [ansicht]);
  return <><span ref={anker} hidden /><ReiterInhalt {...p} ansicht={ansicht} setAnsicht={setAnsicht} /></>;
}

function ReiterInhalt({ tab, d, ort, onOrt, ansicht, setAnsicht }: {
  tab: Tab; d: TelefonDaten; ort: OrtDTO | null; onOrt: () => void; ansicht: Ansicht; setAnsicht: (a: Ansicht) => void;
}) {
  const [neu, setNeu] = useState<ArtikelDTO | null>(null);
  const zurListe = () => setAnsicht({ art: "liste" });
  const imUmfang = d.chargen.filter((c) => !ort || c.ortId === ort.id);
  const chargenVon = (id: string) => imUmfang.filter((c) => c.artikelId === id);

  if (ansicht.art === "anlegen") {
    return <VorlaeufigAnlegen ean={ansicht.ean} onZurueck={zurListe} onAngelegt={(a) => { setNeu(a); setAnsicht({ art: "artikel", id: a.id }); }} />;
  }
  if (ansicht.art === "unbekannt") {
    return <Unbekannt ean={ansicht.ean} kannAnlegen={tab === "einbuchen"} onZurueck={zurListe} onAnlegen={() => setAnsicht({ art: "anlegen", ean: ansicht.ean })} />;
  }
  if (ansicht.art === "artikel") {
    const art = d.artikel.find((a) => a.id === ansicht.id) ?? (neu?.id === ansicht.id ? neu : undefined);
    if (art) {
      const p = { art, chargen: chargenVon(art.id), ort, onZurueck: zurListe };
      if (tab === "ausgeben") return <Ausgeben {...p} />;
      if (tab === "einbuchen") return <Einbuchen {...p} orte={d.orte} heute={d.heute} />;
      if (tab === "aussondern") return <Aussondern {...p} />;
      return <Bestand {...p} />;
    }
  }

  const mitBestand = tab !== "einbuchen";
  const zeilen: ListenZeile[] = d.artikel
    .map((a) => {
      const cs = chargenVon(a.id);
      const naechste = fefo(cs)[0];
      return { artikel: a, bestand: cs.reduce((n, c) => n + c.menge, 0), ampel: naechste?.status ?? null, abgelaufen: cs.some((c) => c.status.abgelaufen) };
    })
    .filter((z) => !mitBestand || z.bestand > 0)
    .sort((x, y) => (tab === "aussondern" ? Number(y.abgelaufen) - Number(x.abgelaufen) : 0));
  const kopf = TABS.find((t) => t.key === tab)!.kopf;
  return (
    <>
      <div className={s.schirmzeile}>
        <div className={s.schirmkopf} data-rolle="schirm-kopf">{kopf}</div>
        {d.orte.length > 0 && (
          <button type="button" className={s.ortpille} onClick={onOrt} aria-label="Ort wechseln" data-rolle="ort">
            <Icons8Ikone name="marker" groesse={18} /><span>{ort ? ort.name : "Alle Orte"}</span>
          </button>
        )}
      </div>
      <ArtikelListe
        zeilen={zeilen}
        artikel={d.artikel}
        onWahl={(id) => setAnsicht({ art: "artikel", id })}
        onTreffer={(t: Treffer) => setAnsicht(t.artikelId ? { art: "artikel", id: t.artikelId } : { art: "unbekannt", ean: t.ean })}
        leerText={mitBestand ? (ort ? "Hier liegt nichts." : "Das Lager ist leer.") : "Noch keine Artikel."}
      />
    </>
  );
}

// ————————————————————————— Rahmen —————————————————————————

/** Restzeit des Helfer-Links; erst nach dem Laden gerechnet, damit Server und Browser gleich rendern. */
function Restzeit({ laeuftAb }: { laeuftAb: number }) {
  const [jetzt, setJetzt] = useState<number | null>(null);
  useEffect(() => {
    const t0 = setTimeout(() => setJetzt(Date.now()), 0);
    const t = setInterval(() => setJetzt(Date.now()), 30_000);
    return () => { clearTimeout(t0); clearInterval(t); };
  }, []);
  if (jetzt === null) return null;
  const min = Math.max(0, Math.floor((laeuftAb - jetzt) / 60_000));
  return <span className={s.zeitleiste}> · noch {Math.floor(min / 60)}:{String(min % 60).padStart(2, "0")} h</span>;
}

const ORT_AUS_QR = /\/o\/([A-Za-z0-9-]+)\/?(?:[?#].*)?$/;

function OrtWahl({ orte, ortId, onWahl, onZu }: { orte: OrtDTO[]; ortId: string | null; onWahl: (id: string | null) => void; onZu: () => void }) {
  const [fehler, setFehler] = useState<string | null>(null);
  return (
    <div className={s.blattHinter} onClick={onZu}>
      <div className={s.blatt} onClick={(e) => e.stopPropagation()} role="dialog" aria-label="Ort wechseln">
        <div className={s.schirmkopf}>Ortsetikett scannen</div>
        <Kamera
          lesart="qr"
          hoehe={150}
          onCode={(text) => {
            const id = ORT_AUS_QR.exec(text)?.[1];
            if (id && orte.some((o) => o.id === id)) onWahl(id);
            else setFehler("Das ist kein Ortsetikett dieses Lagers.");
          }}
        />
        <Fehler text={fehler} />
        <div className={`${s.karte} ${s.block}`}>
          <button type="button" className={s.zeile} onClick={() => onWahl(null)}>
            <Icons8Ikone name="marker" groesse={20} />
            <div className={s.zeilehaupt}><div className={s.name}>Alle Orte</div></div>
            {ortId === null && <span className={`${s.chip} ${s.grau}`}>gewählt</span>}
          </button>
          {orte.map((o) => (
            <button type="button" key={o.id} className={s.zeile} onClick={() => onWahl(o.id)}>
              <Icons8Ikone name="marker" groesse={20} />
              <div className={s.zeilehaupt}>
                <div className={s.name}>{o.name}</div>
                <div className={s.meta}><span className={s.mono}>{o.kurz}</span></div>
              </div>
              {o.id === ortId && <span className={`${s.chip} ${s.grau}`}>gewählt</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function Telefon({ d }: { d: TelefonDaten }) {
  const [tab, setTab] = useState<Tab>("ausgeben");
  const [ortId, setOrtId] = useState<string | null>(d.orte.find((o) => o.id === d.startOrt)?.id ?? null);
  const [ortWahl, setOrtWahl] = useState(false);
  const [schluessel, setSchluessel] = useState(0);
  const ort = d.orte.find((o) => o.id === ortId) ?? null;
  const wechsle = (t: Tab) => { setTab(t); setSchluessel((k) => k + 1); };
  const waehleOrt = (id: string | null) => {
    setOrtId(id);
    setOrtWahl(false);
    window.history.replaceState(null, "", id ? `?ort=${encodeURIComponent(id)}` : window.location.pathname);
  };
  return (
    <div className={s.rahmen}>
      <div className={s.streifen} />
      <header className={s.kopf}>
        <div>
          <div className={s.marke}>VERPFLEGUNGS<span className={s.akzent}>LAGER</span></div>
          <div className={s.etikett} data-rolle="wer">{d.zugang.wer}{d.zugang.laeuftAb !== null && <Restzeit laeuftAb={d.zugang.laeuftAb} />}</div>
        </div>
        {d.zugang.art === "link" ? (
          <a className={s.beenden} href="/abmelden"><Icons8Ikone name="logout" groesse={16} /> Beenden</a>
        ) : (
          <Link className={s.beenden} href="/"><Icons8Ikone name="arrow-left" groesse={16} /> Verwaltung</Link>
        )}
      </header>
      <main className={s.inhalt} key={`${tab}-${ortId}-${schluessel}`}>
        <Reiter tab={tab} d={d} ort={ort} onOrt={() => setOrtWahl(true)} />
      </main>
      <nav className={s.tableiste} aria-label="Bereiche">
        {TABS.map((t) => (
          <button type="button" key={t.key} className={s.tab} aria-current={tab === t.key ? "page" : undefined} onClick={() => wechsle(t.key)}>
            <Icons8Ikone name={t.ikone} groesse={22} />
            {t.titel}
          </button>
        ))}
      </nav>
      {ortWahl && <OrtWahl orte={d.orte} ortId={ortId} onWahl={waehleOrt} onZu={() => setOrtWahl(false)} />}
    </div>
  );
}
