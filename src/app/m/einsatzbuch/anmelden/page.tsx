/**
 * Die Anmeldeseite des Einsatzbuch-Rechners (Drahtvertrag Nr. 1, Plan Stufe 5 Task 4) — ohne
 * Suite-Chrome, außerhalb von `(verwaltung)`. Nur `Card`/`Result` (Falle 1) und eigenes Markup
 * mit eigenen CSS-Variablen (Falle 2, `anmelden.module.css`).
 *
 * Die Probe aus Task 4, Step 1 (`e2e/einsatzbuch-anbindung.spec.ts`) hat den Laufzeitweg schon bewiesen: externe
 * Weiterleitung auf `http://127.0.0.1:<port>/rueckruf…` aus einer Server Component, und der
 * Login-Umweg mit erhaltener Query. Die Fachlogik liegt in `_lib/anbindung/anmeldeseite.ts` —
 * dort auch die Begründung, warum NICHT `requireEinsatzbuchZugang` aus `_lib/zugang.ts` läuft.
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { Card, Result } from "antd";
import { zeitFormat } from "@/core/zeit";
import { getDb } from "../_db/client";
import { requireEinsatzbuchHost } from "../_lib/host";
import { ersetzenBestaetigenAction } from "../_actions/anmelden";
import { erzeugeCode } from "../_lib/anbindung/einmalcode";
import { aktiverEchterRechner } from "../_lib/anbindung/rechner";
import { anmeldePfad, anmeldezugang, leseAnmeldeparameter, rueckrufUrl } from "../_lib/anbindung/anmeldeseite";
import s from "./anmelden.module.css";

export const dynamic = "force-dynamic";

// Dieselbe Anzeigeform wie `_lib/anbindung/rechner.ts`s `ANZEIGE` — je Aufruf über die
// Suite-Zone aufgelöst (`zeitFormat`), nie ein `timeZone`-Literal auf Modulebene (CLAUDE.md).
const ANZEIGE = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default async function AnmeldenPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  requireEinsatzbuchHost(await headers());
  const sp = await searchParams;
  const p = leseAnmeldeparameter(sp);
  if (!p) {
    return (
      <div className={s.seite}>
        <Card className={s.karte}>
          <Result
            status="error"
            title="Anmeldung nicht möglich"
            subTitle="Die Adresse ist unvollständig. Starte die Anmeldung erneut am Einsatzbuch-Rechner."
          />
        </Card>
      </div>
    );
  }

  const zugang = await anmeldezugang(anmeldePfad(p));
  // Manifest `src/core/audit/page-coverage-manifest.json`: `excluded`, "Anmeldeumweg ohne
  // Sitzung; Audit per auditLoginRequired in _lib" — `anmeldezugang` hat die Zeile schon geschrieben.
  if (zugang.art === "anmelden") redirect(zugang.loginUrl);

  if (zugang.art === "kein_zugang") {
    return (
      <div className={s.seite}>
        <Card className={s.karte}>
          <Result
            status="warning"
            title="Kein Zugang zum Einsatzbuch"
            subTitle="Dein Konto ist nicht in der Gruppe für das Einsatzbuch. Bitte wende dich an die Leitung."
            extra={
              <a className={s.knopf} href={rueckrufUrl(p, { fehler: "kein_zugang" })}>
                Zurück zum Einsatzbuch-Rechner
              </a>
            }
          />
        </Card>
      </div>
    );
  }

  const db = getDb();
  if (p.einrichtung?.art === "echt") {
    const vorhanden = aktiverEchterRechner(db);
    if (vorhanden) {
      const einrichtung = p.einrichtung;
      return (
        <div className={s.seite}>
          <Card className={s.karte} title="Echten Rechner ersetzen?">
            <p className={s.absatz}>
              Es gibt bereits einen echten Rechner, eingerichtet am {ANZEIGE.format(vorhanden.eingerichtetAm)} von{" "}
              {vorhanden.eingerichtetVon} — ersetzen?
            </p>
            <p className={s.hinweis}>
              Der bisherige Rechner wird widerrufen und kann danach weder Stammdaten holen noch Anker melden.
            </p>
            <form action={ersetzenBestaetigenAction} className={s.formular}>
              <input type="hidden" name="port" value={p.port} />
              <input type="hidden" name="state" value={p.state} />
              <input type="hidden" name="challenge" value={p.challenge} />
              <input type="hidden" name="name" value={einrichtung.name} />
              <button type="submit" className={s.knopf}>Ersetzen</button>
            </form>
            <a className={s.knopfSekundaer} href={rueckrufUrl(p, { fehler: "abgebrochen" })}>Abbrechen</a>
          </Card>
        </div>
      );
    }
  }

  const name = zugang.viewer.name?.trim() ? zugang.viewer.name : zugang.viewer.id;
  const code = erzeugeCode(db, {
    challenge: p.challenge,
    sub: zugang.viewer.id,
    name,
    jetzt: new Date(),
    einrichtung: p.einrichtung ? { ...p.einrichtung, ersetzen: false } : null,
  });
  // Manifest: `excluded`, erfolgreiche Anmeldung ist keine Zugriffsentscheidung.
  redirect(rueckrufUrl(p, { code }));
}
