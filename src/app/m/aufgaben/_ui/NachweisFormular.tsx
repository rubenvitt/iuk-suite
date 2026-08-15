"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Button, Input } from "antd";
import type { NachweisArt } from "../_db/schema";
import { FORM_START, feldFehler, type FormState } from "../_lib/formState";
import { SPACE } from "@/core/theme/tokens";

/**
 * DAS UPLOAD-FORMULAR (Aufgabe 19, Fix-Runde 1, Spec §5.3, §9.7) — Client-Insel, TEXT UND/ODER
 * BILD, nach der UNTERGRENZEN-REGEL: `nachweisArt === "bild"` verlangt eine Datei und erlaubt
 * zusaetzlich Text, `"text"` umgekehrt. Beide Felder stehen deshalb IMMER da, unabhaengig von
 * `nachweisArt` — nur die Beschriftung sagt, welches Feld hier Pflicht ist. Die tatsaechliche
 * Pruefung liegt serverseitig in `a/[id]/nachweis/hochladen/route.ts`; ein Sternchen im Label ist
 * Affordanz, keine Zusicherung.
 *
 * SEIT FIX-RUNDE 1 KEIN `useActionState` MEHR: der Upload wanderte von einer Server Action auf
 * einen Route Handler (`route.ts`s Kopfkommentar begruendet das Warum). Diese Komponente ruft ihn
 * per `fetch` auf natives `onSubmit` — die `aufgabeId` steht dabei NUR NOCH IN DER URL
 * (`/a/<id>/nachweis/hochladen`), nicht mehr zusaetzlich als verstecktes Formularfeld: zwei
 * Quellen fuer dieselbe Angabe waeren genau die „zweite Fassung", die dieses Modul vermeidet.
 *
 * DER SILENT-SUCCESS-RIEGEL (dieselbe Form wie `files/_ui/UploadInsel.tsx`): verliert die Sitzung
 * MITTEN im Absenden, antwortet der Proxy (`src/proxy.ts`) mit einem Redirect auf `/login`, `fetch`
 * FOLGT ihm (Vorgabe `redirect: "follow"`), und was ankommt, ist HTML der Anmeldeseite — HTTP 200,
 * `ok === true`. Ohne die Pruefung auf `antwort.redirected` meldete dieses Formular Erfolg, obwohl
 * nichts gespeichert wurde.
 *
 * `router.refresh()` NACH ERFOLG, NICHT AUTOMATISCH: `revalidatePath` in einem Route Handler
 * markiert einen Pfad nur fuer die NAECHSTE Anfrage (anders als in einer Server Function, die die
 * aktuell offene Seite automatisch nachzieht) — ohne den expliziten `router.refresh()`-Aufruf
 * bliebe die Seite auf dem Stand vor dem Upload stehen, bis irgendeine andere Navigation sie neu
 * laedt.
 *
 * DIE TEXTFRAGE IST KONTROLLIERT (`useState`, nicht `defaultValue`): ein serverseitig
 * zurueckgegebener `values.text` wuerde ein reines `defaultValue`-Attribut nach dem ersten Rendern
 * NICHT mehr in den lebenden Feldwert schreiben (dieselbe Falle, die `files/_ui/UploadInsel.tsx`s
 * Kopfkommentar zu ihren vier Textfeldern beschreibt) — bei einem `<form action={...}>` erledigte
 * das bislang React selbst (Formular-Reset nach jedem Aufruf), bei `onSubmit`+`fetch` nicht mehr.
 *
 * DIE DATEIAUSWAHL GEHT WEITERHIN NACH JEDEM ABSENDEN VERLOREN (Brief, unveraendert seit der
 * ersten Fassung): `form.reset()` laeuft nach JEDEM Absendeversuch — Erfolg, Feldfehler UND
 * harter Fehler gleichermassen, dieselbe Zusage wie zuvor. Der Hinweistext unter dem Feld steht
 * deshalb weiterhin STAENDIG da, nicht nur nach einem Fehler.
 *
 * KEIN antd-`Form`, KEIN `@ant-design/icons` (Modulweite Vorgabe, `docs/design/README.md` Fallen 1
 * und 7). `Input.TextArea` ist ein Compound-Zugriff und in einer Server Component verboten — hier,
 * in der Client-Insel, ist er zulaessig (Spec §9.7).
 *
 * `maxBytes` KOMMT ALS PROP AUS DER SEITE (`NACHWEIS_MAX_BYTES`, `_lib/ablage.ts`), NICHT ALS
 * DIREKTER IMPORT HIER: `ablage.ts` importiert `node:fs/promises` auf Modulebene, ein Import
 * dieser Datei in einer Client-Insel buendelte das in den Browser (dieselbe Falle wie
 * `_lib/scan.ts`s Kopfkommentar zu `_db/client`, nur mit einem statischen statt einem dynamischen
 * Import). Vorbild: `files/_ui/UploadInsel.tsx`s `maxDateiBytes`-Prop.
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
  const router = useRouter();
  const formularRef = useRef<HTMLFormElement>(null);
  const [text, setText] = useState("");
  const [zustand, setZustand] = useState<FormState>(FORM_START);
  const [harterFehler, setHarterFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  const textFehler = feldFehler(zustand, "text");
  const dateiFehler = feldFehler(zustand, "datei");

  async function absenden(ereignis: FormEvent<HTMLFormElement>): Promise<void> {
    ereignis.preventDefault();
    const formular = ereignis.currentTarget;
    const formData = new FormData(formular);
    setLaeuft(true);
    setHarterFehler(null);

    try {
      const antwort = await fetch(`/a/${aufgabeId}/nachweis/hochladen`, {
        method: "POST",
        body: formData,
      });

      // SILENT-SUCCESS-RIEGEL, s. Kopfkommentar — MUSS vor jeder anderen Auswertung stehen.
      if (antwort.redirected) {
        setHarterFehler(
          "Die Anmeldung ist abgelaufen. Bitte neu anmelden — der Nachweis wurde nicht gespeichert.",
        );
        formularRef.current?.reset();
        return;
      }

      const koerper: FormState | null = await antwort.json().catch(() => null);

      if (antwort.ok && koerper?.ok) {
        setZustand(FORM_START);
        setText("");
        formularRef.current?.reset();
        router.refresh();
        return;
      }

      if (koerper && koerper.ok === false) {
        setZustand(koerper);
        formularRef.current?.reset();
        return;
      }

      // KEIN FELDFEHLER-KOERPER: Zugriffsablehnung (404, `route.ts`s `keinZugriff()`) oder ein
      // unerwarteter Statuscode — sollte ueber die Oberflaeche nicht erreichbar sein
      // (`optionen.nachweisHochladen` blendet den Knopf sonst schon aus), aber LAUT statt STILL,
      // falls doch: kein kommentarloses Verschwinden der Anfrage.
      setHarterFehler(`Der Nachweis konnte nicht gespeichert werden (HTTP ${antwort.status}).`);
      formularRef.current?.reset();
    } catch {
      setHarterFehler("Die Verbindung ist abgebrochen. Bitte erneut versuchen.");
      formularRef.current?.reset();
    } finally {
      setLaeuft(false);
    }
  }

  return (
    <form
      ref={formularRef}
      onSubmit={(ereignis) => void absenden(ereignis)}
      style={{ display: "flex", flexDirection: "column", gap: SPACE.sm, maxWidth: 480 }}
    >
      <div>
        <label htmlFor="nf-text" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Nachweistext {nachweisArt === "text" ? "" : "(optional)"}
        </label>
        <Input.TextArea
          id="nf-text"
          name="text"
          autoSize={{ minRows: 2, maxRows: 6 }}
          value={text}
          onChange={(ereignis) => setText(ereignis.target.value)}
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

      {harterFehler ? (
        <p role="alert" style={{ margin: 0 }}>
          {harterFehler}
        </p>
      ) : null}

      <Button
        type="primary"
        htmlType="submit"
        loading={laeuft}
        disabled={laeuft}
        style={{ alignSelf: "flex-start" }}
      >
        Nachweis speichern
      </Button>
    </form>
  );
}
