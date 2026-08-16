import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { getGroup } from "../../../_db/queries";
import { guardPage } from "../../../_lib/guardPage";
import { buildToken } from "../../../_lib/token";
import { teilnahmeUrlAus } from "../../../_ui/Teilnahme";
import { Drucken } from "./Drucken";

/**
 * DER AUSHANG (Entwurf §3.5) — das einzige Druckstück des Moduls.
 *
 * Es hängt Jahre an der Wand des Gruppenraums, denn der Code hängt an der
 * GRUPPE, nicht am Abend: die öffentliche Route löst immer die gerade aktive
 * Umfrage auf. Genau das sagt die Fußzeile auch.
 *
 * SERVER COMPONENT, kein antd-Compound (§4.13). Interaktiv ist einzig `Drucken`.
 * Kein `Card`, keine Kartenpolster: das Blatt IST die Fläche, `@page` setzt den
 * Rand (18mm).
 *
 * ZUGRIFF: das Layout hält den Modul-Riegel (`requireFeedbackAccess`), hier
 * kommt die zweite Linie — `guardPage(id)` gegen die Gruppen-Id. Beides ist
 * nötig, weil diese Seite das Gruppen-SECRET zeigt.
 *
 * `?w=1024` am QR-Endpunkt: er liefert ohne Parameter 512px, das sind auf 90mm
 * ~145 dpi und sichtbar ausgefranst. Die 90mm selbst stehen im CSS — die
 * Auflösung macht den Code scharf, nicht groß.
 *
 * KEINE NOTENDATEN und keine Notenfarben: der Aushang zeigt keine Ergebnisse. Er
 * ist die Einladung, nicht der Bericht.
 */
export default async function Aushang({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = await params;
  const id = Number(groupId);
  const { db } = await guardPage(id);
  const group = getGroup(db, id);
  if (!group) notFound();

  const token = buildToken(group.slug, group.secret);
  // Dieselbe EINE Herleitung wie im Cockpit (Vorrang `x-forwarded-host`, Regel
  // aus `core/routing.resolveHost`): eine zweite würde genau hier auseinander-
  // laufen, und dieses Blatt wird GEDRUCKT.
  const url = teilnahmeUrlAus(await headers(), token);

  return (
    <main className="fb-aushang">
      {/* Träger 1 von zwei für Suite-Rot: 3px-Fahne, randlos, nie als Fläche (§4.9). */}
      <div className="fb-aushang-fahne" aria-hidden="true" />
      <h1 className="fb-aushang-frage">Wie war der Dienstabend?</h1>
      <p className="fb-aushang-gruppe">{group.name}</p>
      <div className="fb-aushang-qr">
        {/*
         * `alt=""`: der Code trägt keine vorlesbare Information — die zugängliche
         * Entsprechung ist die Adresse direkt darunter. `next/image` hilft nicht:
         * die Quelle ist ein Route Handler je Gruppe, und die Größe steht in mm.
         */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/f/${token}/qr.png?w=1024`} alt="" />
      </div>
      <p className="fb-aushang-url">{url}</p>
      {/*
       * Was einen erwartet, in einer Zeile: 8 Noten + 6 freie Zeilen sind der
       * Standardfragebogen (`_lib/questions.ts`), und „etwa 2 Minuten" ist die
       * Zusage, die die Leute überhaupt zum Scannen bringt.
       */}
      <p className="fb-aushang-zeile">Anonym · 8 Noten, 6 freie Zeilen · etwa 2 Minuten</p>
      <footer className="fb-aushang-fuss">
        <span>Der Code gilt für alle Dienstabende.</span>
        {/* Träger 2 von zwei für Suite-Rot: das Wortzeichen. */}
        <span className="fb-aushang-wortzeichen">Sammelhaus</span>
      </footer>
      <Drucken />
    </main>
  );
}
