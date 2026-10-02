"use client";

import { useEffect, useRef, useState } from "react";
import { AutoComplete, Button, Popconfirm } from "antd";
import { entferneMitgliedAction, ladeEinAction, suchePersonenAction, teileInOrganisationAction } from "../../_actions/teilen";
import { NETZFEHLER } from "../../_lib/ergebnis";
import type { Mitglied, PersonVorschlag, TeilenErgebnis } from "../../_lib/mitglieder";
import type { Sichtbarkeit } from "../../_lib/rechte";

export interface OrganisationProps {
  planId: string; sichtbarkeit: Sichtbarkeit; mitglieder: Mitglied[];
  onSichtbarkeit: (s: Sichtbarkeit) => void; onMitglieder: (m: Mitglied[]) => void;
}
/** Wie `_lib/mitglieder.ts` (`SUCHE_MIN_ZEICHEN`); hier noch einmal, weil die Datei die Datenbank liest. */
const MIN_ZEICHEN = 2;

/**
 * SICHTBARKEIT UND EINLADUNGEN im Flyin „Teilen" (`_lib/rechte.ts`, `_lib/mitglieder.ts`). Steht nur bei dem, der den
 * Plan verwaltet — dieselbe Prüfung macht jede Action. Privat: ein Knopf „In der Organisation teilen" mit Rückfrage
 * (eine Einbahnstraße). Geteilt: die Eingeladenen mit „Entfernen" und die Suche zum Einladen. Jede Action gibt die
 * ganze Liste zurück; hier wird nichts selbst gezählt.
 */
export function Organisation({ planId, sichtbarkeit, mitglieder, onSichtbarkeit, onMitglieder }: OrganisationProps) {
  const [laeuft, setLaeuft] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [begriff, setBegriff] = useState("");
  const [vorschlaege, setVorschlaege] = useState<PersonVorschlag[]>([]);
  /** Nur die Antwort auf die NEUESTE Suche zählt — eine langsame ältere überschriebe sonst die Treffer. */
  const suche = useRef(0);
  useEffect(() => {
    const nr = ++suche.current;
    if (begriff.trim().length < MIN_ZEICHEN) return;
    const t = setTimeout(() => {
      void suchePersonenAction(planId, begriff).then((v) => { if (nr === suche.current) setVorschlaege(v); }).catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [begriff, planId]);

  async function lauf(schluessel: string, tu: () => Promise<TeilenErgebnis>, erfolg: string) {
    if (laeuft !== null) return false;
    setLaeuft(schluessel); setMeldung(null);
    const r = await tu().catch((): TeilenErgebnis => ({ ok: false, fehler: NETZFEHLER }));
    setLaeuft(null);
    if (!r.ok) { setMeldung(r.fehler); return false; }
    onMitglieder(r.mitglieder);
    setMeldung(erfolg);
    return true;
  }
  const teilen = async () => { if (await lauf("teilen", () => teileInOrganisationAction(planId), "Geteilt. Alle mit Zugang sehen den Plan jetzt.")) onSichtbarkeit("organisation"); };
  const einladen = async (v: PersonVorschlag) => {
    if (await lauf("einladen", () => ladeEinAction({ planId, nutzer: v.nutzer }), `${v.name} darf den Plan jetzt bearbeiten.`)) { setBegriff(""); setVorschlaege([]); }
  };

  if (sichtbarkeit === "privat") {
    return (
      <fieldset className="kp-abschnitt" data-sichtbarkeit="privat">
        <legend>Sichtbarkeit</legend>
        <p className="kp-hilfe">Privat — nur du siehst und bearbeitest diesen Plan. Ein Link unten zeigt ihn trotzdem jedem, der ihn hat.</p>
        <Popconfirm title="In der Organisation teilen?" description="Alle mit Zugang zu den Kommunikationsplänen sehen ihn dann. Privat machen lässt er sich danach nicht mehr."
          okText="Teilen" cancelText="Abbrechen" onConfirm={() => void teilen()}>
          <Button loading={laeuft === "teilen"}>In der Organisation teilen</Button>
        </Popconfirm>
        <p className="kp-teilen-meldung" role="status">{meldung ?? ""}</p>
      </fieldset>
    );
  }
  const optionen = begriff.trim().length < MIN_ZEICHEN ? [] : vorschlaege.map((v) => ({
    value: v.nutzer, label: <span data-vorschlag={v.nutzer}>{v.name}{v.email ? <span className="kp-hilfe">{` · ${v.email}`}</span> : null}</span>,
  }));
  return (
    <fieldset className="kp-abschnitt" data-sichtbarkeit="organisation">
      <legend>Sichtbarkeit</legend>
      <p className="kp-hilfe">In der Organisation geteilt — alle mit Zugang sehen und drucken ihn. Bearbeiten dürfen du, die Modul-Admins und wen du hier einlädst.</p>
      <span className="kp-feldname" id={`kp-einladen-${planId}`}>Zum Bearbeiten einladen</span>
      <AutoComplete aria-labelledby={`kp-einladen-${planId}`} value={begriff} options={optionen} placeholder="Name eintippen"
        onSearch={(q) => { setBegriff(q); if (q.trim().length < MIN_ZEICHEN) setVorschlaege([]); }}
        onSelect={(nutzer: string) => { const v = vorschlaege.find((x) => x.nutzer === nutzer); if (v) void einladen(v); }}
        notFoundContent={begriff.trim().length >= MIN_ZEICHEN ? "Niemand gefunden. Wer eingeladen werden soll, muss die Kommunikationspläne einmal geöffnet haben." : null} />
      <p className="kp-teilen-meldung" role="status">{meldung ?? ""}</p>
      {mitglieder.length === 0 ? <p className="kp-hilfe">Noch niemand eingeladen.</p> : (
        <ul className="kp-freigaben" data-mitglieder="">
          {mitglieder.map((m) => (
            <li key={m.nutzer} className="kp-freigabe" data-mitglied={m.nutzer}>
              <p className="kp-freigabe-notiz">{m.name}</p>
              <Popconfirm title={`${m.name} entfernen?`} description="Sehen kann sie oder er den Plan weiter, bearbeiten nicht mehr." okText="Entfernen" cancelText="Abbrechen"
                onConfirm={() => void lauf(m.nutzer, () => entferneMitgliedAction({ planId, nutzer: m.nutzer }), `${m.name} darf den Plan nicht mehr bearbeiten.`)}>
                <Button loading={laeuft === m.nutzer}>Entfernen</Button>
              </Popconfirm>
            </li>
          ))}
        </ul>
      )}
    </fieldset>
  );
}
