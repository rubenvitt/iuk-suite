"use client";

import { useActionState } from "react";
import { Button, Input } from "antd";
import { nachweisHochladenAction } from "../actions";
import type { NachweisArt } from "../_db/schema";
import { FORM_START, feldFehler, feldWert } from "../_lib/formState";
import { SPACE } from "@/core/theme/tokens";

/**
 * DAS UPLOAD-FORMULAR (Aufgabe 19, Spec §5.3, §9.7) — Client-Insel, TEXT UND/ODER BILD, nach der
 * UNTERGRENZEN-REGEL: `nachweisArt === "bild"` verlangt eine Datei und erlaubt zusaetzlich Text,
 * `"text"` umgekehrt. Beide Felder stehen deshalb IMMER da, unabhaengig von `nachweisArt` — nur die
 * Beschriftung sagt, welches Feld hier Pflicht ist. Die tatsaechliche Pruefung liegt serverseitig in
 * `nachweisHochladenAction` (`actions.ts`); ein Sternchen im Label ist Affordanz, keine Zusicherung.
 *
 * EIGENSTAENDIG VON „FERTIG MELDEN": diese Komponente legt einen Nachweis an, waehrend die Aufgabe
 * `in_arbeit` bleibt — sie meldet nichts fertig. `_ui/AktionsZone.tsx` rendert sie NEBEN
 * `FertigMeldenFormular`, gesteuert ueber `optionen.nachweisHochladen` (`_lib/aktionsOptionen.ts`).
 *
 * DIE DATEIAUSWAHL GEHT NACH JEDEM ABSENDEN VERLOREN (Brief, `_lib/formState.ts`s Kopfkommentar:
 * „`values` traegt jedes gesendete Feld zurueck" — bei einem Dateifeld geht das strukturell nicht).
 * React setzt ein `<form action={...}>` nach jedem Aufruf zurueck, Erfolg UND Feldfehler
 * gleichermassen — bei einem `<input type="file">` gibt es dafuer KEINEN Code-Weg zurueck (der
 * Browser gibt eine Dateiauswahl nicht programmatisch her). Der Hinweistext unter dem Feld steht
 * deshalb STAENDIG da, nicht nur nach einem Fehler: ein Foto, das gerade erst gemacht wurde, soll
 * niemand fuer „noch ausgewaehlt" halten, nur weil das Formular vorher einmal ohne Fehler durchging.
 *
 * KEIN antd-`Form`, KEIN `@ant-design/icons` (Modulweite Vorgabe, `docs/design/README.md` Fallen 1
 * und 7). `Input.TextArea` ist ein Compound-Zugriff und in einer Server Component verboten — hier,
 * in der Client-Insel, ist er zulaessig (Spec §9.7).
 *
 * `maxBytes` KOMMT ALS PROP AUS DER SEITE (`NACHWEIS_MAX_BYTES`, `_lib/ablage.ts`), NICHT ALS
 * DIREKTER IMPORT HIER: `ablage.ts` importiert `node:fs/promises` auf Modulebene, ein Import dieser
 * Datei in einer Client-Insel buendelte das in den Browser (dieselbe Falle wie `_lib/scan.ts`s
 * Kopfkommentar zu `_db/client`, nur mit einem statischen statt einem dynamischen Import). Vorbild:
 * `files/_ui/UploadInsel.tsx`s `maxDateiBytes`-Prop.
 */
export interface NachweisFormularProps {
  aufgabeId: string;
  nachweisArt: NachweisArt;
  maxBytes: number;
}

function alsMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

export function NachweisFormular({ aufgabeId, nachweisArt, maxBytes }: NachweisFormularProps) {
  const [state, formAction, isPending] = useActionState(nachweisHochladenAction, FORM_START);
  const textFehler = feldFehler(state, "text");
  const dateiFehler = feldFehler(state, "datei");

  return (
    <form
      action={formAction}
      style={{ display: "flex", flexDirection: "column", gap: SPACE.sm, maxWidth: 480 }}
    >
      <input type="hidden" name="aufgabeId" value={aufgabeId} />

      <div>
        <label htmlFor="nf-text" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Nachweistext {nachweisArt === "text" ? "" : "(optional)"}
        </label>
        <Input.TextArea
          id="nf-text"
          name="text"
          autoSize={{ minRows: 2, maxRows: 6 }}
          defaultValue={feldWert(state, "text", "")}
          status={textFehler ? "error" : undefined}
          aria-invalid={textFehler ? true : undefined}
          aria-describedby={textFehler ? "nf-text-err" : undefined}
        />
        {textFehler ? (
          <p id="nf-text-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {textFehler}
          </p>
        ) : null}
      </div>

      <div>
        <label htmlFor="nf-datei" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Bild {nachweisArt === "bild" ? "" : "(optional)"}
        </label>
        {/*
         * `accept` IST REINE AFFORDANZ, KEINE PRUEFUNG (dieselbe Haltung wie `RangKnoepfe.tsx`s
         * deaktivierte Knoepfe) — die massgebliche Allowlist liegt serverseitig in `_lib/ablage.ts`
         * (Magic-Byte-Pruefung), diese Datei darf sie NICHT importieren (s. Kopfkommentar). Eine
         * hier hartcodierte Kopie ist deshalb bewusst hingenommen, nicht die zweite Fassung einer
         * Sicherheitsbedingung.
         */}
        <input
          id="nf-datei"
          type="file"
          name="datei"
          accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
          aria-invalid={dateiFehler ? true : undefined}
          aria-describedby={dateiFehler ? "nf-datei-err" : "nf-datei-hinweis"}
        />
        <p id="nf-datei-hinweis" style={{ margin: `${SPACE.xs}px 0 0`, fontSize: 12 }}>
          Höchstens {alsMiB(maxBytes)}. Nach dem Absenden muss die Datei bei einem erneuten Versuch
          erneut ausgewählt werden — die Auswahl bleibt nicht erhalten.
        </p>
        {dateiFehler ? (
          <p id="nf-datei-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
            {dateiFehler}
          </p>
        ) : null}
      </div>

      <Button
        type="primary"
        htmlType="submit"
        loading={isPending}
        disabled={isPending}
        style={{ alignSelf: "flex-start" }}
      >
        Nachweis speichern
      </Button>
    </form>
  );
}
