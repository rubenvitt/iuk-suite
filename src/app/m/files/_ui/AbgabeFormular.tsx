"use client";

import { useRef, useState } from "react";

import { FILES_CHUNK_BYTES, FILES_HINWEIS_MAX_ZEICHEN } from "../_lib/grenzen";
import { SCHREIBBARE_KATEGORIEN } from "../_lib/kategorien";
import s from "../(oeffentlich-inbox)/u/[token]/abgabe.module.css";

/**
 * DIE ANONYME ABGABE AUF EINEM FREMDEN HANDY — die Client-Insel von
 * `/u/<token>` (Spec §8.1–§8.3, Plan T38).
 *
 * ═══ WAS DIESE DATEI IMPORTIEREN DARF UND WAS NICHT ══════════════════════════
 *
 * Nur `FILES_CHUNK_BYTES` und `FILES_HINWEIS_MAX_ZEICHEN` aus `_lib/grenzen.ts`
 * — zwei nackte Konstanten. **Niemals `grenzen()`**: die Funktion liest
 * `process.env` und wirft im Browser. `_lib/token.ts` (`node:crypto`) und
 * `_lib/av.ts` (`node:net`) gehören gar nicht hierher; die Token-Auflösung
 * bleibt in `page.tsx`. Umgekehrt darf `page.tsx` aus DIESER Datei keinen WERT
 * lesen — sie trägt `"use client"`, und eine Server Component bekäme statt des
 * Wertes eine Client-Referenz (Falle 6, HTTP 500 für die ganze Seite).
 *
 * ═══ DAS DRAHTFORMAT, UND WARUM ES EXAKT SO AUSSIEHT ═════════════════════════
 *
 * `PUT /api/u/<token>/upload` (T31). Drei Eigenheiten, die man nicht raten kann:
 *
 * 1. **`name`, `kategorie` und `hinweis` NUR im ersten Chunk.** Der Server legt
 *    die Zeile in `eroeffne()` an, und das läuft ausschließlich, solange keine
 *    `id` mitkommt. Am letzten Chunk angehängt wären sie stumm — der Hinweis
 *    einer 5-MiB-Datei ginge lautlos verloren.
 * 2. **`typ` NUR im letzten Chunk, und in der QUERY statt im `Content-Type`.**
 *    `schliesseAb()` liest `suche.get("typ")`. Ohne die Deklaration lehnt
 *    `_lib/mime.ts` jede `.txt` und die drei Office-Formate mit 415 ab — für
 *    `text/plain` gibt es keine Signatur, die Deklaration ist dort das einzige
 *    Positivsignal. PNG, JPEG und PDF gingen trotzdem durch: **die Lücke fällt
 *    genau bei den Typen auf, die niemand zuerst probiert.**
 * 3. **`ab` ist ein BYTE-Offset, keine Chunk-Nummer**, und der Server antwortet
 *    mit `empfangen` — dem Stand, den er wirklich hält. Genau der ist der
 *    nächste `ab`; ein selbst mitgezählter Offset liefe bei einer Wiederaufnahme
 *    auseinander und verdürbe den Blob still (die Magic-Byte-Prüfung liest nur
 *    den Kopf).
 *
 * Chunked ist hier keine Kür: der Next-Proxy kappt bei 10 MiB **still**
 * (`grenzen.ts`), und ein Handyvideo überschreitet das regelmäßig. Ein
 * Ein-Anfrage-Weg zerbräche ohne jede Fehlermeldung.
 *
 * ═══ EINE DATEI = EINE ANFRAGE = EIN ERGEBNIS ════════════════════════════════
 *
 * Sequenziell, und jede Datei trägt ihren eigenen Zustand: Fortschritt,
 * Quittung, Fehlertext, Wiederholen. Kein Sammelfehler über dem Formular — bei
 * mehreren Dateien wäre er nicht zuzuordnen (§10.1). Und ein Fehlschlag hält
 * die übrigen Dateien NICHT auf: in `drop` verlangt der Client
 * `uploaded.length > 0`, zeigt sonst „Upload abgelehnt", der Melder lädt erneut
 * hoch und erzeugt eine Dublette (§8.2).
 *
 * ═══ EIN HINWEIS, EINE KATEGORIE, EIN VORGANG (§8.3) ═════════════════════════
 *
 * Beide gelten für die ganze Abgabe und werden je Anfrage mitgeschickt — nicht
 * positionsgebunden wie in `drop`, wo eine Datei ohne Notiz im Wurzelverzeichnis
 * landet, sobald die Felder im Multipart-Body NACH ihr kommen.
 *
 * ═══ JAVASCRIPT IST ERFORDERLICH, UND DAS IST KEINE REGRESSION ═══════════════
 *
 * `/u/:token` liefert heute schon die `index.html` einer React-SPA — die Inbox
 * war NIE ohne JS bedienbar (§8.2). Die feedback-Zusage „ohne JS vollständig
 * bedienbar" gilt dort und wird hier ausdrücklich nicht ausgedehnt. Der
 * `<noscript>`-Block nennt deshalb den Weg statt einer leeren Seite.
 */

/** Der Lebenslauf einer Datei in diesem Formular. */
type Zustand = "wartet" | "laeuft" | "fertig" | "fehler";

type Eintrag = {
  /** Stabil über Neuauswahl und Wiederholung hinweg — der Dateiname ist es nicht. */
  schluessel: string;
  name: string;
  groesse: number;
  zustand: Zustand;
  /** Bytes, die der SERVER bestätigt hat — nicht die, die wir abgeschickt haben. */
  uebertragen: number;
  /** Unser eigener Text zum Statuscode. */
  fehler: string | null;
  /** Der Text des Servers, wenn er einen mitschickt (trägt z. B. die Grenze). */
  zusatz: string | null;
  wiederholbar: boolean;
};

/** Wo eine Übertragung steht — überlebt einen Fehlschlag, damit „Wiederholen" FORTSETZT. */
type Stand = { id: string | null; ab: number };

/** Was der Server auf einen Chunk antwortet (T31). */
type ChunkAntwort = { id?: string; empfangen?: number; fertig?: boolean };

/** Was der Server im Fehlerfall mitschickt. */
type Fehlerkoerper = { code?: string; fehler?: string };

/**
 * Eine benannte Ablehnung des Servers. Eigene Klasse, damit der `catch` sie von
 * einem Netzfehler unterscheiden kann — die beiden führen zu verschiedenen
 * nächsten Schritten, und nur einer davon ist wiederholbar.
 */
class Abgelehnt extends Error {
  constructor(
    readonly status: number,
    readonly code: string | null,
    readonly servertext: string | null,
  ) {
    super(`HTTP ${status}`);
    this.name = "Abgelehnt";
  }
}

type Meldung = { text: string; wiederholbar: boolean };

/**
 * Statuscode und benannter Grund → der Satz, den der Melder liest.
 *
 * **Das Formular bildet auf STATUSCODES ab, nicht auf den Code eines bestimmten
 * Tasks.** Deshalb steht hier auch `kontingent` (429), obwohl der Zweig, der es
 * sendet, in `api/u/[token]/upload/route.ts` erst mit T50 entsteht: die Antwort
 * ist Teil des Vertrags aus §8.4, nicht Teil einer fremden Datei.
 *
 * `wiederholbar` ist eine Fachaussage und keine Bequemlichkeit: ein zu großes
 * oder unzulässiges Objekt wird durch Wiederholen nicht kleiner oder erlaubter,
 * ein erschöpftes Kontingent nicht größer. Ein Knopf davor wäre eine Einladung
 * in eine Schleife.
 */
function meldungZu(status: number, code: string | null): Meldung {
  if (code === "kontingent") {
    return {
      text:
        "Das Kontingent dieses Abgabelinks ist erschöpft. Bitte wenden Sie sich an die Stelle, " +
        "die die Abgabe angefordert hat.",
      wiederholbar: false,
    };
  }
  if (code === "zu-viele-fehlversuche") {
    return {
      text: "Zu viele Fehlversuche von dieser Verbindung. Bitte in einer Minute erneut versuchen.",
      wiederholbar: true,
    };
  }
  switch (status) {
    case 400:
      return code === "hinweis"
        ? { text: `Der Hinweis ist länger als ${FILES_HINWEIS_MAX_ZEICHEN} Zeichen.`, wiederholbar: false }
        : code === "kategorie"
          ? { text: "Diese Kategorie gibt es nicht.", wiederholbar: false }
          : code === "name"
            ? { text: "Diese Datei hat keinen brauchbaren Namen.", wiederholbar: false }
            : { text: "Die Übertragung ist aus dem Tritt geraten.", wiederholbar: true };
    case 401:
      return {
        text:
          "Dieser Abgabelink ist nicht (mehr) gültig. Bitte lassen Sie sich einen aktuellen Link geben.",
        wiederholbar: false,
      };
    case 404:
      return { text: "Diese Abgabe ist nicht mehr offen. Bitte neu beginnen.", wiederholbar: false };
    case 409:
      // Der Server nennt in `erwartetesAb`, wo er steht — genau dort setzt eine
      // Wiederholung an (siehe `uebertrage`).
      return { text: "Die Übertragung ist aus dem Tritt geraten.", wiederholbar: true };
    case 413:
      return { text: "Diese Datei ist zu groß für die Abgabe.", wiederholbar: false };
    case 415:
      return { text: "Dieser Dateityp ist nicht erlaubt.", wiederholbar: false };
    case 429:
      return { text: "Zu viele Anfragen. Bitte kurz warten und erneut versuchen.", wiederholbar: true };
    case 507:
      return {
        text: "Auf dem Server ist gerade kein Platz. Bitte melden Sie sich beim I&K.",
        wiederholbar: true,
      };
    default:
      return status >= 500
        ? { text: "Der Server konnte die Datei nicht annehmen.", wiederholbar: true }
        : { text: "Die Datei wurde nicht angenommen.", wiederholbar: false };
  }
}

/** Menschliche Größenangabe. Basis 1024, und der Name sagt es (§9.1). */
function alsMiB(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MiB`;
}

let laufendeNummer = 0;

export function AbgabeFormular({ token }: { token: string }) {
  const [eintraege, setEintraege] = useState<Eintrag[]>([]);
  const [hinweis, setHinweis] = useState("");
  const [kategorie, setKategorie] = useState("");
  const [hinweisFehler, setHinweisFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);

  /**
   * Die Dateien und der Übertragungsstand liegen in Refs, nicht im State: der
   * Upload läuft in einer `async`-Schleife und braucht den AKTUELLEN Stand, nicht
   * den, der beim Rendern des Handlers galt. Ein `File` im State wäre außerdem
   * ein Objekt, das React bei jedem Vergleich anfasst, ohne dass sich je etwas
   * daran ändert.
   */
  const dateienRef = useRef(new Map<string, File>());
  const standRef = useRef(new Map<string, Stand>());

  const hinweisZeichen = Array.from(hinweis).length;

  /**
   * WAS HEUTE NOCH ABZUGEBEN IST — die eine Größe hinter dem Absende-Knopf und
   * hinter dem, was er auslöst.
   *
   * Ein `fehler` zählt nur mit, wenn `wiederholbar` es sagt. Ohne diese
   * Bedingung schickte ein zweiter Klick genau die Einträge erneut, die
   * `meldungZu` als endgültig führt (413, 415, erschöpftes Kontingent) — die
   * Schleife, die der Kommentar dort am Eintrag verweigert, nur eine Ebene
   * höher. Bei einer MEHRTEILIGEN Datei ist die Folge schlimmer als ein
   * verlorener Rundlauf: der Server hat bei 415 und bei Kontingent schon
   * `verwirf(ziel, zeile.id)` gerufen, die Wiederholung schickt die gemerkte
   * `id` mit, und der Melder liest statt des Grundes „Diese Abgabe ist nicht
   * mehr offen. Bitte neu beginnen." — eine Aufforderung zu einem Weg, der nie
   * ans Ziel führt.
   */
  const offen = eintraege.filter(
    (e) => e.zustand === "wartet" || (e.zustand === "fehler" && e.wiederholbar),
  );
  /** Nur DANN ist „alles abgegeben" wahr — neben einer Ablehnung wäre es eine Lüge. */
  const alleFertig = eintraege.length > 0 && eintraege.every((e) => e.zustand === "fertig");

  function aktualisiere(schluessel: string, teil: Partial<Eintrag>): void {
    setEintraege((vorher) =>
      vorher.map((e) => (e.schluessel === schluessel ? { ...e, ...teil } : e)),
    );
  }

  function beiAuswahl(dateien: FileList | null): void {
    const gewaehlt = Array.from(dateien ?? []);
    dateienRef.current = new Map();
    standRef.current = new Map();
    setEintraege(
      gewaehlt.map((datei) => {
        const schluessel = `d${++laufendeNummer}`;
        dateienRef.current.set(schluessel, datei);
        return {
          schluessel,
          name: datei.name,
          groesse: datei.size,
          zustand: "wartet" as Zustand,
          uebertragen: 0,
          fehler: null,
          zusatz: null,
          wiederholbar: false,
        };
      }),
    );
  }

  /**
   * Eine Datei, chunkweise, bis der Server `fertig` sagt. Der Stand wird nach
   * JEDER Antwort fortgeschrieben — deshalb setzt „Wiederholen" nach einem
   * Netzfehler dort an, wo es aufgehört hat, statt die schon übertragenen Bytes
   * ein zweites Mal zu schicken.
   */
  async function uebertrage(schluessel: string, notiz: string, kat: string): Promise<void> {
    const datei = dateienRef.current.get(schluessel);
    if (datei === undefined) return;

    const stand: Stand = standRef.current.get(schluessel) ?? { id: null, ab: 0 };
    aktualisiere(schluessel, { zustand: "laeuft", fehler: null, zusatz: null, wiederholbar: false });

    try {
      for (;;) {
        const bis = Math.min(stand.ab + FILES_CHUNK_BYTES, datei.size);
        // `>=` und nicht `===`: eine leere Datei (0 Bytes) ist EIN Chunk mit
        // `ende=1`, kein Sonderfall — der Server lehnt sie beim Typbefund ab,
        // aber sie darf nicht in einer Endlosschleife hängen.
        const ende = bis >= datei.size;

        const p = new URLSearchParams();
        p.set("ab", String(stand.ab));
        if (stand.id === null) {
          // NUR beim ersten Chunk: `eroeffne()` läuft nur ohne `id`.
          p.set("name", datei.name);
          if (kat !== "") p.set("kategorie", kat);
          if (notiz !== "") p.set("hinweis", notiz);
        } else {
          p.set("id", stand.id);
        }
        if (ende) {
          p.set("ende", "1");
          // DIE DEKLARATION, und zwar in der Query. Ohne sie 415 für jede
          // `.txt` und jedes Office-Format (siehe Kopf dieser Datei). Leer nur,
          // wenn der Browser selbst keinen Typ kennt — dann ist Schweigen
          // ehrlicher als eine erfundene Angabe.
          if (datei.type !== "") p.set("typ", datei.type);
        }

        const antwort = await fetch(
          `/api/u/${encodeURIComponent(token)}/upload?${p.toString()}`,
          { method: "PUT", body: datei.slice(stand.ab, bis) },
        );

        if (!antwort.ok) {
          const koerper = (await antwort.json().catch(() => ({}))) as Fehlerkoerper;
          // Der Server nennt bei 409 seinen Stand. Ihn zu übernehmen macht die
          // Wiederholung zu einer Fortsetzung statt zu einem zweiten Anfang.
          const erwartet = (koerper as { erwartetesAb?: unknown }).erwartetesAb;
          if (typeof erwartet === "number") {
            stand.ab = erwartet;
            standRef.current.set(schluessel, stand);
          }
          throw new Abgelehnt(
            antwort.status,
            typeof koerper.code === "string" ? koerper.code : null,
            typeof koerper.fehler === "string" ? koerper.fehler : null,
          );
        }

        const koerper = (await antwort.json()) as ChunkAntwort;
        stand.id = typeof koerper.id === "string" ? koerper.id : stand.id;
        stand.ab = typeof koerper.empfangen === "number" ? koerper.empfangen : bis;
        standRef.current.set(schluessel, stand);
        aktualisiere(schluessel, { uebertragen: stand.ab });

        if (koerper.fertig === true) {
          aktualisiere(schluessel, { zustand: "fertig" });
          return;
        }
      }
    } catch (grund) {
      const meldung =
        grund instanceof Abgelehnt
          ? meldungZu(grund.status, grund.code)
          : {
              text: "Die Übertragung wurde unterbrochen. Bitte erneut versuchen.",
              wiederholbar: true,
            };
      aktualisiere(schluessel, {
        zustand: "fehler",
        fehler: meldung.text,
        zusatz: grund instanceof Abgelehnt ? grund.servertext : null,
        wiederholbar: meldung.wiederholbar,
      });
    }
  }

  /**
   * Nacheinander, und OHNE Abbruch bei einem Fehlschlag: `uebertrage` fängt
   * selbst. Ein `break` hier wäre der Alt-Defekt aus §8.2 — eine abgelehnte
   * Datei hielte die übrigen auf, und der Melder lädt alles erneut hoch.
   *
   * DIE VORPRÜFUNGEN LIEGEN HIER UND NICHT IM ABSENDE-HANDLER, weil der
   * Wiederholen-Knopf denselben Weg nimmt. Läge die Hinweis-Grenze nur im
   * Handler, schickte „Wiederholen" einen zu langen Hinweis an den Server; der
   * antwortet 400 `hinweis`, und das ist `wiederholbar: false` — ein Tippfehler
   * im Hinweis kostete die schon übertragenen Bytes und ließe die Datei ohne
   * jeden Ausgang zurück.
   */
  async function starte(schluessel: string[], notiz: string, kat: string): Promise<void> {
    if (laeuft || schluessel.length === 0) return;

    // CODE POINTS, nicht UTF-16-Einheiten — dieselbe Zählung wie im Server
    // (`eroeffne()`): `"🚒".repeat(500).length` ist 1000, und eine Prüfung über
    // `.length` wiese genau die Abgabe ab, die die Grenze einhält (§8.3).
    if (hinweisZeichen > FILES_HINWEIS_MAX_ZEICHEN) {
      setHinweisFehler(
        `Der Hinweis ist ${hinweisZeichen} Zeichen lang — erlaubt sind ${FILES_HINWEIS_MAX_ZEICHEN}. ` +
          "Bitte kürzen Sie ihn; abgeschnitten wird nichts.",
      );
      return;
    }
    setHinweisFehler(null);

    setLaeuft(true);
    try {
      for (const s of schluessel) await uebertrage(s, notiz, kat);
    } finally {
      setLaeuft(false);
    }
  }

  function beiAbgabe(ereignis: React.FormEvent<HTMLFormElement>): void {
    ereignis.preventDefault();
    void starte(
      offen.map((e) => e.schluessel),
      hinweis,
      kategorie,
    );
  }

  return (
    <form className={s.formular} data-testid="abgabe-formular" onSubmit={beiAbgabe} noValidate>
      {/* Kein leerer Bildschirm ohne JavaScript: die Inbox war nie ohne JS
          bedienbar (§8.2), also nennt der Block den Weg. */}
      <noscript>
        Für die Abgabe wird JavaScript benötigt. Bitte öffnen Sie diesen Link in einem Browser mit
        aktiviertem JavaScript — oder geben Sie ihn an eine Person mit Rechner weiter, die die
        Dateien für Sie abgibt.
      </noscript>

      <fieldset className={s.gruppe} data-testid="abgabe-kategorie">
        <legend className={s.legende}>Kategorie (freiwillig)</legend>
        {/* ECHTE Radios mit EINEM `name`: der Browser macht daraus einen
            Tabstop und die Pfeiltastenauswahl. Eine Knopfreihe müsste beides
            nachbauen und wäre mit der Tastatur schlechter bedienbar
            (`docs/design/README.md:144`). */}
        {SCHREIBBARE_KATEGORIEN.map((k) => (
          <label className={s.wahl} key={k.wert}>
            <input
              type="radio"
              name="kategorie"
              value={k.wert}
              checked={kategorie === k.wert}
              onChange={() => setKategorie(k.wert)}
            />
            <span>{k.beschriftung}</span>
          </label>
        ))}
      </fieldset>

      <div className={s.feldblock}>
        <label className="fp-label" htmlFor="abgabe-hinweis">
          Hinweis für den I&K (freiwillig)
        </label>
        {/* KEIN `maxlength`. Es schnitte still ab — und zwar in
            UTF-16-Einheiten, also bei Emoji mitten in einem Zeichen. Die Grenze
            wird gemeldet, nicht erzwungen (§8.3). */}
        <textarea
          id="abgabe-hinweis"
          className="fp-feld"
          rows={3}
          value={hinweis}
          onChange={(e) => setHinweis(e.target.value)}
        />
        <p className={s.zaehler} data-testid="hinweis-zaehler">
          {hinweisZeichen} von {FILES_HINWEIS_MAX_ZEICHEN} Zeichen
        </p>
        {hinweisFehler !== null && (
          <p className="fp-fehler" data-testid="hinweis-fehler" role="alert">
            {hinweisFehler}
          </p>
        )}
      </div>

      <div className={s.feldblock}>
        <label className="fp-label" htmlFor="abgabe-dateien">
          Dateien
        </label>
        {/* KEIN `accept`: eine Typliste nähme dem Handy-Auswahldialog die
            Kamera-Option und wäre eine zweite, stille Allowlist neben
            `_lib/mime.ts` — die Entscheidung über den Typ trifft der Server
            anhand der Bytes (§8.5). KEIN `webkitdirectory` (§8.2). */}
        <input
          id="abgabe-dateien"
          className="fp-feld"
          type="file"
          multiple
          onChange={(e) => beiAuswahl(e.target.files)}
        />
      </div>

      {eintraege.length > 0 && (
        <ul className={s.liste}>
          {eintraege.map((e) => (
            <li
              className={s.eintrag}
              key={e.schluessel}
              data-testid="abgabe-eintrag"
              data-datei={e.name}
              data-zustand={e.zustand}
            >
              <p className={s.dateiname}>
                {e.name} <span className={s.groesse}>{alsMiB(e.groesse)}</span>
              </p>

              {/* Fortschritt je Datei — Balken UND Zahl: ein Balken allein
                  trägt die Aussage nur über Fläche. */}
              <progress
                className={s.balken}
                data-testid="eintrag-fortschritt"
                max={e.groesse}
                value={e.uebertragen}
              />

              {e.zustand === "fertig" && (
                <p className={s.quittung} data-testid="eintrag-quittung">
                  ✓ Angekommen — die Datei wird jetzt geprüft.
                </p>
              )}

              {e.zustand === "laeuft" && (
                <p className={s.stand}>
                  {alsMiB(e.uebertragen)} von {alsMiB(e.groesse)} übertragen …
                </p>
              )}

              {e.fehler !== null && (
                <p className="fp-fehler" data-testid="eintrag-fehler" role="alert">
                  {e.fehler}
                  {e.zusatz !== null && <span className={s.zusatz}> {e.zusatz}</span>}
                </p>
              )}

              {e.wiederholbar && !laeuft && (
                <button
                  type="button"
                  className={`fp-knopf fp-knopf-leise ${s.wiederholen}`}
                  data-testid="eintrag-wiederholen"
                  onClick={() => void starte([e.schluessel], hinweis, kategorie)}
                >
                  Wiederholen
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="fp-knopfzeile">
        {/* Deaktiviert, sobald nichts mehr offen ist: ein aktiver Knopf, der in
            `starte` still zurückkehrt, ist auf einem fremden Handy von „hat
            nicht reagiert" nicht zu unterscheiden. Der Weg nach vorn bleibt die
            Dateiauswahl darüber — `beiAuswahl` setzt den Vorgang zurück. */}
        <button
          type="submit"
          className="fp-knopf"
          data-testid="abgabe-absenden"
          disabled={laeuft || offen.length === 0}
        >
          {laeuft ? "Wird übertragen …" : alleFertig ? "Alles abgegeben" : "Abgeben"}
        </button>
      </div>
    </form>
  );
}
