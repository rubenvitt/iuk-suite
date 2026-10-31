"use client";

import { useState, useTransition } from "react";
import { Button, Card, Checkbox, Popconfirm, Switch } from "antd";

import {
  beendeFaelligkeitenAboAction,
  richteFaelligkeitenAboEinAction,
  sendeFaelligkeitenProbeAction,
  speichereFaelligkeitenAuswahlAction,
  wechsleFaelligkeitenThemaAction,
  type ProbeErgebnis,
} from "@/app/m/portal/actions";
import type { AuswahlModul } from "@/app/m/portal/_lib/faelligkeiten/auswahl";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

/*
 * DAS EIGENE ABO FÜR „WAS STEHT AN" (IDA-297) — Einrichten, Auswahl, Probe, neues Thema, beenden.
 *
 * Die Actions werden direkt importiert, nicht als Prop gereicht (Falle 9). Rückmeldungen stehen als
 * Satz neben dem Knopf — kein `Alert type="error"` und kein `danger`-Knopf, beide sähen aus wie eine
 * Primäraktion (Falle 3). Die Auswahl speichert bei jeder Änderung; ein „Speichern"-Knopf, den man
 * vergisst, hieße montags die falsche Mitteilung.
 */

const KARTE = { maxInlineSize: 720 } as const;
const ABSATZ = { ...SCHRIFT.text, marginBlock: `0 ${SPACE.md}px` } as const;

function Meldung({ ergebnis }: { ergebnis: ProbeErgebnis | null }) {
  if (!ergebnis) return null;
  return (
    <span role="status" style={{ ...SCHRIFT.text, fontWeight: ergebnis.ok ? 400 : 600 }}>
      {ergebnis.text}
    </span>
  );
}

export function FaelligkeitenEinrichten() {
  const [laeuft, starte] = useTransition();
  const [fehler, setFehler] = useState<ProbeErgebnis | null>(null);
  return (
    <Card title="Mitteilungen einrichten" style={KARTE} data-testid="faellig-einrichten">
      <p style={ABSATZ}>
        Du bekommst ein eigenes Thema, das nur für dich ist, und wählst danach aus, was darin stehen soll.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SPACE.md }}>
        <Button
          type="primary"
          loading={laeuft}
          onClick={() => starte(async () => {
            try {
              await richteFaelligkeitenAboEinAction();
            } catch {
              setFehler({ ok: false, text: "Das hat nicht geklappt. Lade die Seite neu und versuch es noch einmal." });
            }
          })}
        >
          Einrichten
        </Button>
        <Meldung ergebnis={fehler} />
      </div>
    </Card>
  );
}

export function FaelligkeitenAuswahl({ push, abgewaehlt, module }: {
  push: boolean;
  abgewaehlt: string[];
  module: AuswahlModul[];
}) {
  const [stand, setStand] = useState({ push, abgewaehlt });
  const [meldung, setMeldung] = useState<ProbeErgebnis | null>(null);
  const [speichert, starteSpeichern] = useTransition();

  const speichere = (neu: { push: boolean; abgewaehlt: string[] }) => {
    const vorher = stand;
    setStand(neu);
    starteSpeichern(async () => {
      try {
        await speichereFaelligkeitenAuswahlAction(neu);
        setMeldung({ ok: true, text: "Gespeichert." });
      } catch {
        setStand(vorher);
        setMeldung({ ok: false, text: "Nicht gespeichert. Versuch es noch einmal." });
      }
    });
  };

  const aus = new Set(stand.abgewaehlt);
  const umschalten = (schluessel: string, an: boolean) => {
    const neu = new Set(aus);
    if (an) neu.delete(schluessel);
    else neu.add(schluessel);
    speichere({ push: stand.push, abgewaehlt: [...neu].sort() });
  };

  return (
    <Card title="Was aufs Telefon kommt" style={KARTE} data-testid="faellig-auswahl">
      <label style={{ display: "flex", alignItems: "center", gap: SPACE.md, marginBlockEnd: SPACE.lg }}>
        <Switch checked={stand.push} onChange={(an) => speichere({ ...stand, push: an })} disabled={speichert} />
        <span style={SCHRIFT.text}>Montags eine Zusammenfassung schicken</span>
      </label>
      {module.map((m) => (
        <fieldset key={m.modul} style={{ border: 0, padding: 0, margin: `0 0 ${SPACE.md}px` }} disabled={!stand.push}>
          <legend style={{ ...SCHRIFT.text, fontWeight: 600, marginBlockEnd: SPACE.xs }}>{m.titel}</legend>
          <div style={{ display: "flex", flexWrap: "wrap", gap: `${SPACE.xs}px ${SPACE.lg}px` }}>
            {m.arten.map((a) => (
              <Checkbox
                key={a.schluessel}
                checked={!aus.has(a.schluessel)}
                disabled={!stand.push || speichert}
                onChange={(e) => umschalten(a.schluessel, e.target.checked)}
              >
                {a.art}
              </Checkbox>
            ))}
          </div>
        </fieldset>
      ))}
      <div style={{ minBlockSize: 24 }}>
        <Meldung ergebnis={meldung} />
      </div>
    </Card>
  );
}

export function FaelligkeitenProbe() {
  const [ergebnis, setErgebnis] = useState<ProbeErgebnis | null>(null);
  const [laeuft, starte] = useTransition();
  return (
    <Card title="Probe" style={KARTE}>
      <p style={ABSATZ}>
        Schickt die Zusammenfassung sofort an dein Thema, so wie sie am Montag käme. Der Montag bleibt davon unberührt.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SPACE.md }}>
        <Button
          loading={laeuft}
          data-testid="faellig-probe"
          onClick={() => starte(async () => {
            try {
              setErgebnis(await sendeFaelligkeitenProbeAction());
            } catch {
              setErgebnis({ ok: false, text: "Senden hat nicht geklappt. Lade die Seite neu und versuch es noch einmal." });
            }
          })}
        >
          Probe senden
        </Button>
        <Meldung ergebnis={ergebnis} />
      </div>
    </Card>
  );
}

export function FaelligkeitenAboVerwalten() {
  const [laeuft, starte] = useTransition();
  const [fehler, setFehler] = useState<ProbeErgebnis | null>(null);
  const ausfuehren = (aktion: () => Promise<void>) => starte(async () => {
    try {
      await aktion();
      setFehler(null);
    } catch {
      setFehler({ ok: false, text: "Das hat nicht geklappt. Lade die Seite neu und versuch es noch einmal." });
    }
  });
  return (
    <Card title="Thema ändern oder beenden" style={KARTE}>
      <p style={ABSATZ}>
        Ein neues Thema brauchst du, wenn jemand anderes deins kennt oder ein altes Telefon es noch abonniert
        hat. Das bisherige Abo bekommt danach nichts mehr, und du abonnierst das neue wie oben beschrieben.
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: SPACE.md }}>
        <Popconfirm
          title="Neues Thema anlegen?"
          description="Das bisherige Abo auf deinen Telefonen bekommt danach nichts mehr."
          okText="Neues Thema"
          cancelText="Abbrechen"
          onConfirm={() => ausfuehren(wechsleFaelligkeitenThemaAction)}
        >
          <Button loading={laeuft}>Neues Thema</Button>
        </Popconfirm>
        <Popconfirm
          title="Mitteilungen beenden?"
          description="Dein Thema wird gelöscht. Einrichten kannst du es jederzeit neu."
          okText="Beenden"
          cancelText="Abbrechen"
          onConfirm={() => ausfuehren(beendeFaelligkeitenAboAction)}
        >
          <Button loading={laeuft}>Mitteilungen beenden</Button>
        </Popconfirm>
        <Meldung ergebnis={fehler} />
      </div>
    </Card>
  );
}
