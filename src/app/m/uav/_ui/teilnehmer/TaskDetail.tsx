"use client";

import { useState } from "react";
import Link from "next/link";
import { datumKurz } from "../../_lib/datum";
import type { TaskDTO } from "../../_lib/typen";
import { type AufgabenFortschritt, type Durchfuehrung, aufgabenStatus } from "../offline/progress";
import { AnzahlFeld } from "./AnzahlFeld";
import { CodeHinweis } from "./CodeHinweis";
import { DurchfuehrungForm } from "./DurchfuehrungForm";
import styles from "./uav.module.css";

type Props = {
  aufgabe: TaskDTO;
  fortschritt: AufgabenFortschritt;
  heute: string;
  /**
   * Ohne Code: Beschreibung, Schritte, Lernziel und Hinweise bleiben lesbar,
   * alles Erfassende verschwindet (Betreiberentscheidung 2026-08-29, siehe
   * `TeilnehmerApp.tsx`) — Zielanzahl, „nicht anwendbar", die Liste der
   * Durchführungen und das Formular. An ihrer Stelle steht der Hinweis, wofür
   * ein Code gebraucht wird.
   */
  nurLesen?: boolean;
  onAdd: (eintrag: Omit<Durchfuehrung, "id">) => void;
  onRemove: (eintragId: string) => void;
  onZielanzahl: (ziel: number) => void;
  onNichtAnwendbar: (wert: boolean) => void;
};

/**
 * Die Abbildung — und was passiert, wenn sie nicht kommt.
 *
 * `bildUrl` liegt als äußerer Pfad (`/m/uav/illustrations/<id>.webp`) in der
 * DB und wird unverändert als `<img src>` gerendert (kein `next/image`). Der
 * Pfad stimmt (`illustrationen.test.ts` prüft ihn gegen `public/`) — trotzdem
 * ist „das Bild kommt nicht" auf dieser Fläche der Normalfall und kein
 * Ausnahmefall: die Ansicht ist eine Offline-PWA, und im Funkloch ist eine
 * noch nie geladene Abbildung schlicht nicht da.
 *
 * OHNE RÜCKFALL STAND DANN DER ALTERNATIVTEXT ALS FLIESSTEXT über drei Zeilen
 * mitten in der Aufgabe und las sich wie ein Absatz, den jemand vergessen hat
 * — nicht wie ein fehlendes Bild. Stattdessen: eine ruhige Fläche in der
 * Größenordnung des Bildes mit einem Satz, der sagt, was los ist.
 *
 * Der Alternativtext selbst nennt nur noch Aufgabe und Motiv. Das Lernziel
 * stand zusätzlich darin und steht ohnehin als eigener Absatz auf derselben
 * Seite: doppelt vorgelesen, und im Fehlerfall 400 Zeichen Fließtext.
 */
function Illustration({ src, alt }: { src: string; alt: string }) {
  const [fehlt, setFehlt] = useState(false);
  if (fehlt) {
    return (
      <p className={styles["detail-bild-leer"]}>
        Abbildung nicht verfügbar — sie lädt nach, sobald du wieder Netz hast.
      </p>
    );
  }
  return (
    <img
      className={styles["detail-bild"]}
      src={src}
      loading="lazy"
      alt={alt}
      onError={() => setFehlt(true)}
    />
  );
}

/**
 * Port aus uav-praxis/src/components/TaskDetail.tsx — „← Übersicht" ist ein
 * echter `next/link` auf `/` statt eines `onBack`-Callbacks (die Route trägt
 * die Navigation, nicht die Komponente).
 */
export function TaskDetail({
  aufgabe,
  fortschritt,
  heute,
  nurLesen = false,
  onAdd,
  onRemove,
  onZielanzahl,
  onNichtAnwendbar,
}: Props) {
  const status = aufgabenStatus(fortschritt);
  const istTeil23 = aufgabe.teil !== 1;
  const bild = aufgabe.bildUrl ?? null;

  return (
    <article>
      <Link href="/" className={styles.zurueck}>
        ← Übersicht
      </Link>

      <p className={styles.eyebrow}>Aufgabe {aufgabe.nummer}</p>
      <h2 className={styles["detail-titel"]}>{aufgabe.titel}</h2>

      {/* `key`: ein Aufgabenwechsel setzt den Fehlerzustand der Abbildung zurück. */}
      {bild && <Illustration key={bild} src={bild} alt={`Illustration zu „${aufgabe.titel}“`} />}

      <ol className={styles.schritte}>
        {aufgabe.schritte.map((s, i) => (
          <li key={i}>{s}</li>
        ))}
      </ol>

      <p className={styles.lernziel}>{aufgabe.lernziel}</p>

      {aufgabe.durchfuehrungshinweise.length > 0 && (
        <section className={styles.hinweise}>
          <h3 className={styles["sektion-titel"]}>Durchführungshinweise</h3>
          <ul>
            {aufgabe.durchfuehrungshinweise.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </section>
      )}

      {aufgabe.sicherheitshinweise.length > 0 && (
        <div className={styles.warnung} role="note">
          <strong className={styles["warnung-titel"]}>Sicherheitshinweise</strong>
          <ul>
            {aufgabe.sicherheitshinweise.map((h, i) => (
              <li key={i}>{h}</li>
            ))}
          </ul>
        </div>
      )}

      {nurLesen && <CodeHinweis />}

      {!nurLesen && istTeil23 && (
        <label className={styles["na-toggle"]}>
          <input
            type="checkbox"
            checked={fortschritt.nichtAnwendbar}
            onChange={(e) => onNichtAnwendbar(e.target.checked)}
          />
          <span>Nicht anwendbar (nicht mit unserem Einsatzsystem umsetzbar)</span>
        </label>
      )}

      {!nurLesen && !fortschritt.nichtAnwendbar && (
        <section className={styles.erfassung}>
          <header className={styles["erfassung-kopf"]}>
            <h3 className={styles["sektion-titel"]}>
              Durchführungen {fortschritt.durchfuehrungen.length} / {fortschritt.zielanzahl}
            </h3>
            {status === "erledigt" && <span className={styles["erledigt-marke"]}>erledigt</span>}
          </header>

          <label className={`${styles.feld} ${styles.ziel}`}>
            <span className={styles["feld-label"]}>Zielanzahl</span>
            <AnzahlFeld value={fortschritt.zielanzahl} min={1} onValueChange={onZielanzahl} />
          </label>

          {fortschritt.durchfuehrungen.length === 0 ? (
            <p className={styles["liste-leer"]}>Noch keine Durchführung erfasst.</p>
          ) : (
            <ul className={styles.liste}>
              {fortschritt.durchfuehrungen.map((d) => (
                <li key={d.id}>
                  <span className={styles["liste-text"]}>
                    {/* Deutsches Datum statt des ISO-Werts aus der Datenbank —
                        `2026-01-13` liest im Training niemand als Datum. */}
                    <span className={styles["liste-datum"]}>{datumKurz(d.datum) || d.datum}</span>
                    <span className={styles["liste-team"]}>
                      {d.drohnensteuerer || "—"} / {d.luftraumbeobachter || "—"}
                    </span>
                  </span>
                  <button
                    type="button"
                    className={styles.loeschen}
                    onClick={() => {
                      if (window.confirm("Diese Durchführung wirklich löschen?")) onRemove(d.id);
                    }}
                    aria-label={`Durchführung vom ${datumKurz(d.datum) || d.datum} löschen`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}

          <h3 className={`${styles["sektion-titel"]} ${styles["erfassung-titel"]}`}>
            Neue Durchführung
          </h3>
          <DurchfuehrungForm onAdd={onAdd} heute={heute} />
        </section>
      )}
    </article>
  );
}
