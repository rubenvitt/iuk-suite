"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent } from "react";
import { Button, Input } from "antd";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { fertigMeldenAction } from "../actions";
import type { NachweisArt } from "../_db/schema";
import { alsMegabyte } from "../_lib/anzeige";
import { FORM_START, feldFehler, type FormState } from "../_lib/formState";
import { SPACE } from "@/core/theme/tokens";

/**
 * „FERTIG MELDEN" MIT NACHWEIS — EIN FORMULAR, EIN KNOPF (IDA-386). Bis dahin standen zwei
 * Formulare untereinander: „Nachweis speichern" (Text + Bild, Route) und „Fertig melden" (noch ein
 * Textfeld, Server Action). Jetzt: Foto (falls `bildMoeglich`), optionaler Text, „Fertig melden".
 * Der Knopf laedt ein gewaehltes Foto ueber die Route hoch und ruft danach `fertigMeldenAction`;
 * die Action wartet auf die Pruefung des Bildes (`_lib/scan.ts`, `pruefeBildVorFertigmeldung`).
 * Nur `sauber` erfuellt die Pflicht — das entscheidet weiter der Server, nicht diese Insel.
 * Upload ueber den Route Handler (`route.ts` begruendet es); die `aufgabeId` steht dort NUR IN DER URL.
 *
 * DER SILENT-SUCCESS-RIEGEL (Vorbild `files/_ui/UploadInsel.tsx`): verliert die Sitzung mitten im
 * Absenden, folgt `fetch` dem Redirect auf `/login` und meldet HTTP 200 — ohne die Pruefung auf
 * `antwort.redirected` saehe das wie Erfolg aus.
 *
 * IDA-358 — DER TEXT LIEGT AUF DEM GERAET, die Sendung bis zur Antwort (`core/entwurf`). Kommt keine
 * Antwort (Netz weg, 502), wirft `senden`, und `useEntwurf` versucht es erneut; die Sendungs-ID wird
 * die ID des Nachweises (`route.ts`), eine Wiederholung legt keinen zweiten an. Das gewaehlte Foto
 * haelt `datei` (Ref) nur fuer die Versuche derselben Seite.
 *
 * EIN HOCHGELADENES FOTO WIRD NICHT NOCH EINMAL VERLANGT: lehnt die Action danach ab („wird
 * geprueft", „Pruefung gerade nicht moeglich"), sind Foto und Text schon gespeichert — das Formular
 * leert sich, und der naechste Druck auf „Fertig melden" prueft dasselbe Bild erneut.
 *
 * `maxBytes` KOMMT ALS PROP (`_lib/ablage.ts` hat `node:fs` und gehoert nicht ins Client-Bundle);
 * hier nur fuer eine fruehe Meldung, die Grenze zieht die Route.
 */
export interface NachweisFormularProps {
  aufgabeId: string;
  nachweisArt: NachweisArt;
  nachweisPflicht: boolean;
  /** `optionen.nachweisHochladen` — ohne das Recht (oder ohne Pflicht) gibt es kein Fotofeld. */
  bildMoeglich: boolean;
  maxBytes: number;
  /** Ob „Fertig melden" der Primaerknopf ist (§7 Nr. 2, gesetzt von `AktionsZone`). */
  primaer?: boolean;
}

/** Was `senden` aus Route und Action macht — nur eine Antwort, kein Wurf (IDA-358). */
type NachweisAntwort =
  | { art: "ok" }
  | { art: "anmeldung" }
  | { art: "feld"; zustand: FormState; hochgeladen: boolean }
  | { art: "status"; status: number }
  | { art: "abgelehnt" };

type Phase = "hochladen" | "pruefen" | "melden";


/** Ein Wurf der Server Action selbst (nicht des Netzes) traegt einen `digest`. */
function istServerFehler(fehler: unknown): boolean {
  return !!fehler && typeof fehler === "object" && typeof (fehler as { digest?: unknown }).digest === "string";
}

export function NachweisFormular({
  aufgabeId,
  nachweisArt,
  nachweisPflicht,
  bildMoeglich,
  maxBytes,
  primaer = true,
}: NachweisFormularProps) {
  const router = useRouter();
  const formularRef = useRef<HTMLFormElement>(null);
  const [text, setText] = useState("");
  const [zustand, setZustand] = useState<FormState>(FORM_START);
  const [harterFehler, setHarterFehler] = useState<string | null>(null);
  const [zuGross, setZuGross] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase | null>(null);
  const datei = useRef<File | null>(null);
  const bildPflicht = nachweisPflicht && nachweisArt === "bild";

  const entwurf = useEntwurf<{ text: string }, { text: string }, NachweisAntwort>({
    schluessel: `aufgaben:nachweis:${aufgabeId}`,
    stand: { text },
    wiederherstellen: (w) => setText(w.text),
    senden: async (n, sendung) => {
      let hochgeladen = false;
      // Erst das Foto (falls gewaehlt) an die Route, dann die Fertigmeldung an die Action — ein
      // Druck, zwei Schritte; eine Wiederholung des ersten legt dank `sendung` nichts doppelt an.
      if (datei.current) {
        setPhase("hochladen");
        const formData = new FormData();
        formData.set("text", n.text);
        formData.set("datei", datei.current);
        formData.set("sendung", sendung);
        const antwort = await fetch(`/a/${aufgabeId}/nachweis/hochladen`, { method: "POST", body: formData });
        // SILENT-SUCCESS-RIEGEL, s. Kopfkommentar — MUSS vor jeder anderen Auswertung stehen.
        if (antwort.redirected) return { art: "anmeldung" };
        const koerper: FormState | null = await antwort.json().catch(() => null);
        if (koerper && koerper.ok === false) return { art: "feld", zustand: koerper, hochgeladen: false };
        if (!(antwort.ok && koerper?.ok)) {
          // 404 ist die Antwort der Route (`keinZugriff()`); alles andere ohne Koerper kam nicht an.
          if (antwort.status === 404) return { art: "status", status: 404 };
          throw new Error(`Keine Antwort der Route (HTTP ${antwort.status})`);
        }
        hochgeladen = true;
      }
      setPhase(bildPflicht ? "pruefen" : "melden");
      const formData = new FormData();
      formData.set("aufgabeId", aufgabeId);
      // Mit dem Foto ging der Text schon an die Route — ein zweiter Textnachweis waere doppelt.
      formData.set("nachweisText", hochgeladen ? "" : n.text);
      try {
        const ergebnis = await fertigMeldenAction(FORM_START, formData);
        return ergebnis.ok ? { art: "ok" } : { art: "feld", zustand: ergebnis, hochgeladen };
      } catch (fehler) {
        // Netzfehler und eine veraltete Action gehen an `useEntwurf` (neuer Versuch, Neuladen);
        // eine Ablehnung des Servers wiederholt sich nur und wird laut.
        if (istServerFehler(fehler)) return { art: "abgelehnt" };
        throw fehler;
      }
    },
    antwort: (a) => {
      setPhase(null);
      const leeren = () => {
        datei.current = null;
        formularRef.current?.reset();
        setText("");
      };
      if (a.art === "ok") {
        leeren();
        setZustand(FORM_START);
        router.refresh();
        return true;
      }
      if (a.art === "feld") {
        setZustand(a.zustand);
        if (a.hochgeladen) {
          // Foto und Text liegen schon beim Server; der naechste Druck prueft dasselbe Bild.
          leeren();
          router.refresh();
          return true;
        }
        if (feldFehler(a.zustand, "datei")) {
          datei.current = null;
          formularRef.current?.reset();
        }
        return false;
      }
      if (a.art === "anmeldung") {
        setHarterFehler("Die Anmeldung ist abgelaufen. Bitte neu anmelden — es wurde nichts gespeichert.");
      } else if (a.art === "abgelehnt") {
        setHarterFehler("Fertig melden ging gerade nicht. Bitte die Seite neu laden.");
      } else {
        // Zugriffsablehnung (404, `route.ts`s `keinZugriff()`) — ueber die Oberflaeche nicht
        // erreichbar, aber LAUT statt STILL, falls doch.
        setHarterFehler(`Der Nachweis konnte nicht gespeichert werden (HTTP ${a.status}).`);
      }
      return false;
    },
  });
  const laeuft = entwurf.zustand === "sendet";

  const textFehler = feldFehler(zustand, "text") ?? feldFehler(zustand, "nachweisText");
  const dateiFehler = zuGross ?? feldFehler(zustand, "datei") ?? feldFehler(zustand, "nachweis");

  function absenden(ereignis: FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault();
    if (laeuft) return;
    const feld = ereignis.currentTarget.elements.namedItem("datei");
    const gewaehlt = bildMoeglich && feld instanceof HTMLInputElement ? (feld.files?.[0] ?? null) : null;
    if (gewaehlt instanceof File && gewaehlt.size > maxBytes) {
      setZuGross(`Das Foto ist zu groß (${alsMegabyte(gewaehlt.size)}), erlaubt sind höchstens ${alsMegabyte(maxBytes)}.`);
      return;
    }
    datei.current = gewaehlt instanceof File && gewaehlt.size > 0 ? gewaehlt : datei.current;
    setZuGross(null);
    setHarterFehler(null);
    setZustand(FORM_START);
    entwurf.sende({ text });
  }

  return (
    <form
      ref={formularRef}
      onSubmit={absenden}
      style={{ display: "flex", flexDirection: "column", gap: SPACE.sm, maxWidth: 480, minWidth: 0 }}
    >
      {bildMoeglich ? (
        <div>
          <label htmlFor="nf-datei" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
            Foto{bildPflicht ? "" : " (optional)"}
          </label>
          {/*
           * `accept` IST REINE AFFORDANZ, KEINE PRUEFUNG — die Allowlist liegt serverseitig in
           * `_lib/ablage.ts` (Magic Bytes), diese Datei darf sie nicht importieren (Kopfkommentar).
           */}
          <input
            id="nf-datei"
            type="file"
            name="datei"
            accept="image/jpeg,image/png,image/gif,image/webp,image/heic,image/heif"
            onChange={() => setZuGross(null)}
            style={{ maxWidth: "100%" }}
            aria-invalid={dateiFehler ? true : undefined}
            aria-describedby={dateiFehler ? "nf-datei-err" : undefined}
          />
          {dateiFehler ? (
            <p id="nf-datei-err" style={{ margin: `${SPACE.xs}px 0 0` }}>
              {dateiFehler}
            </p>
          ) : null}
        </div>
      ) : null}

      <div>
        <label htmlFor="nf-text" style={{ display: "block", marginBlockEnd: SPACE.xs }}>
          Nachweistext{nachweisPflicht && nachweisArt === "text" ? "" : " (optional)"}
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

      {!bildMoeglich && dateiFehler ? <p style={{ margin: 0 }}>{dateiFehler}</p> : null}

      <EntwurfHinweis entwurf={entwurf} />
      {harterFehler ? (
        <p role="alert" style={{ margin: 0 }}>
          {harterFehler}
        </p>
      ) : null}

      <Button
        type={primaer ? "primary" : undefined}
        htmlType="submit"
        loading={laeuft}
        disabled={laeuft}
        style={{ alignSelf: "flex-start" }}
      >
        Fertig melden
      </Button>
      {laeuft && phase !== null ? (
        <p role="status" style={{ margin: 0 }}>
          {phase === "hochladen" ? "Foto wird hochgeladen…" : phase === "pruefen" ? "Bild wird geprüft…" : "Wird gemeldet…"}
        </p>
      ) : null}
    </form>
  );
}
