"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { aufgabeUebernehmenAction, meineAufgabeAbgebenAction, meineAufgabeErledigtAction } from "../../_actions/mein";
import type { MeineAufgabe, MeineSeiteDaten } from "../../_lib/meinLink";
import type { MitgliederErgebnis } from "../../_lib/mitgliederAnzeige";
import s from "./mein.module.css";

/**
 * Die Seite hinter dem persönlichen Link: eigene Aufgaben abhaken, abgeben, offene übernehmen; die nächsten
 * Termine. Kein antd (öffentliche Gestaltung). Die Daten kommen vom Server; nach jeder Änderung lädt die Action
 * die Seite neu (`revalidatePath`), es gibt keinen zweiten Stand im Browser. Die Actions bekommen den Link und
 * die Aufgabe-ID und prüfen beides selbst.
 */
export function MeineSeite({ link, daten }: { link: string; daten: MeineSeiteDaten }) {
  const router = useRouter();
  const [zeigeErledigt, setZeigeErledigt] = useState(false);
  const [laeuft, starte] = useTransition();
  const [fehler, setFehler] = useState<{ id: string; text: string } | null>(null);

  const tue = (id: string, aktion: () => Promise<MitgliederErgebnis>) => {
    setFehler(null);
    starte(async () => {
      const r = await aktion();
      if (!r.ok) {
        setFehler({ id, text: r.fehler });
        if (r.linkUngueltig) router.refresh();
      }
    });
  };
  const fehlerBei = (id: string) => (fehler?.id === id ? <p className="go-fehler" role="alert">{fehler.text}</p> : null);
  const unter = (a: MeineAufgabe) => (
    <span className={s.neben}>
      {a.vorhaben}
      {a.wann ? <> · <span className={a.dringend ? s.dringend : undefined}>{a.wann}</span></> : null}
    </span>
  );

  return (
    <>
      <h1 className="go-titel">Hallo {daten.vorname}</h1>

      {daten.verantwortlich.length > 0 ? (
        <div className={`${s.karte} ${s.hinweis}`}>
          Du bist verantwortlich für{" "}
          {daten.verantwortlich.map((t, i) => <span key={i}>{i ? ", " : ""}<b>{t}</b></span>)}.
        </div>
      ) : null}

      <section className={s.karte} aria-labelledby="mein-aufgaben">
        <h2 id="mein-aufgaben">Deine Aufgaben</h2>
        {daten.offen.length === 0 ? <p className={s.leise}>Gerade nichts offen. Danke!</p> : null}
        <ul className={s.liste}>
          {daten.offen.map((a) => (
            <li key={a.id}>
              <button
                type="button"
                className={s.haken}
                aria-label={`„${a.titel}“ erledigt`}
                disabled={laeuft}
                onClick={() => tue(a.id, () => meineAufgabeErledigtAction(link, a.id, true))}
              />
              <div className={s.text}>
                <b>{a.titel}</b>
                {unter(a)}
                <button
                  type="button"
                  className={`${s.linkKnopf} ${s.linkKnopfKlein}`}
                  disabled={laeuft}
                  onClick={() => tue(a.id, () => meineAufgabeAbgebenAction(link, a.id))}
                >
                  Schaffe ich doch nicht
                </button>
                {fehlerBei(a.id)}
              </div>
            </li>
          ))}
        </ul>
        {daten.erledigt.length > 0 ? (
          <>
            <button type="button" className={s.linkKnopf} aria-expanded={zeigeErledigt} onClick={() => setZeigeErledigt(!zeigeErledigt)}>
              {zeigeErledigt ? "Erledigte ausblenden" : `Erledigt (${daten.erledigt.length}) anzeigen`}
            </button>
            {zeigeErledigt ? (
              <ul className={`${s.liste} ${s.erledigt}`}>
                {daten.erledigt.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={`${s.haken} ${s.hakenAn}`}
                      aria-label={`„${a.titel}“ wieder offen`}
                      disabled={laeuft}
                      onClick={() => tue(a.id, () => meineAufgabeErledigtAction(link, a.id, false))}
                    >
                      <Icons8Ikone name="checkmark" groesse={22} />
                    </button>
                    <div className={s.text}>
                      <b>{a.titel}</b>
                      <span className={s.neben}>{a.vorhaben}</span>
                      {fehlerBei(a.id)}
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </>
        ) : null}
      </section>

      <section className={s.karte} aria-labelledby="mein-gebraucht">
        <h2 id="mein-gebraucht">Hier wird noch jemand gebraucht</h2>
        {daten.gebraucht.length === 0 ? (
          <p className={s.leise}>Alles verteilt.</p>
        ) : (
          <ul className={s.liste}>
            {daten.gebraucht.map((a) => (
              <li key={a.id}>
                <div className={s.text}>
                  <b>{a.titel}</b>
                  {unter(a)}
                  {fehlerBei(a.id)}
                </div>
                <button
                  type="button"
                  className={s.knopfZweit}
                  aria-label={`„${a.titel}“ übernehmen: Ich mach’s`}
                  disabled={laeuft}
                  onClick={() => tue(a.id, () => aufgabeUebernehmenAction(link, a.id))}
                >
                  Ich mach’s
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={s.karte} aria-labelledby="mein-termine">
        <h2 id="mein-termine">Nächste Termine</h2>
        {daten.termine.length === 0 ? (
          <p className={s.leise}>Gerade steht kein Termin an.</p>
        ) : (
          <ul className={s.liste}>
            {daten.termine.map((t) => (
              <li key={t.id}>
                <div className={s.datum} aria-hidden="true">
                  <span>{t.monat}</span>
                  <b>{t.tag}</b>
                  <span>{t.wochentag}</span>
                </div>
                <div className={s.text}>
                  <b>{t.titel}</b>
                  <span className={s.vorlesen}>{`${t.wochentag}, ${t.tag}. ${t.monat}`}</span>
                  <span className={s.neben}>{t.zeit}{t.ort ? ` · ${t.ort}` : ""}</span>
                  {t.dabei ? <span className={s.dabei}>Du bist dabei</span> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className={s.datenschutz}>
        Gib diesen Link nicht weiter.
      </p>
    </>
  );
}
