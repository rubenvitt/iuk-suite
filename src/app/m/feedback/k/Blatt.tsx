import type { ReactNode } from "react";
import s from "../f/[slugSecret]/zettel.module.css";

/**
 * DAS BLATT VON „EHRLICH GESAGT" — dieselbe Fahne, derselbe Kopfrhythmus wie `Huelle` in
 * `f/[slugSecret]/Zustaende.tsx`, aber ohne Server-Importe: der Einwurf wechselt nach dem Absenden im Client
 * auf „Danke.", und dafür muss das Blatt auch dort renderbar sein. Die Schrift kommt als Klasse
 * (`NEWSREADER_KLASSE`) von der Seite.
 */
export function Blatt({
  titel,
  schrift,
  gross = false,
  vorTitel,
  kopf,
  children,
}: {
  titel: string;
  schrift: string;
  gross?: boolean;
  vorTitel?: ReactNode;
  kopf?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`${s.seite} ${schrift}`}>
      <div className={s.fahne} aria-hidden="true" />
      <div className={s.blatt}>
        <header className={`${s.kopf} ${s.aufbau}`}>
          <p className={s.kicker}>
            Ehrlich gesagt
            <span className={s.wortzeichen}>IDA</span>
          </p>
          {vorTitel}
          <h1 className={gross ? `${s.titel} ${s.gross}` : s.titel}>{titel}</h1>
          {kopf}
        </header>
        {children}
      </div>
    </div>
  );
}

/** Der Haken im Ring der Danke-Seite (gleiche Geometrie wie `DankeZeichen`). */
export function Haken() {
  return (
    <svg className={s.dankeZeichen} viewBox="0 0 52 52" role="presentation" aria-hidden="true" focusable="false">
      <circle className={s.dankeRing} cx="26" cy="26" r="25" />
      <path className={s.dankeHaken} d="M16.5 27 L23 33.5 L36 19" />
    </svg>
  );
}
