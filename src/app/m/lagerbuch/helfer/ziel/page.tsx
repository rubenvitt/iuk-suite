import { cookies } from "next/headers";
import { requireHelferSitzung } from "../../_lib/helferZugang";
import { fahrzeugListe } from "../../_lib/lesepfade/fahrzeuge";
import { gemerktesZiel } from "../../_lib/lesepfade/entnahmeZiel";
import { ZIEL_COOKIE, wahlWert } from "../../_lib/entnahmeZiel";
import { einheitenartLabel } from "../../_lib/konstanten";
import { sanitizeReturnTo } from "../../_lib/returnTo";
import { waehleEntnahmeZiel } from "../../_actions/entnahmeZiel";
import { getDb } from "../../_db/client";
import { HelferRahmen } from "../../_ui/HelferRahmen";
import { sitzungsEtikett, zugangsKennung } from "../../_lib/zugangHerkunft";
import s from "../../_ui/helfer.module.css";

/**
 * DIE ZIELWAHL AM REGAL — DRK-300.
 *
 * ⚠️ „KEIN FAHRZEUG — VERBRAUCH" IST EINE ZEILE IN DERSELBEN LISTE, kein
 * Abbrechen und kein Leerlassen. Das ist die Betreiberentscheidung des Tickets:
 * Verbrauch wird GEWÄHLT. Ein Ablauf, in dem man das Ziel durch Nichtstun
 * überspringt, bucht bei jedem Vergessen am falschen Ort — und niemand merkt es.
 *
 * ⚠️ EINE RADIOGRUPPE, KEINE KNOPFREIHE — `docs/design/README.md` verlangt sie
 * „ohne Ausnahme": ein Tabstop für die ganze Gruppe, Pfeiltasten wählen nativ.
 * Als Reihe von Absendeknöpfen wäre jedes Fahrzeug ein eigener Tabstop, und
 * dass die Wahlen einander ausschließen, stünde nirgends — für Tastatur und
 * Screenreader der Unterschied zwischen „eine Wahl" und „fünf unverbundene
 * Schalter". Der Preis ist ein zweiter Handgriff (wählen, dann übernehmen);
 * die Regel kennt dafür keine Ausnahme, und am Regal ist der Knopf groß.
 *
 * ⚠️ EIN FORMULAR MIT SERVER ACTION, kein Link. Eine Server Component kann kein
 * Cookie setzen (`cookies()` ist dort versiegelt); die Wahl muss also durch
 * eine Server Action. Ein Link auf einen GET-Handler täte es auch — und wäre
 * ein zustandsändernder GET, den jeder Prefetch auslöst.
 *
 * ⚠️ KEIN antd UND KEIN `@ant-design/icons` (Fallen 1 und 7). Der Helfer-Weg
 * ist bewusst antd-frei; er rendert auf einem privaten Telefon in einer Sitzung
 * ohne Konto, und seine Bediendichte ist 56/72, nicht die der Verwaltung.
 *
 * ⚠️ HOST- UND SITZUNGSRIEGEL: `requireHelferSitzung` ruft `requireLagerbuchHost`
 * INTERN als erste Anweisung (Global Constraint 24) — er wird hier NICHT noch
 * einmal gerufen. Dass diese Seite den Riegel überhaupt selbst ruft, obwohl
 * `helfer/layout.tsx` ihn trägt, hat denselben Grund wie bei `helfer/page.tsx`:
 * ein Layout kann einer Seite keine Props reichen, und `sitzungsetikett` und
 * `laeuftAb` kommen von dort.
 */
export const dynamic = "force-dynamic";

export default async function ZielSeite({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const db = getDb();
  const zugang = await requireHelferSitzung(db);

  /*
   * Der Rückweg wird HIER gesäubert und wandert gesäubert ins Formular — die
   * Action säubert ihn ein zweites Mal. Das ist keine doppelte Arbeit aus
   * Misstrauen: das Formularfeld ist von außen frei setzbar, die Action ist
   * also ohnehin die tragende Prüfung. Hier steht sie, damit auf dem Schirm
   * nicht ein Weg angeboten wird, den die Action danach verwirft.
   */
  const zurueck = sanitizeReturnTo((await searchParams).returnTo) ?? "/helfer";

  const aktuell = gemerktesZiel(db, (await cookies()).get(ZIEL_COOKIE)?.value, zugangsKennung(zugang));
  // Der Vergleichswert entsteht aus DERSELBEN Funktion, die die Knöpfe füllt —
  // eine zweite Schreibweise hier markierte die aktuelle Wahl still nicht mehr.
  const aktuellerWert = aktuell === null ? null : wahlWert(aktuell);

  // NUR AKTIVE: ein stillgelegtes Fahrzeug anzubieten hieße, eine Wahl
  // anzubieten, die die Buchung danach ablehnt.
  const fahrzeuge = fahrzeugListe(db).filter((f) => f.aktiv);

  const wahlen: { wert: string; name: string; meta: string | null }[] = [
    { wert: "verbrauch", name: "Keine Einheit — Verbrauch", meta: "Das Material wird verbraucht, nicht eingeräumt" },
    /*
     * ⚠️ DIE META-ZEILE NENNT DIE ART, NICHT NUR DIE KENNUNG (DRK-309,
     * Reviewrunde 2). Eine Tasche traegt kein Kennzeichen — mit `meta:
     * f.kennung` stand fuer sie hier gar nichts, und zwei aehnlich benannte
     * Einheiten waren auf DIESEM Schirm nicht zu unterscheiden. Er ist der
     * teuerste Ort dafuer: die Wahl gilt fuer ALLE weiteren Entnahmen mit
     * diesem Kaertchen, eine falsche raeumt Material in den falschen Traeger.
     *
     * ⚠️ DIESELBE FORM WIE IN `_ui/FahrzeugWahl.tsx` („Art · Kennung"). Zwei
     * Schreibweisen fuer dieselbe Zeile auf zwei Helferschirmen liessen den
     * Leser einen Unterschied vermuten.
     */
    ...fahrzeuge.map((f) => ({
      wert: `fz:${f.id}`,
      name: f.name,
      meta: [einheitenartLabel(f.einheitenart), f.kennung].filter(Boolean).join(" · "),
    })),
  ];

  return (
    <HelferRahmen
      aktiv="entnahme"
      sitzungsetikett={sitzungsEtikett(zugang)}
      laeuftAb={zugang.laeuftAb}
    >
      <div className={s.schirmKopf}>Ziel wählen</div>
      {/*
        ⚠️ DER SATZ NENNT DAS KÄRTCHEN NUR, WENN ES EINS GIBT (DRK-305). Die
        Wahl hängt an `zugangsKennung(zugang)` — beim Kärtchen dessen Zeilen-Id,
        beim angemeldeten Konto der OIDC-`sub`. „Mit diesem Kärtchen" wäre für
        eine angemeldete Person nicht nur unhöflich, sondern falsch: sie
        beschriebe eine Bindung an etwas, das diese Person nie in der Hand
        hatte, und der Satz ist die einzige Stelle, an der der Schirm die
        Reichweite der Wahl überhaupt erklärt.
      */}
      <p className={s.fussnote}>
        {zugang.herkunft === "token"
          ? "Die Wahl gilt für alle weiteren Entnahmen mit diesem Kärtchen und lässt sich jederzeit ändern."
          : "Die Wahl gilt für alle weiteren Entnahmen in deiner Anmeldung und lässt sich jederzeit ändern."}
      </p>

      <form action={waehleEntnahmeZiel} data-rolle="ziel-formular">
        <input type="hidden" name="returnTo" value={zurueck} />
        {/*
          ⚠️ DIE HERKUNFT FÄHRT MIT, WEIL DIE ACTION SIE NICHT MEHR ERFRAGEN
          KANN (DRK-305). Fällt der Zugang zwischen Rendern und Absenden aus,
          sieht `waehleEntnahmeZiel` nur noch „kein Kärtchen, kein Konto" — ein
          abgelaufenes Auth.js-Cookie ist dort von „war nie angemeldet" nicht zu
          trennen. Ohne dieses Feld landete jede angemeldete Person auf dem Gate
          mit dem Satz „Scanne das Kärtchen erneut", also einer Aufforderung ins
          Leere. Das Feld entscheidet AUSSCHLIESSLICH diesen Satz; die
          Begründung, warum das trotz freier Setzbarkeit trägt, steht in der
          Action.
        */}
        <input type="hidden" name="herkunft" value={zugang.herkunft} />

        {/*
          `fieldset`/`legend` sind das, was die Gruppe für Hilfstechnik zur
          Gruppe macht: die Legende wird zu jedem Knopf mit angesagt. Sie ist
          hier sichtbar — der Schirmkopf oben sagt dasselbe, aber ein
          `fieldset` ohne `legend` ist eine Gruppe ohne Namen.
        */}
        <fieldset className={s.karte} style={{ border: "1px solid var(--lb-linie)", padding: 0, margin: 0 }}>
          {/* Sichtbar steht die Frage schon im Schirmkopf; für die Vorlesehilfe
              braucht die Gruppe trotzdem einen eigenen Namen. */}
          <legend className={s.nurVorlesen}>Wohin geht das Material?</legend>
          {wahlen.map((w) => (
            /*
              Die ganze Zeile ist die Beschriftung — am Telefon wird nicht der
              12px-Kreis getroffen, sondern die Fläche daneben. Ein Radioknopf
              ohne zugeordnete Beschriftung wird überdies als „Optionsfeld"
              ohne Inhalt angesagt.
            */
            <label key={w.wert} className={`${s.zeile} ${s.zeileWahl}`} data-rolle="ziel-wahl">
              <input
                type="radio"
                name="ziel"
                value={w.wert}
                defaultChecked={w.wert === aktuellerWert}
                className={s.wahlKnopf}
              />
              <div className={s.zeileHaupt}>
                <div className={s.zeileName}>{w.name}</div>
                {/* Die Bedingung ist die Zusage: ein bedingungsloses Meta-Feld
                    wäre bei fehlender Kennung eine LEERE Zeile mit Abstand. */}
                {w.meta && <div className={s.zeileMeta}>{w.meta}</div>}
              </div>
            </label>
          ))}
        </fieldset>

        <button
          className={`${s.knopf} ${s.knopfTinte} ${s.knopfBreit}`}
          type="submit"
          style={{ marginTop: 10 }}
        >
          Ziel übernehmen
        </button>
      </form>
    </HelferRahmen>
  );
}
