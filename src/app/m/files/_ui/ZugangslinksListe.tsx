"use client";

import { useActionState, useRef, useState } from "react";
import { Alert, Button, Card, Input, Popconfirm, Table } from "antd";

import {
  kontingentAufstockenAction,
  zugangslinkAnlegenAction,
  zugangslinkWiderrufenAction,
  type AnlegenErgebnis,
  type ZugangslinkFormState,
} from "../(verwaltung)/zugangslinks/actions";
import styles from "./zugangslinks.module.css";

/**
 * DIE ABGABELINK-LISTE (Spec §4.7, §8.6, §10.1; Plan T39).
 *
 * DREI SCHREIBWEGE, DREI EINSTIEGSPUNKTE, und §10.2 hakt sie einzeln ab:
 * `zugangslinkAnlegenAction` am Knopf „Abgabelink anlegen" (auch im
 * LEERZUSTAND — sonst waere die leere Seite eine Sackgasse),
 * `kontingentAufstockenAction` AM RESTBUDGET-FELD der Zeile (dort, wo der
 * Zustand ablesbar ist), `zugangslinkWiderrufenAction` als Zeilenaktion mit
 * Rueckfrage.
 *
 * WARUM DIESE KOMPONENTE `"use client"` TRAEGT und die Seite trotzdem RSC
 * bleibt: `columns` mit `render`-Funktionen reicht FUNKTIONEN ueber die
 * RSC-Grenze, und das scheitert unabhaengig von der antd-Compound-Falle. Die
 * Seite laedt und rechnet, diese Insel bedient. Praezedenzfall im Repo:
 * `feedback/_ui/Verlauf.tsx:1`.
 *
 * DIE ZEILEN KOMMEN FERTIG HEREIN — Text, keine `Date`-Objekte, keine
 * Drizzle-Rows. Zwei Gruende: eine `Date` ueber die RSC-Grenze ist eine
 * Serialisierungsfrage, und der ZUSTAND („gueltig / abgelaufen / widerrufen")
 * haengt an einer Uhr. Rechnete ihn der Client, entschieden Server und Browser
 * an der Ablaufsekunde verschieden — und zwar still.
 *
 * DER ROHTOKEN LEBT NUR IM RENDER. Er kommt aus dem Rueckgabewert von
 * `zugangslinkAnlegenAction`, wird EINMAL gezeigt und ist nach „Schliessen"
 * nirgends mehr — kein `localStorage` (der Umweg der Alt-App, an dem die
 * QR-Historie beim Domainwechsel verloren ging), kein verstecktes Feld, keine
 * Adresszeile. Wer den Zettel verliert, legt einen neuen Link an; bei <= 72 h
 * Laufzeit ist das der Normalfall (§4.7).
 */

export type ZugangslinkZustand = "gueltig" | "abgelaufen" | "widerrufen";

export type ZugangslinkZeile = {
  id: string;
  name: string;
  /** Die ersten sieben Zeichen im Klartext (`dz-` plus vier Geheimzeichen) —
   *  genug zum Wiedererkennen, zu wenig zum Benutzen. */
  tokenStart: string;
  /** Fertiger Text, z. B. „24 h". Gerechnet aus `expires_at - created_at`, und
   *  zwar SERVERSEITIG: die Spalten fuehren SEKUNDEN (`mode: "timestamp"`). */
  laufzeitText: string;
  ablaufText: string;
  zustand: ZugangslinkZustand;
  budgetDateien: number;
  restDateien: number;
  budgetBytesText: string;
  restBytesText: string;
  /** `verbraucht_dateien` — der Uploads-Zaehler der Liste (§8.6). */
  uploads: number;
  /**
   * Der Dateiname des PNG-Downloads, serverseitig aus dem Namen entschaerft
   * (`_lib/zip.ts`, `entschaerfeTitel`). Er wird HIER nicht gerechnet: `zip.ts`
   * zieht ueber `_lib/av.ts` `node:net` nach, und ein Import von dort in ein
   * `"use client"`-Modul truege das ins Client-Bundle.
   */
  qrDateiname: string;
};

export type ZugangslinksListeProps = {
  zeilen: ZugangslinkZeile[];
  /**
   * Absolute Basis-Adresse der Rolle `inbox` (Protokoll, Host, ggf. Port), oder
   * `null`, solange `hostFuerRolle("inbox")` keinen Host kennt.
   *
   * ABSOLUT UND AUS DER ROLLE, nie relativ: ein relativer `/u/<token>` liefe auf
   * dem Verwaltungs-Host in ein `notFound()` (§10.2), und ein aus dem Request
   * gebauter Host truege beim Anlegen auf der falschen Domain ein Papier, das
   * beim naechsten Cutover wertlos ist. GEDRUCKT IST GEDRUCKT.
   */
  inboxBasis: string | null;
};

const ANLEGEN_START: AnlegenErgebnis = { ok: false, fieldErrors: {}, values: {} };
const FORM_START: ZugangslinkFormState = { ok: false, fieldErrors: {}, values: {} };

/** Bedeutung nie allein ueber Farbe — der Zustand steht als WORT in der Zeile. */
const ZUSTAND_TEXT: Record<ZugangslinkZustand, string> = {
  gueltig: "gültig",
  abgelaufen: "abgelaufen",
  widerrufen: "widerrufen",
};

const KEIN_HOST_TEXT =
  "Die Abgabe-Domain ist noch nicht auf die Suite umgestellt — Abgabelinks können erst danach " +
  "ausgegeben werden.";

/** Fallback, falls die aufgefrischte Liste die neue Zeile noch nicht enthaelt. */
const QR_DATEINAME_ERSATZ = "abgabelink-qr.png";

function fehlerText(zustand: AnlegenErgebnis | ZugangslinkFormState): string | null {
  if (zustand.ok) return null;
  const werte = Object.values(zustand.fieldErrors);
  return werte.length === 0 ? null : werte.join(" ");
}

export function ZugangslinksListe({ zeilen, inboxBasis }: ZugangslinksListeProps) {
  const [anlegenZustand, anlegenAbschicken] = useActionState(
    zugangslinkAnlegenAction,
    ANLEGEN_START,
  );
  const [formularOffen, setFormularOffen] = useState(false);
  /**
   * Die ID des Links, dessen Ausgabe die Person WEGGEKLICKT hat. `useActionState`
   * kennt kein Zuruecksetzen; auf die ID zu merken statt auf ein `boolean` ist
   * der Unterschied zwischen „diese Ausgabe ist erledigt" und „ab jetzt sehe ich
   * keine mehr" — der naechste Anlegen-Vorgang traegt eine andere ID und zeigt
   * seine Ausgabe wieder.
   */
  const [quittiert, setQuittiert] = useState<string | null>(null);

  const ohneHost = inboxBasis === null;
  /*
   * OHNE HOST GIBT ES KEINE AUSGABE — kein Link, kein QR, kein PNG. Das ist der
   * Zustand, der ohne die Host-Rollen-Festlegung (§3.2) unbemerkt ALTPAPIER
   * produziert haette: ein QR mit geratenem Host sieht richtig aus und ist
   * wertlos, sobald die Domain umgestellt wird. Anlegen ist in diesem Zustand
   * ohnehin gesperrt; die Bedingung steht trotzdem hier, weil eine Sperre am
   * Knopf keine Sperre an der Ausgabe ist.
   */
  const ausgabe =
    !ohneHost && anlegenZustand.ok && anlegenZustand.id !== quittiert ? anlegenZustand : null;

  const anlegenFehler = fehlerText(anlegenZustand);

  return (
    <div className={styles.seite} data-testid="files-zugangslinks">
      {ausgabe !== null && inboxBasis !== null && (
        <EinmaligeAusgabe
          token={ausgabe.token}
          inboxBasis={inboxBasis}
          qrDateiname={
            zeilen.find((z) => z.id === ausgabe.id)?.qrDateiname ?? QR_DATEINAME_ERSATZ
          }
          schliessen={() => setQuittiert(ausgabe.id)}
        />
      )}

      {/*
       * `nichtDrucken` NUR, solange die Ausgabe offen ist: sonst waere ein
       * Ausdruck der reinen Liste ein leeres Blatt.
       */}
      <div
        className={ausgabe !== null ? styles.nichtDrucken : undefined}
        data-testid="files-zugangslinks-rest"
      >
        <h1>Abgabelinks</h1>

        {ohneHost && (
          <Alert
            type="warning"
            showIcon
            data-testid="files-zugangslinks-kein-host"
            message="Abgabelinks sind noch nicht ausgebbar"
            description={KEIN_HOST_TEXT}
          />
        )}

        <div className={styles.knopfzeile}>
          {/* Kein `size`: `controlHeight` ist 56 und schon das richtige
              Touch-Masz; `size="large"` waeren 72px. */}
          <Button
            type="primary"
            disabled={ohneHost}
            data-testid="files-zugangslink-anlegen"
            onClick={() => setFormularOffen((offen) => !offen)}
          >
            Abgabelink anlegen
          </Button>
        </div>

        {formularOffen && !ohneHost && (
          <AnlegenFormular
            abschicken={anlegenAbschicken}
            fehler={anlegenFehler}
            werte={anlegenZustand.ok ? {} : anlegenZustand.values}
          />
        )}

        {zeilen.length === 0 ? (
          <Card data-testid="files-zugangslinks-leer">
            <p>Kein Abgabelink vorhanden.</p>
            <p className={styles.hinweis}>
              Ein Abgabelink erlaubt die anonyme Abgabe von Dateien — mit Laufzeit und Budget, ohne
              Anmeldung. Der Code wird einmal ausgegeben.
            </p>
          </Card>
        ) : (
          <Table<ZugangslinkZeile>
            rowKey="id"
            dataSource={zeilen}
            columns={spalten(inboxBasis)}
            pagination={false}
            /*
             * `max-content` ist die einzige ehrliche Angabe, weil die Spalten
             * keine `width` tragen — jede Pixelzahl waere erfunden. Und KEINE
             * Spalte traegt `fixed` oder `ellipsis`, `scroll.y` ist nicht
             * gesetzt: rc-table schaltet sonst auf `table-layout: fixed`,
             * verteilt die Spalten gleichmaeszig und das DESKTOP-Bild aendert
             * sich, ohne dass irgendwo etwas ueberlaeuft
             * (`lib/Table.js:426-442`). Diese Ansicht hat KEINE Kartenliste —
             * §8.6 nennt sie nur fuer `/posteingang` —, die Tabelle ist unter
             * 768px also sichtbar und muss scrollen statt umzubrechen.
             */
            scroll={{ x: "max-content" }}
          />
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

function spalten(inboxBasis: string | null) {
  return [
    { key: "name", title: "Bezeichnung", dataIndex: "name" },
    {
      key: "token",
      title: "Code",
      render: (_: unknown, zeile: ZugangslinkZeile) => (
        // Mit Auslassungszeichen, damit niemand die sieben Zeichen fuer den
        // ganzen Code haelt und sie abzuschreiben versucht.
        <span className={styles.zahlen}>{zeile.tokenStart}…</span>
      ),
    },
    {
      key: "laufzeit",
      title: "Laufzeit",
      render: (_: unknown, zeile: ZugangslinkZeile) => (
        <div>
          <div className={styles.zahlen}>{zeile.laufzeitText}</div>
          <div className={styles.hinweis}>bis {zeile.ablaufText}</div>
        </div>
      ),
    },
    {
      key: "restbudget",
      title: "Restbudget",
      render: (_: unknown, zeile: ZugangslinkZeile) => (
        <div className={styles.budgetZelle}>
          <span className={styles.zahlen}>
            {zeile.restDateien} von {zeile.budgetDateien} Dateien
          </span>
          <span className={styles.zahlen}>
            {zeile.restBytesText} von {zeile.budgetBytesText}
          </span>
          {/*
           * DER EINSTIEG STEHT AM ZUSTAND (§8.4, §8.6): „aufstocken" ohne die
           * Zahl daneben waere eine Aktion ohne ihren Anlass. Nur bei gueltigen
           * Links — ein widerrufener soll durch Aufstocken nicht auferstehen,
           * ein abgelaufener nicht heimlich weiterleben; die Action lehnt beides
           * ohnehin ab, aber ein Knopf, der immer scheitert, ist eine Sackgasse.
           */}
          {zeile.zustand === "gueltig" && <AufstockenFeld zeile={zeile} />}
        </div>
      ),
    },
    {
      key: "zustand",
      title: "Zustand",
      render: (_: unknown, zeile: ZugangslinkZeile) => <span>{ZUSTAND_TEXT[zeile.zustand]}</span>,
    },
    {
      key: "uploads",
      title: "Uploads",
      render: (_: unknown, zeile: ZugangslinkZeile) => (
        <span className={styles.zahlen}>{zeile.uploads}</span>
      ),
    },
    {
      key: "aktionen",
      title: "",
      render: (_: unknown, zeile: ZugangslinkZeile) => (
        <div className={styles.knopfzeile}>
          {zeile.zustand !== "widerrufen" && <WiderrufenKnopf zeile={zeile} />}
          {inboxBasis !== null && zeile.zustand === "gueltig" && (
            // Kein Rohtoken mehr vorhanden — der QR-Weg endet hier bewusst.
            // Was bleibt, ist die Kontrolle des Budgets und der Widerruf.
            <span className={styles.hinweis}>Code nur einmal ausgegeben</span>
          )}
        </div>
      ),
    },
  ];
}

// ---------------------------------------------------------------------------

function AnlegenFormular({
  abschicken,
  fehler,
  werte,
}: {
  abschicken: (formData: FormData) => void;
  fehler: string | null;
  werte: Record<string, string>;
}) {
  return (
    <Card title="Neuen Abgabelink anlegen">
      {/*
       * Ein echtes `<form action={…}>`: die Eingaben ueberleben einen
       * Serverfehler, und der Fehler kommt AM FELD an statt auf einer
       * technischen Fehlerseite mit Datenverlust (§10.1).
       */}
      <form action={abschicken} className={styles.seite}>
        <label>
          Bezeichnung
          <Input name="name" defaultValue={werte.name ?? ""} placeholder="Übung Nord 30.07." />
        </label>
        <label>
          Laufzeit in ganzen Stunden (1–72)
          <Input
            name="laufzeitStunden"
            inputMode="numeric"
            defaultValue={werte.laufzeitStunden ?? "24"}
          />
        </label>
        <label>
          Budget Dateien (leer = Vorbelegung)
          <Input name="budgetDateien" inputMode="numeric" defaultValue={werte.budgetDateien ?? ""} />
        </label>
        <label>
          Budget Bytes (leer = Vorbelegung)
          <Input name="budgetBytes" inputMode="numeric" defaultValue={werte.budgetBytes ?? ""} />
        </label>
        {fehler !== null && <span className={styles.feldFehler}>{fehler}</span>}
        <div className={styles.knopfzeile}>
          <Button type="primary" htmlType="submit" data-testid="files-zugangslink-absenden">
            Anlegen
          </Button>
        </div>
      </form>
    </Card>
  );
}

// ---------------------------------------------------------------------------

function EinmaligeAusgabe({
  token,
  inboxBasis,
  qrDateiname,
  schliessen,
}: {
  token: string;
  inboxBasis: string;
  qrDateiname: string;
  schliessen: () => void;
}) {
  const adresse = `${inboxBasis}/u/${token}`;
  const qrAdresse = `${inboxBasis}/api/u/${token}/qr.png`;

  return (
    <section
      className={`${styles.ausgabe} ${styles.druckbereich}`}
      data-testid="files-zugangslink-ausgabe"
    >
      <h2>Abgabelink — jetzt notieren oder ausdrucken</h2>
      <p className={styles.hinweis}>
        Dieser Code wird nur dieses eine Mal angezeigt. Danach ist er nirgends mehr abrufbar — wer
        ihn verliert, legt einen neuen Abgabelink an.
      </p>
      <p className={styles.token}>{token}</p>
      <a className={styles.link} data-testid="files-zugangslink-link" href={adresse}>
        {adresse}
      </a>
      {/*
       * Absolute Adresse auf die INBOX-Domain. Der `<img>`-Abruf traegt das
       * Sitzungs-Cookie mit, weil es ueber `AUTH_COOKIE_DOMAIN` auf der
       * gemeinsamen Elterndomain sitzt — die Route ist gegatet (§8.7).
       *
       * eslint-disable-next-line @next/next/no-img-element — `next/image` haette
       * hier zwei Fehler auf einmal: es braeuchte einen `remotePatterns`-Eintrag
       * in `next.config.ts` fuer die Inbox-Domain (eine Datei, die dieses Modul
       * nichts angeht), und es liefe ueber den Optimierer der VERWALTUNGS-Domain
       * — ein zweiter, ungegateter Weg zu einer gegateten Nutzlast. Ein PNG von
       * 512px ist ausserdem genau die Groesse, die es sein soll; der Optimierer
       * hat hier nichts zu tun. Dieselbe Entscheidung wie in
       * `feedback/_ui/QrGross.tsx:75-80`.
       */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className={styles.qr}
        data-testid="files-zugangslink-qr"
        src={qrAdresse}
        alt={`QR-Code für den Abgabelink ${token}`}
        width={220}
        height={220}
      />
      <div className={`${styles.knopfzeile} ${styles.druckAus}`}>
        {/*
         * `?w=1024` fuer den Ausdruck, `?dl=1` fuer den Download — und das ist
         * der GANZE Vertrag: die Route liest ausschliesslich `w` (geklemmt auf
         * 2048) und `dl` (`api/u/[token]/qr.png/route.ts`). Jeder weitere
         * Parameter waere eine Zusage, die niemand einloest.
         *
         * DEN DOWNLOAD MACHT DIE ROUTE, NICHT DAS ATTRIBUT. `download` wird bei
         * FREMDER Herkunft ignoriert, und fremd ist die Herkunft hier nicht
         * zufaellig, sondern per Konfiguration garantiert: die Route liegt auf
         * der Inbox-Domain, und `validateFilesHosts` verbietet, dass beide
         * Rollen denselben Host tragen (`_lib/hostRolle`). Wirksam ist `?dl=1`:
         * darauf antwortet die Route mit `Content-Disposition: attachment` und
         * dem Namen aus der DATENBANK (§8.7, Dateiname nach §7.9). Ohne diesen
         * Parameter bleibt dieselbe Adresse das reine Bild — das `<img>` oben
         * und die Druckansicht haengen daran.
         *
         * `target="_blank"` BLEIBT TRAGEND, auch mit dem Download. Eine Antwort
         * mit `attachment` laesst den Tab normalerweise stehen — aber
         * „normalerweise" ist hier zu wenig: rendert die Antwort wider Erwarten
         * doch (verschluckte Kopfzeile, Zwischenspeicher, Proxy), navigierte der
         * Browser im selben Tab weg, diese Insel floege aus dem Baum,
         * `useActionState` finge wieder bei `ANLEGEN_START` an — und der
         * Rohtoken waere vernichtet, ohne dass ihn jemand notiert hat (§4.7).
         * Der Zurueck-Knopf braechte eine Seite OHNE Token.
         *
         * `download` bleibt daneben stehen: es kostet nichts, greift sofort,
         * falls die Ansicht je auf denselben Host wandert, und traegt denselben
         * Namen wie die Kopfzeile — beide leiten ihn ueber `entschaerfeTitel`
         * aus `zugangslinks.name` ab (§7.9), diese Seite in `page.tsx`, die
         * Route selbst aus der Zeile.
         */}
        <Button
          href={`${qrAdresse}?w=1024&dl=1`}
          target="_blank"
          rel="noopener"
          download={qrDateiname}
          data-testid="files-zugangslink-png"
        >
          QR als PNG laden
        </Button>
        <Button data-testid="files-zugangslink-drucken" onClick={() => window.print()}>
          Drucken
        </Button>
        <Button
          type="primary"
          data-testid="files-zugangslink-ausgabe-schliessen"
          onClick={schliessen}
        >
          Schließen
        </Button>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------

function AufstockenFeld({ zeile }: { zeile: ZugangslinkZeile }) {
  const [zustand, abschicken, laeuft] = useActionState(kontingentAufstockenAction, FORM_START);
  const [offen, setOffen] = useState(false);
  const fehler = fehlerText(zustand);

  /*
   * DER ZWEITE KLICK IST KEINE WIEDERHOLUNG, SONDERN EINE ZWEITE AUFSTOCKUNG:
   * `kontingentAufstockenAction` schreibt `budget + <zusatz>` und ist damit
   * NICHT idempotent. Erfolg meldet sie bewusst ohne Text (`return { ok: true }`),
   * und das Restbudget darueber aendert sich ueber `revalidatePath` nur um ein
   * paar Ziffern in derselben Zelle — wer nicht sieht, dass etwas passiert ist,
   * klickt noch einmal. Das geschlossene Feld IST die Quittung.
   *
   * Nur bei `ok`: ein Fehler muss das Formular offen lassen, sonst waere mit ihm
   * auch die Eingabe weg.
   *
   * KEIN `useEffect`. React nennt genau diesen Fall „adjusting state when a prop
   * changes" und will ihn WAEHREND des Renderns erledigt haben; ein Effekt waere
   * eine zweite Renderrunde und ist im Projekt Lint-FEHLER
   * (`react-hooks/set-state-in-effect`). Der zuletzt gesehene Zustand muss dabei
   * gemerkt werden, weil `useActionState` sein `ok` nie zuruecknimmt — ohne den
   * Vergleich bliebe das Feld nach dem ersten Erfolg fuer immer zu.
   */
  const [gesehen, setGesehen] = useState(zustand);
  if (gesehen !== zustand) {
    setGesehen(zustand);
    if (zustand.ok) setOffen(false);
  }

  return (
    <>
      {/* `size="small"` ist INNERHALB von Tabellenzeilen erlaubt und hier
          noetig: eine 56px-Zeilenaktion sprengt die Zeile. */}
      <Button
        size="small"
        data-testid={`files-zugangslink-aufstocken-${zeile.id}`}
        onClick={() => setOffen((auf) => !auf)}
      >
        Kontingent aufstocken
      </Button>
      {offen && (
        <form action={abschicken} className={styles.aufstockenFormular}>
          <input type="hidden" name="id" value={zeile.id} />
          {/*
           * ZUWACHS, nicht neue Summe — die Feldnamen sagen es. Eine absolute
           * Zahl liesze sich versehentlich NACH UNTEN setzen, mitten in einem
           * laufenden Vorgang, und das `UPDATE` koennte einen gleichzeitigen
           * Upload ueberschreiben.
           */}
          <Input
            size="small"
            name="zusatzDateien"
            inputMode="numeric"
            aria-label={`Zusätzliche Dateien für ${zeile.name}`}
            placeholder="+ Dateien"
          />
          <Input
            size="small"
            name="zusatzBytes"
            inputMode="numeric"
            aria-label={`Zusätzliche Bytes für ${zeile.name}`}
            placeholder="+ Bytes"
          />
          {/* Waehrend der Vorgang laeuft, ist der Knopf gesperrt — siehe oben:
              ein zweiter Absender addierte ein zweites Mal. */}
          <Button
            size="small"
            htmlType="submit"
            loading={laeuft}
            disabled={laeuft}
            data-testid={`files-zugangslink-aufstocken-absenden-${zeile.id}`}
          >
            Aufstocken
          </Button>
          {fehler !== null && <span className={styles.feldFehler}>{fehler}</span>}
        </form>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------

function WiderrufenKnopf({ zeile }: { zeile: ZugangslinkZeile }) {
  const [zustand, abschicken] = useActionState(zugangslinkWiderrufenAction, FORM_START);
  const formular = useRef<HTMLFormElement>(null);
  const fehler = fehlerText(zustand);

  return (
    <form action={abschicken} ref={formular}>
      <input type="hidden" name="id" value={zeile.id} />
      <Popconfirm
        title="Abgabelink widerrufen?"
        description={`„${zeile.name}" nimmt danach keine Abgaben mehr an. Die Zeile bleibt mit ihrem Uploads-Zähler in der Liste.`}
        okText="Widerrufen"
        cancelText="Abbrechen"
        onConfirm={() => formular.current?.requestSubmit()}
      >
        {/*
         * `danger` OHNE `type="primary"`: `colorError === colorPrimary ===
         * #c8000f`, ein roter Vollknopf waere pixelgleich mit einer
         * Primaeraktion. Rot bleibt am Rand.
         */}
        <Button size="small" danger data-testid={`files-zugangslink-widerrufen-${zeile.id}`}>
          Widerrufen
        </Button>
      </Popconfirm>
      {fehler !== null && <span className={styles.feldFehler}>{fehler}</span>}
    </form>
  );
}
