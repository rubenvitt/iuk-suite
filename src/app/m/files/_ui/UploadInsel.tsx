"use client";

import Link from "next/link";
import { useActionState, useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Card, Input, Progress } from "antd";

import { anlegenAction, type AnlegenErgebnis } from "../(verwaltung)/actions";
import { FILES_CHUNK_BYTES } from "../_lib/grenzen";
import { MIME_ALLOWLIST } from "../_lib/mime";
import css from "./uploadInsel.module.css";

/**
 * DIE UPLOAD-INSEL VON `/shares/neu` (Spec §7.1, §7.2; Plan T35).
 *
 * DIE ZUSAGE: eine Datei ueber 10 MiB kommt VOLLSTAENDIG an. Sie kommt nicht in
 * einer Anfrage, sondern in Ausschnitten von `FILES_CHUNK_BYTES` (4 MiB) —
 * und das ist keine Zutat, sondern die Folge einer gemessenen Zahl. Es gibt
 * DREI Kappungsebenen mit drei verschiedenen Symptomen (§9.2):
 *
 * 1. **Server Actions, 1 MB** — HTTP 413, laut. Deshalb geht durch
 *    `anlegenAction` ausschliesslich TEXT: Titel, Ablauf, Passwort und die
 *    NAMEN der Dateien. Das `<input type="file">` traegt bewusst KEIN `name`;
 *    mit einem waeren die Bytes Teil der Action-Nutzlast.
 * 2. **Next-Proxy, 10 MiB** — STILL. `cloneBodyStream` bricht ab, schiebt
 *    `null` in beide Streams und gibt nur ein `console.warn` aus
 *    (`server/body-streams.js:85-101`). Kein Fehler beim Client, kein
 *    Statuscode, nichts: die Datei ist einfach kuerzer. Genau diese Ebene
 *    umgeht der Chunk-Weg — und wer sie umgeht, misst sie nie. Deshalb hat
 *    `e2e/files-fileshare.spec.ts` neben dem Chunk-Weg die Gegenprobe mit
 *    EINEM `PUT`.
 * 3. **Cloudflare Free, 100 MB** — Fehler vom Edge, ohne Container-Log.
 *
 * WARUM DAS EINE CLIENT-INSEL IST (§7.2): `useActionState` (der Feldfehler muss
 * ohne Seitenwechsel ans Feld), der Fortschritt je Datei und die
 * Byte-Schleife selbst. Die Seite darueber bleibt eine Server Component; sie
 * importiert von hier NUR diese Komponente. Eine Konstante von hier — die
 * Chunk-Groesse ist der naheliegende Kandidat — kaeme dort als Client-Referenz
 * an, HTTP 500 fuer die ganze Seite, und das findet weder `pnpm build` noch ein
 * Vitest (`docs/design/README.md:87-103`). Die Zahlen kommen deshalb als
 * einfache Props aus der Seite, und `FILES_CHUNK_BYTES` kommt aus
 * `_lib/grenzen.ts` — einem Modul OHNE `"use client"`.
 *
 * `grenzen()` wird hier NICHT gerufen: die Funktion liest `process.env`, und
 * die ist im Browser leer — der Aufruf wuerfe `GrenzenUngueltig` beim ersten
 * Rendern.
 */

/** Die Zustaende eines Datei-Eintrags. Jeder traegt einen eigenen naechsten Schritt. */
type EintragZustand = "wartet" | "laeuft" | "fertig" | "fehler";

interface Eintrag {
  readonly fileId: string;
  readonly name: string;
  readonly groesseBytes: number;
  /** KUMULIERT ueber alle Chunks — nicht die Groesse des letzten Ausschnitts. */
  readonly gesendetBytes: number;
  readonly zustand: EintragZustand;
  /** Die Meldung des Servers, wortgleich: sie traegt die Einheit (§9.1). */
  readonly meldung: string | null;
}

const ZUSTANDSTEXT: Record<EintragZustand, string> = {
  wartet: "wartet",
  laeuft: "wird übertragen",
  fertig: "vollständig übertragen",
  fehler: "fehlgeschlagen",
};

/**
 * Der Startwert von `useActionState`. `ok: false` mit LEEREM `feldFehler` heisst
 * „noch nichts abgeschickt" — es gibt damit keinen zweiten Ausdruck fuer
 * denselben Zustand und keine Meldung, die vor der ersten Eingabe steht.
 */
const START: AnlegenErgebnis = { ok: false, feldFehler: {}, werte: {} };

/**
 * `anlegenAction` nimmt nur `FormData`; `useActionState` verlangt
 * `(bisher, formData)`. Der Wrapper steht auf MODULEBENE und nicht als
 * Pfeilfunktion im Rumpf: sonst bekaeme `useActionState` bei jedem Rendern eine
 * neue Identitaet.
 */
async function anlegenSchritt(
  _bisher: AnlegenErgebnis,
  formData: FormData,
): Promise<AnlegenErgebnis> {
  return anlegenAction(formData);
}

/** `accept` aus der Allowlist abgeleitet — nie abgeschrieben (§8.5, `_lib/mime.ts`). */
const ACCEPT = [
  ...MIME_ALLOWLIST.map((e) => e.typ),
  ...MIME_ALLOWLIST.flatMap((e) => e.endungen.map((endung) => `.${endung}`)),
].join(",");

/** Nur fuer die Anzeige. Die geltende Grenze steht auf dem Server (§9.2). */
function alsMiB(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

function prozent(eintrag: Eintrag): number {
  if (eintrag.groesseBytes === 0) return 0;
  return Math.floor((eintrag.gesendetBytes / eintrag.groesseBytes) * 100);
}

/**
 * Die Antwort des Handlers als Meldung. Der Servertext gewinnt, wo es einen
 * gibt: er traegt die Grenze SAMT EINHEIT (`… hoechstens 12582912 Bytes
 * (FILES_MAX_DATEI_BYTES, Einheit: Bytes)`), und eine hier erfundene Fassung
 * verloere genau diese Angabe.
 */
function meldungFuer(status: number, koerper: { fehler?: unknown } | null): string {
  const vomServer = typeof koerper?.fehler === "string" ? koerper.fehler : null;
  if (vomServer !== null) return vomServer;
  switch (status) {
    case 400:
      return "Der Wiederaufsetzpunkt wurde nicht angenommen. Bitte erneut versuchen.";
    case 404:
      return "Diese Datei ist nicht mehr vorgemerkt. Bitte die Freigabe neu anlegen.";
    case 507:
      return "Auf dem Server ist kein Platz mehr frei. Der Upload lässt sich später fortsetzen.";
    default:
      return `Die Übertragung ist fehlgeschlagen (HTTP ${status}).`;
  }
}

async function koerperVon(antwort: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await antwort.json()) as Record<string, unknown>;
  } catch {
    // Ein Handler, der kein JSON liefert (Proxy-Fehlerseite, Timeout), darf
    // die Schleife nicht mit einem zweiten, fremden Fehler beenden.
    return null;
  }
}

/** Die vier Textfelder, deren Eingabe ein Feldfehler nicht kosten darf. */
type Werte = { title: string; description: string; expiryDays: string; maxDownloads: string };

const LEERE_WERTE: Werte = { title: "", description: "", expiryDays: "", maxDownloads: "" };

export interface UploadInselProps {
  /** `FILES_MAX_ABLAUF_TAGE` — serverseitig geprueft, hier nur `max` und Hinweis. */
  readonly maxAblaufTage: number;
  /** `FILES_MAX_DATEIEN_PRO_SHARE` — dito. */
  readonly maxDateienProShare: number;
  /** `FILES_MAX_DATEI_BYTES`, EINHEIT BYTES — nur fuer den Hinweistext. */
  readonly maxDateiBytes: number;
}

export function UploadInsel({
  maxAblaufTage,
  maxDateienProShare,
  maxDateiBytes,
}: UploadInselProps) {
  const [state, formAction, laeuftAnlegen] = useActionState(anlegenSchritt, START);
  const [auswahl, setAuswahl] = useState<File[]>([]);
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [werte, setWerte] = useState<Werte>(LEERE_WERTE);
  /** Die angelegte Freigabe — nur als Kennung am Markup, ohne Link (siehe unten). */
  const [shareId, setShareId] = useState<string | null>(null);

  /** `fileId` → die gewaehlte Datei; das Wiederholen braucht sie nach dem Rendern. */
  const dateienRef = useRef(new Map<string, File>());
  /**
   * Die abgebrochenen `fileId`s. Ein `AbortController` allein reicht NICHT: er
   * bricht die fliegende Anfrage ab, aber die Schleife rechnet den naechsten
   * Ausschnitt trotzdem aus und schickt ihn los. Diese Menge wird VOR jedem
   * Chunk gelesen.
   */
  const abgebrochenRef = useRef(new Set<string>());
  /** Die `shareId`, deren Upload bereits laeuft — gegen ein zweites Anstossen. */
  const gestartetRef = useRef<string | null>(null);
  /** Die zuletzt EINGESPIELTE Antwort — dieselbe zweimal einzuspielen wuerfe die Eingabe weg. */
  const [eingespielt, setEingespielt] = useState<AnlegenErgebnis>(START);

  /*
   * DIE VIER TEXTFELDER SIND KONTROLLIERT, UND ZWAR MIT GRUND. Ein
   * `defaultValue` aus `state.werte` sieht richtig aus und wirkt NICHT: React
   * schreibt eine geaenderte `defaultValue`-Prop nur in das ATTRIBUT, nicht in
   * den lebenden Wert des Feldes — nach einem Feldfehler stuende das Formular
   * leer da und die Eingabe waere weg (`docs/design/README.md:245-247`
   * verlangt genau das Gegenteil). Nachgemessen: das Feld blieb "" statt "99".
   *
   * WAEHREND DES RENDERNS angepasst und NICHT in einem Effekt: das ist Reacts
   * eigener Weg fuer „Zustand aus einer geaenderten Eingabe nachziehen"
   * (React verwirft den Rendervorgang sofort und rechnet neu, ohne dass der
   * Browser den Zwischenstand zeichnet). Ein Effekt waere eine Renderrunde
   * spaeter — und der Lint-Riegel `react-hooks/set-state-in-effect` weist ihn
   * ausdruecklich ab.
   *
   * Das Passwort ist bewusst NICHT dabei: `AnlegenErgebnis.werte` traegt es
   * nicht zurueck, weil es sonst im RSC-Nutzlast derselben Antwort an den
   * Browser ginge und als Attribut im Markup stuende.
   */
  if (state !== eingespielt) {
    setEingespielt(state);
    if (!state.ok) setWerte((bisher) => ({ ...bisher, ...state.werte }));
  }

  const setzeEintrag = useCallback((fileId: string, aendere: (e: Eintrag) => Eintrag) => {
    setEintraege((liste) => liste.map((e) => (e.fileId === fileId ? aendere(e) : e)));
  }, []);

  /**
   * DIE BYTE-SCHLEIFE EINER DATEI.
   *
   * `abBytes` ist ein BYTE-OFFSET und keine Chunk-Nummer (§7.1): eine Nummer
   * stimmt nur, solange jeder Chunk ausser dem letzten exakt
   * `FILES_CHUNK_BYTES` gross ist — eine unausgesprochene Invariante, die der
   * erste abweichende Client still bricht.
   */
  const ladeHoch = useCallback(
    async (fileId: string, datei: File, abBytes: number): Promise<void> => {
      setzeEintrag(fileId, (e) => ({
        ...e,
        zustand: "laeuft",
        meldung: null,
        gesendetBytes: abBytes,
      }));

      let ab = abBytes;
      for (;;) {
        // DIE WACHE VOR JEDEM CHUNK — der Abbruch faellt mitten in den Upload,
        // und ohne sie liefe der naechste Ausschnitt gegen eine Zeile, die es
        // nicht mehr gibt.
        if (abgebrochenRef.current.has(fileId)) return;

        const bis = Math.min(ab + FILES_CHUNK_BYTES, datei.size);
        // `Math.min` deckelt `bis` auf `datei.size` — der Vergleich ist damit
        // genau die Frage „ist das der letzte Ausschnitt?". Eine Datei mit
        // 0 Bytes faellt darunter: `bis` ist 0, also bekommt sie GENAU EINEN
        // Aufruf mit `?ende=1` und damit die benannte Ablehnung des Servers.
        const ende = bis >= datei.size;
        const adresse = `/api/upload/${fileId}?ab=${ab}${ende ? "&ende=1" : ""}`;

        let antwort: Response;
        try {
          antwort = await fetch(adresse, {
            method: "PUT",
            body: datei.slice(ab, bis),
            /*
             * DER LETZTE CHUNK TRAEGT `datei.type` ALS `Content-Type` (T27,
             * `DEKLARATION_KOPF`). Ohne ihn werden `.txt` und die drei
             * Office-Formate ABGELEHNT: `text/plain` hat keine Signatur, die
             * Deklaration ist dort das einzige Positivsignal (§8.5 verlangt
             * beide), und fuer ZIP-Container ist sie die Verfeinerung. Alle
             * Signaturformate (PNG/JPEG/PDF) gingen auch ohne durch — die
             * Luecke faellt also genau bei den vier Typen auf, die niemand
             * zuerst probiert.
             *
             * Leer bleibt der Kopf, wenn der Browser den Typ nicht kennt: eine
             * erfundene Deklaration waere ein zweites Signal, das niemand
             * belegt hat. `pruefeInhaltstyp` behandelt „keine Deklaration" fuer
             * Signaturformate als Abweichung, nicht als Ablehnung.
             */
            headers: ende && datei.type !== "" ? { "content-type": datei.type } : undefined,
          });
        } catch {
          setzeEintrag(fileId, (e) => ({
            ...e,
            zustand: "fehler",
            meldung: "Die Verbindung ist abgebrochen. Der Upload lässt sich fortsetzen.",
          }));
          return;
        }

        /*
         * EINE GEFOLGTE WEITERLEITUNG IST KEINE ANTWORT DIESES HANDLERS.
         * Geht die Sitzung MITTEN im Upload verloren, antwortet
         * `requireFilesAccess()` mit `redirect("/login?…")` — Next macht daraus
         * eine 307, und `fetch` folgt ihr (Vorgabe `redirect: "follow"`). Was
         * ankommt, ist die Anmeldeseite: HTTP 200, `text/html`, `ok === true`.
         * Ohne diese Zeile quittierte die Schleife jeden Chunk als uebertragen
         * und meldete am Ende „Alle Dateien sind übertragen." — ohne dass ein
         * einziges Byte angekommen waere. Es gibt keinen Statuscode, an dem das
         * auffiele; `redirected` ist das einzige Signal.
         *
         * NICHT `redirect: "manual"`: die undurchsichtige Antwort haette
         * `ok === false` und `status === 0` und liefe in „fehlgeschlagen
         * (HTTP 0)" — eine schlechtere Auskunft als der Fehler selbst.
         *
         * `ab` bleibt stehen: die bereits angekommenen Bytes liegen serverseitig
         * in der Zwischendatei, und „Wiederholen" setzt genau dort auf.
         */
        if (antwort.redirected) {
          setzeEintrag(fileId, (e) => ({
            ...e,
            zustand: "fehler",
            meldung:
              "Die Anmeldung ist abgelaufen. Bitte neu anmelden; " +
              "der Upload lässt sich danach fortsetzen.",
          }));
          return;
        }

        /*
         * 409 IST KEIN FEHLER, SONDERN EINE ANWEISUNG. `erwartetesOffsetBytes`
         * ist der Wiederaufsetzpunkt, den T27 mitgibt — wer ihn als Fehler
         * behandelt, macht aus einem fortsetzbaren Upload einen abgebrochenen.
         * Der Sprung gilt nur, wenn er WOANDERS hinzeigt; derselbe Offset waere
         * eine Endlosschleife (und beim „bereits vollstaendig"-409 fehlt das
         * Feld ganz).
         */
        if (antwort.status === 409) {
          const koerper = await koerperVon(antwort);
          const stand = koerper?.erwartetesOffsetBytes;
          if (typeof stand === "number" && stand !== ab) {
            ab = stand;
            setzeEintrag(fileId, (e) => ({ ...e, gesendetBytes: stand }));
            continue;
          }
          setzeEintrag(fileId, (e) => ({
            ...e,
            zustand: "fehler",
            meldung: meldungFuer(409, koerper),
          }));
          return;
        }

        if (!antwort.ok) {
          const koerper = await koerperVon(antwort);
          setzeEintrag(fileId, (e) => ({
            ...e,
            zustand: "fehler",
            meldung: meldungFuer(antwort.status, koerper),
          }));
          return;
        }

        ab = bis;
        setzeEintrag(fileId, (e) => ({ ...e, gesendetBytes: ab }));
        if (ende) {
          setzeEintrag(fileId, (e) => ({ ...e, zustand: "fertig" }));
          return;
        }
      }
    },
    [setzeEintrag],
  );

  /**
   * NACH DEM ERFOLG DER ACTION BEGINNEN DIE BYTES.
   *
   * Die Zuordnung `state.dateien[i]` ↔ `auswahl[i]` laeuft ueber den INDEX und
   * nicht ueber den Namen: `anlegenAction` liest `formData.getAll("dateien")`
   * in Dokumentreihenfolge, und die versteckten Felder stehen in genau der
   * Reihenfolge von `auswahl`. Ueber den Namen zu paaren braeche bei zwei
   * gleichnamigen Dateien — ein Fall, den `_lib/zip.ts` ausdruecklich kennt.
   */
  useEffect(() => {
    if (!state.ok) return;
    if (gestartetRef.current === state.shareId) return;
    gestartetRef.current = state.shareId;
    setShareId(state.shareId);

    const paare = state.dateien.map((gemeldet, i) => ({ ...gemeldet, datei: auswahl[i] }));
    setEintraege(
      paare.map((p) => ({
        fileId: p.fileId,
        name: p.name,
        groesseBytes: p.datei?.size ?? 0,
        gesendetBytes: 0,
        zustand: "wartet" as const,
        meldung:
          p.datei === undefined
            ? "Diese Datei ist nicht mehr ausgewählt. Bitte die Freigabe neu anlegen."
            : null,
      })),
    );

    void (async () => {
      // NACHEINANDER und nicht gleichzeitig: der Server fuehrt den Fortschritt
      // als LAENGE der Zwischendatei, und mehrere parallele Schreiber auf
      // dieselbe Ablage sind genau der Fall, den `wx` (`storage.ts`) meldet
      // statt zu verschraenken. Der Engpass ist ohnehin die Leitung.
      for (const p of paare) {
        if (p.datei === undefined) {
          setzeEintrag(p.fileId, (e) => ({ ...e, zustand: "fehler" }));
          continue;
        }
        dateienRef.current.set(p.fileId, p.datei);
        await ladeHoch(p.fileId, p.datei, 0);
      }
    })();
  }, [state, auswahl, ladeHoch, setzeEintrag]);

  /**
   * ABBRECHEN — erst die Marke, DANN der Request. Andersherum liefe die
   * Schleife waehrend des `DELETE` weiter und schriebe die Zwischendatei neu,
   * die der Handler gerade entfernt hat.
   */
  const abbrechen = useCallback(async (fileId: string): Promise<void> => {
    abgebrochenRef.current.add(fileId);
    try {
      // Ein Route Handler und keine Server Action: der Aufruf kommt MITTEN aus
      // der Client-Schleife, wo ein Action-Umlauf mit Revalidierung falsch
      // waere (T27 Punkt 8). Der Handler ist idempotent.
      await fetch(`/api/upload/${fileId}`, { method: "DELETE" });
    } catch {
      // Der Eintrag verschwindet trotzdem: die Zeile ohne Bytes holt der
      // Aufraeum-Timer nach `FILES_UPLOAD_VERFALL_STUNDEN` ab (§4.4). Eine
      // stehen bleibende Zeile mit „Abbrechen" waere die schlechtere Auskunft.
    }
    dateienRef.current.delete(fileId);
    setEintraege((liste) => liste.filter((e) => e.fileId !== fileId));
  }, []);

  const alleFertig = eintraege.length > 0 && eintraege.every((e) => e.zustand === "fertig");

  return (
    <div className={css.insel} data-testid="files-upload-insel">
      <Card>
        <form action={formAction}>
          <label className={css.feld}>
            <span className={css.beschriftung}>Titel</span>
            <Input
              name="title"
              value={werte.title}
              onChange={(e) => setWerte((w) => ({ ...w, title: e.target.value }))}
              status={state.ok || !state.feldFehler.title ? undefined : "error"}
              aria-invalid={!state.ok && state.feldFehler.title ? true : undefined}
              aria-describedby={!state.ok && state.feldFehler.title ? "fi-title-fehler" : undefined}
            />
          </label>
          {!state.ok && state.feldFehler.title && (
            <p id="fi-title-fehler" className={css.fehlermeldung}>
              {state.feldFehler.title}
            </p>
          )}

          <label className={css.feld}>
            <span className={css.beschriftung}>Beschreibung (optional)</span>
            {/* `Input.TextArea` ist ein Compound-Zugriff und in einer SERVER
                Component verboten; hier, in der Client-Insel, ist er zulaessig. */}
            <Input.TextArea
              name="description"
              rows={3}
              value={werte.description}
              onChange={(e) => setWerte((w) => ({ ...w, description: e.target.value }))}
            />
          </label>

          <label className={css.feld}>
            <span className={css.beschriftung}>Laufzeit in Tagen</span>
            <Input
              name="expiryDays"
              type="number"
              min={1}
              max={maxAblaufTage}
              value={werte.expiryDays}
              onChange={(e) => setWerte((w) => ({ ...w, expiryDays: e.target.value }))}
              status={state.ok || !state.feldFehler.expiryDays ? undefined : "error"}
              aria-invalid={!state.ok && state.feldFehler.expiryDays ? true : undefined}
              aria-describedby={
                !state.ok && state.feldFehler.expiryDays ? "fi-expiry-fehler" : undefined
              }
            />
          </label>
          {/* KEINE Vorbelegung fuer die Laufzeit: ein geratener Wert ist genau
              der Alt-Defekt in gruen — `useState(1)` verkuerzte dort jeden
              Share auf 24 Stunden, sobald jemand nur den Titel korrigierte. */}
          {!state.ok && state.feldFehler.expiryDays && (
            <p id="fi-expiry-fehler" className={css.fehlermeldung}>
              {state.feldFehler.expiryDays}
            </p>
          )}

          <label className={css.feld}>
            <span className={css.beschriftung}>Download-Limit (leer = unbegrenzt)</span>
            <Input
              name="maxDownloads"
              type="number"
              min={1}
              value={werte.maxDownloads}
              onChange={(e) => setWerte((w) => ({ ...w, maxDownloads: e.target.value }))}
              status={state.ok || !state.feldFehler.maxDownloads ? undefined : "error"}
              aria-invalid={!state.ok && state.feldFehler.maxDownloads ? true : undefined}
              aria-describedby={
                !state.ok && state.feldFehler.maxDownloads ? "fi-limit-fehler" : undefined
              }
            />
          </label>
          {!state.ok && state.feldFehler.maxDownloads && (
            <p id="fi-limit-fehler" className={css.fehlermeldung}>
              {state.feldFehler.maxDownloads}
            </p>
          )}

          <label className={css.feld}>
            <span className={css.beschriftung}>Passwort (optional)</span>
            {/* NIE vorbelegt: `AnlegenErgebnis.werte` traegt es bewusst nicht
                zurueck — es stuende sonst als Attribut im Markup. */}
            <Input.Password name="password" autoComplete="new-password" />
          </label>
          {!state.ok && state.feldFehler.password && (
            <p className={css.fehlermeldung}>{state.feldFehler.password}</p>
          )}

          <label className={css.feld}>
            <span className={css.beschriftung}>Dateien</span>
            {/*
             * KEIN `name` — und das ist die tragende Zeile dieses Formulars:
             * mit einem waeren die Bytes Teil der Server-Action-Nutzlast und
             * jede Datei ueber 1 MB ein HTTP 413 (§7.1, Kappungsebene 1).
             * Uebertragen werden hier nur die NAMEN, als versteckte Felder.
             */}
            <input
              type="file"
              multiple
              accept={ACCEPT}
              className={css.dateiwahl}
              data-testid="files-dateiwahl"
              onChange={(e) => setAuswahl(Array.from(e.target.files ?? []))}
            />
            <p className={css.hinweis}>
              Höchstens {maxDateienProShare} Dateien je Freigabe, je Datei höchstens{" "}
              {alsMiB(maxDateiBytes)}.
            </p>
          </label>
          {auswahl.map((d, i) => (
            <input key={`${i}-${d.name}`} type="hidden" name="dateien" value={d.name} />
          ))}
          {!state.ok && state.feldFehler.dateien && (
            <p className={css.fehlermeldung}>{state.feldFehler.dateien}</p>
          )}

          <div className={css.aktionen}>
            {/* Kein `size`: `controlHeight` ist 56 und schon das richtige
                Touch-Mass, `size="large"` waeren 72px. */}
            <Button
              className={css.knopf}
              type="primary"
              htmlType="submit"
              loading={laeuftAnlegen}
              disabled={eintraege.length > 0}
            >
              Freigabe anlegen und hochladen
            </Button>
          </div>
        </form>
      </Card>

      {eintraege.length > 0 && (
        <Card>
          <h2>Übertragung</h2>
          {/* Die Kennung steht als ATTRIBUT da und nicht als Link: `/shares/<id>`
              (T41) und `/s/<id>` (T40) entstehen erst in Welle 7, ein Link
              dorthin waere heute ein Einstiegspunkt in einen 404. */}
          <ul className={css.liste} data-testid="files-upload-liste" data-share-id={shareId ?? ""}>
            {eintraege.map((e) => (
              <li
                key={e.fileId}
                className={css.eintrag}
                data-file-id={e.fileId}
                data-zustand={e.zustand}
                data-gesendet={e.gesendetBytes}
              >
                <div className={css.kopfzeile}>
                  <span className={css.name}>{e.name}</span>
                  {/* Der Zustand steht als TEXT da, nicht nur als Balken:
                      Bedeutung nie allein ueber Farbe oder Geometrie. */}
                  <span className={css.meta}>
                    {ZUSTANDSTEXT[e.zustand]} · {alsMiB(e.gesendetBytes)} von{" "}
                    {alsMiB(e.groesseBytes)}
                  </span>
                </div>
                <Progress
                  percent={prozent(e)}
                  showInfo={false}
                  aria-label={`Fortschritt ${e.name}`}
                />
                {e.meldung && <p className={css.fehlermeldung}>{e.meldung}</p>}
                <div className={css.aktionen}>
                  {/* AN DIE DATEI GEBUNDEN, nicht allein an den Zustand: ein
                      Eintrag, dessen Datei zwischen Absenden und Antwort aus
                      der Auswahl fiel, hat keine — sein Klick liefe still ins
                      Leere. Der Weg fuer ihn steht in seiner Meldung.
                      Das Lesen der Ref waehrend des Renderns ist hier
                      unbedenklich, obwohl es nicht reaktiv ist: sie wird VOR
                      `ladeHoch` gefuellt, also vor jedem Rendern, das
                      `fehler` zeigen kann. */}
                  {e.zustand === "fehler" && dateienRef.current.has(e.fileId) && (
                    <Button
                      className={css.knopf}
                      data-aktion="wiederholen"
                      onClick={() => {
                        const datei = dateienRef.current.get(e.fileId);
                        // Ab dem STAND und nicht ab Null: die Bytes liegen
                        // serverseitig in der Zwischendatei, ihre Laenge IST
                        // der Fortschritt (§7.1 Schritt 3).
                        if (datei) void ladeHoch(e.fileId, datei, e.gesendetBytes);
                      }}
                    >
                      Wiederholen
                    </Button>
                  )}
                  {e.zustand !== "fertig" && (
                    <Button
                      className={css.knopf}
                      data-aktion="abbrechen"
                      onClick={() => void abbrechen(e.fileId)}
                    >
                      Abbrechen
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>

          {alleFertig && (
            <>
              {/*
               * `type="success"` und NICHT `type="error"` irgendwo auf dieser
               * Seite: `colorError === colorPrimary === #c8000f`, ein roter
               * Kasten saehe aus wie eine Primaeraktion.
               */}
              <Alert
                type="success"
                showIcon
                // `title` und nicht `message`: antd 6 hat `message` abgekündigt
                // und warnt zur Laufzeit — sichtbar nur im Browser-Log.
                title="Alle Dateien sind übertragen."
                description="Die Virenprüfung läuft noch; erst danach ist die Freigabe herunterladbar."
              />
              {/*
               * ZURUECK ZUR UEBERSICHT und NICHT auf `/shares/<id>` oder
               * `/s/<id>`: beide Seiten entstehen erst in Welle 7 und waeren
               * heute ein Einstiegspunkt in einen 404 — genau die Gegenprobe
               * aus `docs/design/README.md:238-242`.
               */}
              <p>
                <Link href="/">Zurück zur Übersicht</Link>
              </p>
            </>
          )}
        </Card>
      )}
    </div>
  );
}
