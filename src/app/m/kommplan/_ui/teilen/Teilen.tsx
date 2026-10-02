"use client";

import { useEffect, useRef, useState } from "react";
import { Button, Drawer, Input, Popconfirm, Radio, Switch, type InputRef } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { stelleFreigabeAusAction, widerrufeFreigabeAction } from "../../_actions/freigabe";
import { NETZFEHLER, type FreigabeErgebnis } from "../../_lib/ergebnis";
import { besteFreigabe, DAUER_NAME, DAUER_VORGABE, FREIGABE_DAUERN, FREIGABE_GRENZE, tokenUrl, type FreigabeDauer, type FreigabeZeile } from "../../_lib/freigabe/regeln";
import { ablaufText, abrufText, qrZielSatz, ZEIT } from "../../_lib/freigabe/texte";
import { Organisation, type OrganisationProps } from "./Organisation";
import { kopiere } from "./zwischenablage";
import { OHNE_FOKUSRUECKGABE } from "../fokus";

export const TEILEN_FLYIN_GRUND = 520;
const KEINE_ADRESSE = "Für die Kommunikationspläne ist keine Adresse eingerichtet. Links lassen sich erst ausstellen, wenn der Betrieb sie festlegt.";
const KOPIERT_MS = 2000;

interface Props {
  planId: string; basis: string | null; freigaben: FreigabeZeile[]; onFreigaben: (f: FreigabeZeile[]) => void;
  /** Derselbe Schalter wie im Plan-Flyin (eine Option `qrAufDruck`, zwei Orte; Entscheidung 10). */
  qr?: { an: boolean; onAendern: (an: boolean) => void };
  /** Sichtbarkeit und Einladungen (`Organisation.tsx`) — oben im Flyin, die Links darunter. */
  organisation?: Omit<OrganisationProps, "planId">;
}

/**
 * Das Flyin (Entscheidung 17): ohne Maske wie die übrigen Flyins; `nachSchliessen` gibt den Fokus an die Fläche zurück.
 * `autoFocus` nur ohne Adresse: sonst fokussiert sich die Notiz selbst, und rc-drawer fokussierte seinen Container
 * NACH ihr (wie StelleFlyin).
 */
export function TeilenFlyin({ offen, onSchliessen, nachSchliessen, ...p }: Props & { offen: boolean; onSchliessen: () => void; nachSchliessen: () => void }) {
  return (
    <Drawer open={offen} onClose={onSchliessen} mask={false} size={flyinBreite(TEILEN_FLYIN_GRUND)} destroyOnHidden rootClassName="kp-flyin" focusable={OHNE_FOKUSRUECKGABE}
      autoFocus={p.basis === null} title="Teilen" afterOpenChange={(auf) => { if (!auf) nachSchliessen(); }}>
      {offen ? <Teilen {...p} /> : null}
    </Drawer>
  );
}

/**
 * TOKEN-LINKS AUSSTELLEN, KOPIEREN, WIDERRUFEN (Spec §8.2; Umsetzungsplan Phase 5, Entscheidung 17). Die Liste kommt
 * vom Server mit fertigem Status und geht nach jeder Action ganz zurück an den Editor (`onFreigaben`) — hier rechnet
 * niemand mit der Uhr. Rückmeldung am Eintrag selbst („Kopiert", Lesefeld), dazu EIN `role="status"` für Screenreader.
 * Fokus: beim Öffnen die Notiz, nach dem Ausstellen „Link kopieren" am neuen Link, nach dem Widerrufen der nächste
 * gültige Link oder die Legende „Gültige Links (0)" — der Knopf, auf den Popconfirm zurückwollte, ist dann weg.
 */
export function Teilen({ planId, basis, freigaben, onFreigaben, qr, organisation }: Props) {
  const [dauer, setDauer] = useState<FreigabeDauer>(DAUER_VORGABE);
  const [notiz, setNotiz] = useState("");
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [neu, setNeu] = useState<string | null>(null);
  const [kopiert, setKopiert] = useState<string | null>(null);
  const [manuell, setManuell] = useState<{ id: string; url: string } | null>(null);
  const neuKnopf = useRef<HTMLButtonElement>(null);
  const manuellFeld = useRef<InputRef>(null);
  const gueltigeListe = useRef<HTMLFieldSetElement>(null);
  const nachWiderruf = useRef(false);
  useEffect(() => { if (neu) neuKnopf.current?.focus(); }, [neu]);
  // `focus({ cursor: "all" })` fokussiert UND markiert (antds InputRef) — `select()` allein bewegt den Fokus nicht verlässlich.
  useEffect(() => { if (manuell) manuellFeld.current?.focus({ cursor: "all" }); }, [manuell]);
  useEffect(() => {
    if (!nachWiderruf.current) return;
    nachWiderruf.current = false;
    const feld = gueltigeListe.current;
    (feld?.querySelector<HTMLElement>("[data-freigabe] button") ?? feld?.querySelector<HTMLElement>("legend"))?.focus();
  }, [freigaben]);

  async function lauf(schluessel: string, tu: () => Promise<FreigabeErgebnis>, erfolg: (r: Extract<FreigabeErgebnis, { ok: true }>) => void) {
    if (laeuft !== null) return;
    setLaeuft(schluessel); setMeldung(null); setManuell(null); setKopiert(null);
    const r = await tu().catch((): FreigabeErgebnis => ({ ok: false, fehler: NETZFEHLER, feldFehler: {} }));
    setLaeuft(null);
    if (!r.ok) { setMeldung(r.feldFehler.notiz ?? r.fehler); return; }
    erfolg(r);              // vor onFreigaben: die Fokusregel nach dem Widerrufen hängt an der neuen Liste
    onFreigaben(r.freigaben);
  }
  const ausstellen = () => lauf("neu", () => stelleFreigabeAusAction({ planId, dauer, notiz }), (r) => {
    setNotiz(""); setNeu(r.neu); setMeldung("Link ausgestellt.");
  });
  const widerrufe = (f: FreigabeZeile) => lauf(f.id, () => widerrufeFreigabeAction({ planId, freigabeId: f.id }), () => {
    nachWiderruf.current = true;
    setMeldung("Link widerrufen. Wer ihn hat, sieht den Plan nicht mehr.");
  });
  async function kopiereLink(f: FreigabeZeile) {
    if (!basis) return;
    const url = tokenUrl(basis, f.token);
    if ((await kopiere(url)) === "kopiert") {
      setManuell(null); setKopiert(f.id); setMeldung("Link kopiert.");
      setTimeout(() => setKopiert((k) => (k === f.id ? null : k)), KOPIERT_MS);
      return;
    }
    setKopiert(null);
    setManuell({ id: f.id, url });
    setMeldung("Kopieren ging hier nicht von selbst — der Link ist markiert. Kopiere ihn mit Strg+C bzw. ⌘C.");
  }

  const gueltig = freigaben.filter((f) => f.status === "gueltig");
  const vorbei = freigaben.filter((f) => f.status !== "gueltig");
  const qrBester = besteFreigabe(gueltig);
  const eintrag = (f: FreigabeZeile) => (
    // Hervorgehoben nur, solange er gültig ist: widerrufen wanderte der Rahmen sonst mit nach „Abgelaufen und widerrufen“.
    <li key={f.id} className="kp-freigabe" data-freigabe={f.id} data-neu={f.id === neu && f.status === "gueltig" ? "" : undefined}>
      <p className="kp-freigabe-notiz">{f.notiz ?? "ohne Notiz"}</p>
      <p className="kp-hilfe">{`${ablaufText(f)} · ausgestellt ${ZEIT.format(f.erstelltAm)}${f.erstelltVon.trim() ? ` von ${f.erstelltVon}` : ""}`}</p>
      <p className="kp-hilfe">{abrufText(f)}</p>
      {basis ? <p className="kp-freigabe-link" data-link="">{tokenUrl(basis, f.token)}</p> : null}
      {f.status === "gueltig" ? (
        <div className="kp-formular-knoepfe">
          <Button ref={f.id === neu ? neuKnopf : undefined} onClick={() => void kopiereLink(f)} disabled={!basis}>
            {kopiert === f.id ? "Kopiert" : "Link kopieren"}
          </Button>
          <Popconfirm title="Link widerrufen?" description="Wer ihn hat, sieht den Plan danach nicht mehr." okText="Widerrufen" cancelText="Abbrechen"
            onConfirm={() => widerrufe(f)}>
            <Button loading={laeuft === f.id}>Widerrufen</Button>
          </Popconfirm>
        </div>
      ) : null}
      {manuell?.id === f.id ? <Input ref={manuellFeld} data-manuell="" readOnly value={manuell.url} aria-label="Link zum Kopieren" /> : null}
    </li>
  );

  return (
    <div className="kp-formular kp-teilen">
      {organisation ? <Organisation planId={planId} {...organisation} /> : null}
      <fieldset className="kp-abschnitt">
        <legend>Neuen Link ausstellen</legend>
        <p className="kp-hilfe">Wer den Link hat, sieht den aktuellen Stand dieses Plans ohne Anmeldung und kann ihn drucken — nicht bearbeiten.</p>
        <span className="kp-feldname" id="kp-teilen-dauer">Gültig für</span>
        {/* Einfache Radios statt Knopfgruppe (Review Phase 5): die gewählte Dauer stand dunkel in Suite-Rot auf Schwarz
            (≈ 2,5:1), und am Telefon zerriss die verbundene Gruppe in zwei Zeilen. Das Raster (`.kp-dauer`) bricht 4 → 2 × 2. */}
        <Radio.Group className="kp-dauer" aria-labelledby="kp-teilen-dauer" value={dauer} onChange={(e) => setDauer(e.target.value as FreigabeDauer)}
          options={FREIGABE_DAUERN.map((d) => ({ value: d, label: DAUER_NAME[d], className: "kp-dauer-wahl" }))} />
        <label className="kp-feldname" htmlFor="kp-teilen-notiz">Notiz (wofür, für wen)</label>
        <Input id="kp-teilen-notiz" autoFocus={basis !== null} value={notiz} maxLength={FREIGABE_GRENZE.notiz} showCount onChange={(e) => setNotiz(e.target.value)}
          onPressEnter={() => { if (basis) void ausstellen(); }} />
        {basis ? null : <p className="kp-hilfe" data-keine-adresse="">{KEINE_ADRESSE}</p>}
        <Button type="primary" onClick={() => void ausstellen()} loading={laeuft === "neu"} disabled={!basis}>Link ausstellen</Button>
      </fieldset>
      <p className="kp-teilen-meldung" role="status">{meldung ?? ""}</p>
      <fieldset className="kp-abschnitt" ref={gueltigeListe} data-gueltige="">
        <legend tabIndex={-1}>{`Gültige Links (${gueltig.length})`}</legend>
        {gueltig.length === 0 ? <p className="kp-hilfe">Noch kein gültiger Link.</p> : <ul className="kp-freigaben">{gueltig.map(eintrag)}</ul>}
      </fieldset>
      {vorbei.length > 0 ? (
        <details className="kp-abschnitt">
          <summary>{`Abgelaufen und widerrufen (${vorbei.length})`}</summary>
          <ul className="kp-freigaben">{vorbei.map(eintrag)}</ul>
        </details>
      ) : null}
      {qr ? (
        <fieldset className="kp-abschnitt">
          <legend>Ausdruck</legend>
          <label className="kp-schalter"><Switch data-option="qrAufDruck" checked={qr.an} onChange={(v) => qr.onAendern(v)} /> QR-Code „Aktuelle Fassung“ auf dem Ausdruck</label>
          {qr.an ? <p className="kp-hilfe" data-qr-ziel-satz="">{qrBester ? qrZielSatz(qrBester) : "Ohne gültigen Link druckt der Plan keinen QR-Code."}</p> : null}
        </fieldset>
      ) : null}
    </div>
  );
}
