"use client";

import Link from "next/link";
import type { TaskDTO } from "../../_lib/typen";
import { type AufgabenFortschritt, type Durchfuehrung, aufgabenStatus } from "../offline/progress";
import { AnzahlFeld } from "./AnzahlFeld";
import { DurchfuehrungForm } from "./DurchfuehrungForm";
import styles from "./uav.module.css";

type Props = {
  aufgabe: TaskDTO;
  fortschritt: AufgabenFortschritt;
  heute: string;
  onAdd: (eintrag: Omit<Durchfuehrung, "id">) => void;
  onRemove: (eintragId: string) => void;
  onZielanzahl: (ziel: number) => void;
  onNichtAnwendbar: (wert: boolean) => void;
};

/**
 * Port aus uav-praxis/src/components/TaskDetail.tsx — „← Übersicht" ist ein
 * echter `next/link` auf `/` statt eines `onBack`-Callbacks (die Route trägt
 * die Navigation, nicht die Komponente).
 *
 * Bild: `bildUrl` aus dem Katalog wird unverändert als `<img src>` gerendert
 * (kein `next/image`) — der Wert liegt heute schon als äußerer Pfad
 * (`/m/uav/illustrations/<id>.webp`) in der DB (Task 18/19/20).
 */
export function TaskDetail({
  aufgabe,
  fortschritt,
  heute,
  onAdd,
  onRemove,
  onZielanzahl,
  onNichtAnwendbar,
}: Props) {
  const status = aufgabenStatus(fortschritt);
  const istTeil23 = aufgabe.teil !== 1;
  const bild = aufgabe.bildUrl ?? null;

  // Alt-Text: Titel + knappe Lernziel-/Motiv-Kurzfassung (§14), auf eine kurze,
  // gut vorlesbare Länge gekappt.
  const motiv = aufgabe.lernziel?.trim().replace(/\s+/g, " ") ?? "";
  const motivKurz = motiv.length > 120 ? `${motiv.slice(0, 117).trimEnd()}…` : motiv;
  const bildAlt = motivKurz
    ? `Illustration zu „${aufgabe.titel}“ – ${motivKurz}`
    : `Illustration zu „${aufgabe.titel}“`;

  return (
    <article>
      <Link href="/" className={styles.zurueck}>
        ← Übersicht
      </Link>

      <p className={styles.eyebrow}>Aufgabe {aufgabe.nummer}</p>
      <h2 className={styles["detail-titel"]}>{aufgabe.titel}</h2>

      {bild && <img className={styles["detail-bild"]} src={bild} loading="lazy" alt={bildAlt} />}

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

      {istTeil23 && (
        <label className={styles["na-toggle"]}>
          <input
            type="checkbox"
            checked={fortschritt.nichtAnwendbar}
            onChange={(e) => onNichtAnwendbar(e.target.checked)}
          />
          <span>Nicht anwendbar (nicht mit unserem Einsatzsystem umsetzbar)</span>
        </label>
      )}

      {!fortschritt.nichtAnwendbar && (
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

          <ul className={styles.liste}>
            {fortschritt.durchfuehrungen.map((d) => (
              <li key={d.id}>
                <span className={styles["liste-text"]}>
                  {d.datum} · {d.drohnensteuerer || "—"} / {d.luftraumbeobachter || "—"}
                </span>
                <button
                  type="button"
                  className={styles.loeschen}
                  onClick={() => {
                    if (window.confirm("Diese Durchführung wirklich löschen?")) onRemove(d.id);
                  }}
                  aria-label="Eintrag löschen"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>

          <DurchfuehrungForm onAdd={onAdd} heute={heute} />
        </section>
      )}
    </article>
  );
}
