import Link from "next/link";
import type { ReactNode } from "react";
import { einplanenAnnehmenAction } from "../actions";
import { aufgabenFuerPerson, bufdis, rangGrenzen, routinenFuer } from "../_db/queries";
import type { AufgabeRow } from "../_db/schema";
import type { DB } from "../_db/client";
import { vorschlagOffen } from "../_lib/anzeige";
import {
  ausgewaehlterTag,
  fmtTagKurz,
  montagAusParam,
  wochenTage,
} from "../_lib/datum";
import { kartenGrunddaten } from "../_lib/kartendaten";
import type { Lage } from "../_lib/lage";
import { darfPlanAendern, type Akteur } from "../_lib/zugang";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { AnlassZone } from "./AnlassZone";
import { EinplanenInline } from "./EinplanenInline";
import { Fuehrungskarte } from "./Fuehrungskarte";
import { SeitenKopf } from "./SeitenKopf";
import { TagesWaehler } from "./TagesWaehler";
import { WochenWaehler } from "./WochenWaehler";
import { Wochenplan } from "./Wochenplan";
import s from "./aufgaben.module.css";

/*
 * „MEINE WOCHE" — DER BUFDI-EINSTIEG, NEU GEBAUT NACH DER OBERFLAECHEN-SPEC (2026-08-16 §3.4,
 * §5.1). Server Component (kein "use client") — sie liest `db` direkt, wie zuvor.
 *
 * DER AUFBAU IST FUER ALLE DREI EINSTIEGE DERSELBE (§3.4):
 *
 *   1 Seitenkopf              Brotkrume · <h1> · Wochenwaehler · Kontextzeile
 *   ─ data-testid="aufgaben-flaeche" ───────────────────────────────────────
 *   2 FUEHRUNGSKARTE          genau eine, immer da, der einzige Primaerknopf
 *   3 Die Flaeche der Rolle   hier: die Wochenachse — immer da, auch leer
 *   4 Die uebrigen Anlaesse   als Zonen, in Rangfolge, je mit Zahl, gedeckelt
 *   5 Fuss                    Querverweise als Textlinks
 *
 * WAS HIER VERSCHWUNDEN IST: die vier KPI-Kacheln (§1.4 — sie beantworteten „was gibt es", nicht
 * „was ist jetzt dran"; ihre Zahlen stehen jetzt in der Kontextzeile, EINSCHLIESSLICH der Nullen,
 * die dort als WORT geschrieben werden) und die beiden schreibgeschuetzten Sektionen
 * „Freigabe offen" / „Zurückgewiesen" mit ihren Ankern. Zurueckgewiesenes ist jetzt Rang 2 der
 * Leiter und damit entweder die Karte oder eine Zone; `freigabe_offen` faellt in keine Sprosse und
 * steht in seiner Tagesspalte bzw. in der Achsen-Fusszeile (§4.1, Restmenge).
 *
 * DER WOCHENWAEHLER STEHT IM `aktionen`-SLOT DES `SeitenKopf` UND DAMIT AUSSERHALB DES WRAPPERS
 * (§3.3, §5.1): der Zaehlriegel „hoechstens ein Primaerknopf" misst `aufgaben-flaeche`, und die
 * drei Wochenknoepfe sind Navigation, keine Handlung an einer Aufgabe.
 *
 * `tage` FUER DEN SELEKTOR IST DIE ANGEZEIGTE WOCHE, NICHT DIE LAUFENDE — eine bewusste Abweichung
 * von §4.5, ausgeschrieben in `page.tsx`. Sie haelt Kontextzeile, Achse und Achsen-Fusszeile
 * konsistent; der Preis steht dort.
 */
export function EinstiegBufdi({
  db,
  akteur,
  heute,
  lage,
  wocheParam,
  tagParam,
}: {
  db: DB;
  akteur: Akteur;
  heute: string;
  /** Der Zustands-Selektor, EINMAL in `page.tsx` gerufen (§4.1) — nie ein zweites Mal hier. */
  lage: Lage;
  wocheParam?: string;
  tagParam?: string;
}) {
  // Die Zeile eigens benannt: sie speist die reinen Anzeige- und Ladepfade (`aufgabenFuerPerson`,
  // `Wochenplan person=`). Die Rechtefragen unten stellen den `Akteur`.
  const person = akteur.person;
  const montag = montagAusParam(wocheParam, heute);
  const tage = wochenTage(montag);
  const mobilTag = ausgewaehlterTag(tage, heute, tagParam);

  const meineAufgaben = aufgabenFuerPerson(db, person.id);
  const meineRoutinen = routinenFuer(db, person.id);
  const andereBufdis = bufdis(db, heute).filter((b) => b.id !== person.id);

  // DASSELBE PRAEDIKAT WIE DIE ROUTE `/plan/[personId]` (`_lib/zugang.ts`) — auch fuer die EIGENE
  // Woche gilt: eine ausgeschiedene Person plant nichts mehr, auch nicht sich selbst.
  const zeigeAktionen = darfPlanAendern(akteur, person.id, heute);
  const rang = zeigeAktionen ? rangGrenzen(db, person.id, tage) : undefined;

  const grund = kartenGrunddaten(db, akteur, heute, lage);
  // WAS AM NAECHSTEN ARBEITSTAG LIEGT — der Zusatz der Ruhekarte (§4.2, Ruhe-Zeile). Er entsteht
  // hier und nicht im Selektor, weil er DARSTELLUNG ist: `lage()` liefert Daten, keine Saetze.
  const morgen =
    meineAufgaben.find(
      (a) => a.planDatum === grund.naechsterArbeitstag && a.status !== "abgeschlossen",
    ) ?? null;

  return (
    <>
      <SeitenKopf
        brotkrume={[{ label: "Aufgaben" }]}
        titel="Meine Woche"
        kontext={lage.kontext}
        aktionen={<WochenWaehler montag={montag} heute={heute} />}
      />

      <div data-testid="aufgaben-flaeche">
        <Fuehrungskarte
          lage={lage}
          heute={heute}
          eigenePersonId={person.id}
          verteilen={null}
          vertretungAnzahl={0}
          morgen={morgen}
          {...grund}
        />

        {/* ── 3 · DIE FLAECHE DER ROLLE: die Wochenachse, immer da, auch leer (Regel R2) ── */}
        <section style={{ marginBlockStart: SPACE.xl, marginBlockEnd: SPACE.xl }}>
          {/*
           * REGEL V, ERSTER TEIL (§3.4): liegt die gezeigte Woche ganz in der Vergangenheit, sagt
           * die Achse das — sonst sieht man Sonntagabend eine volle, gruene Woche und glaubt, man
           * sei durch. Das ist KEINE Zone: es ist ein Vorbehalt AUF der Achse, und deshalb faellt
           * es weder unter R3 noch unter „Leerzustand = die Zone weglassen".
           */}
          {lage.achsenVorbehalt?.abgeschlosseneWoche ? (
            <p style={{ ...SCHRIFT.neben, margin: `0 0 ${SPACE.xs}px` }}>
              Abgeschlossene Woche
            </p>
          ) : null}
          {/*
           * DIE UEBERSCHRIFT DER ROLLENFLAECHE TRITT ZURUECK — DIESELBE AENDERUNG, DIE `AnlassZone`
           * mit Befund 4 schon bekam, hier nachgezogen (Oberflaechen-Runde 2026-08-16, zweite
           * Haelfte). „Diese Woche" stand in `SCHRIFT.unterTitel` (20/600) ueber Tagesspalten mit
           * 14px-Titeln, waehrend die vier Zonen DARUNTER bereits Kicker trugen: auf einem
           * Bildschirm standen damit zwei verschiedene Ueberschriftenstufen fuer dieselbe
           * Gliederungsebene. Die STRUKTUR war lauter als der INHALT, und sie war ausserdem
           * uneinheitlich.
           *
           * `SCHRIFT.kicker` ist eine Rolle der Leiter (12/600 versal), keine erfundene Groesse;
           * Farbe und Haarlinie kommen aus `.zonenKopf`, derselben Klasse wie bei den Zonen.
           */}
          <h2 className={s.zonenKopf} style={{ ...SCHRIFT.kicker, margin: `0 0 ${SPACE.sm}px` }}>
            Diese Woche
          </h2>

          <TagesWaehler tage={tage} ausgewaehlterTag={mobilTag} />

          <Wochenplan
            aufgaben={meineAufgaben}
            routinen={meineRoutinen}
            person={person}
            montag={montag}
            heute={heute}
            mobilTag={mobilTag}
            zeigeAktionen={zeigeAktionen}
            rang={rang}
          />

          {/*
           * REGEL V, ZWEITER TEIL (§3.4, §4.5): was in KEINER der fuenf Tagesspalten stehen kann,
           * steht hier. Die Fusszeile ist nicht Kosmetik, sondern der BELEG fuer die
           * Partitionszusage aus §4.1 — sie ist der Ort, an dem die Restmenge der BuFDi-Leiter
           * sichtbar wird. Wer sie schmaler fasst, muss die R3-Ausnahme fuer Rang 3 mit
           * zuruecknehmen, sonst entsteht genau das Loch, das §4.1 zu schliessen hat.
           */}
          {lage.achsenVorbehalt !== null && lage.achsenVorbehalt.ohnePlatz.length > 0 ? (
            <p style={{ ...SCHRIFT.neben, margin: `${SPACE.md}px 0 0` }}>
              {lage.achsenVorbehalt.ohnePlatz.length}{" "}
              {lage.achsenVorbehalt.ohnePlatz.length === 1 ? "Aufgabe liegt" : "Aufgaben liegen"}{" "}
              außerhalb dieser Woche:{" "}
              {lage.achsenVorbehalt.ohnePlatz.map((a, i) => (
                <span key={a.id}>
                  {i > 0 ? " · " : ""}
                  <Link href={`/a/${a.id}`}>{a.titel}</Link>
                  {" · "}
                  {/* „ohne Termin" STATT EINES DATUMS (§4.5): ueber eine Zeile ohne `planDatum`
                      waere „ausserhalb der Woche" eine Falschaussage — sie hat keine Woche. */}
                  {a.planDatum === null ? "ohne Termin" : fmtTagKurz(a.planDatum)}
                </span>
              ))}
            </p>
          ) : null}
        </section>

        {/* ── 4 · DIE UEBRIGEN ANLAESSE ALS ZONEN, IN RANGFOLGE (Regel R3) ── */}
        {lage.zonen.map((zone) => (
          <AnlassZone
            key={zone.art}
            anlass={zone}
            heute={heute}
            eigenePersonId={person.id}
            zusaetze={Object.fromEntries(
              zone.zeilen.map((a) => [a.id, planZusatz(a)] as const),
            )}
            aktionen={
              zeigeAktionen && zone.art === "bufdiWartetAufEinplanung"
                ? Object.fromEntries(
                    zone.zeilen.map((a) => [a.id, posteingangAktionen(a)] as const),
                  )
                : {}
            }
          />
        ))}

        {/* ── 5 · FUSS ── */}
        <div
          style={{
            marginBlockStart: SPACE.xl,
            display: "flex",
            flexDirection: "column",
            gap: SPACE.sm,
          }}
        >
          {/*
           * DASSELBE PRAEDIKAT WIE `/routinen` SELBST (`darfRoutinenVerwalten`) — nicht
           * `darfPlanAendern`, obwohl beide fuer eine aktive BuFDi heute denselben Wert liefern:
           * der Fussverweis muss dem Riegel der ZIELSEITE folgen, nicht einer zufaellig
           * gleichwertigen Bedingung. `/routinen` wirft sonst `notFound()`.
           */}
          {/*
           * NEBENWEGE IN TINTE STATT IN ROT (Befund 3, hier nachgezogen): „Routinen verwalten" und
           * die Zeitplaene der anderen BuFDis sind Navigation, kein Signal. Als rote Links waren
           * sie bis zu drei weitere Rotstellen auf einer Flaeche, auf der Rot fachliche Bedeutung
           * tragen soll — dieselbe Aenderung, die `EinstiegKoordination` fuer „Personenverwaltung"
           * und „Archiv" schon hat, mit derselben Klasse.
           */}
          {grund.darfRoutinenVerwalten ? (
            <Link href="/routinen" className={s.leiseLink}>
              Routinen verwalten
            </Link>
          ) : null}
          {andereBufdis.map((b) => (
            <Link key={b.id} href={`/plan/${b.id}`} className={s.leiseLink}>
              Zeitplan von {b.name}
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}

/**
 * DER ROLLENZUSATZ EINER BUFDI-ZEILE (§3.6, §10 Prueffrage 7) — GENAU EINE Angabe: der
 * Zeitvorschlag, wo einer offen ist, sonst der Plantag, sonst nichts. Ein STRING, keine Funktion
 * (Falle 9), in dieser Server Component fertig formatiert.
 */
function planZusatz(a: AufgabeRow): string | null {
  if (vorschlagOffen(a) && a.vorschlagDatum !== null) {
    return `Vorschlag: ${fmtTagKurz(a.vorschlagDatum)}${a.vorschlagUhrzeit ? `, ${a.vorschlagUhrzeit}` : ""}`;
  }
  if (a.planDatum !== null) return `Eingeplant: ${fmtTagKurz(a.planDatum)}`;
  return null;
}

/**
 * „ANNEHMEN" IST KEIN NEUER UEBERGANG — es ist `einplanenAction` mit dem vorgeschlagenen Tag und
 * der vorgeschlagenen Uhrzeit, aufgerufen ueber `einplanenAnnehmenAction` (`actions.ts`): die
 * duenne Form-Bruecke, weil `einplanenAction`s `useActionState`-Signatur nicht direkt als
 * `action`-Prop eines zustandslosen Formulars taugt. Der Verlauf haelt darueber fest, ob angenommen
 * oder abgewichen wurde — „Annehmen" laeuft also durch DENSELBEN Weg wie ein manuelles Einplanen,
 * nur mit vorausgefuellten, versteckten Feldern.
 *
 * DER VORSCHLAG STEHT IM KNOPFTEXT („Annehmen: Do, 13.08., 09:00") — ohne ihn stuende nirgends auf
 * der Seite, WAS angenommen wird. Nur gerendert, wenn `vorschlagOffen`.
 *
 * STANDARDKNOPF, KEIN `type="primary"` (§11.4 Schritt 3, §9/S9): dieser Knopf steht in der Zone und
 * damit INNERHALB von `data-testid="aufgaben-flaeche"`, wo hoechstens EIN `.ant-btn-primary` stehen
 * darf — und der gehoert der Fuehrungskarte.
 */
function posteingangAktionen(a: AufgabeRow): ReactNode {
  return (
    /*
     * ══ STILLE ZEILENKNOEPFE STATT antd-`Button` (Oberflaechen-Runde 2026-08-16, zweite Haelfte).
     *
     *    DIE SICHTBARKEIT WAR NIE DAS PROBLEM UND IST ES AUCH JETZT NICHT: diese Knoepfe stehen
     *    ueber `AnlassZone` → `AufgabenListe` → `AufgabenZeile` bereits in `.zeilenAktion`, also in
     *    der Aktionsspur, die ohne Zuwendung durchsichtig ist. DIE FORM war es. Zwei
     *    vollflaechige antd-Knoepfe — einer davon mit einer 24-Zeichen-Beschriftung („Annehmen:
     *    Do, 13.08., 09:00") — sind eine Knopfleiste, und die Aktionsspur einer Notion-artigen
     *    Liste soll bei Zuwendung einen WEG anzeigen, keine Schaltflaeche. Dieselbe Entscheidung
     *    und dieselbe Klasse wie beim Zuweisen-Ausloeser der Koordinationsflaeche.
     *
     *    „ANDERS EINPLANEN" IST EIN `<a>`, KEIN KNOPF, UND WAR ES INHALTLICH IMMER: antds
     *    `Button href=` rendert ohnehin ein `<a class="ant-btn">` — es sah nur aus wie ein Knopf
     *    und war eine Navigation. Jetzt sagt das Markup dasselbe wie die Handlung. `.zeilenKnopf`
     *    traegt deshalb `text-decoration: none`, und der modulweite `:focus-visible`-Block deckt
     *    `a` wie `button`.
     *
     *    FACHLICH AENDERT SICH NICHTS: dieselbe `einplanenAnnehmenAction`, dieselben drei
     *    versteckten Felder, dieselbe Bedingung `vorschlagOffen(a)`, dasselbe Ziel
     *    `/plan/<person>#einplanen-<id>`. Der Knopftext nennt weiterhin den Vorschlag — ohne ihn
     *    stuende nirgends auf der Seite, WAS angenommen wird —, und `getByRole("button", { name:
     *    /^Annehmen:/ })` findet ihn unveraendert.
     *
     *    KEIN `type="primary"` war hier und bleibt hier: diese Knoepfe stehen innerhalb von
     *    `data-testid="aufgaben-flaeche"`, wo hoechstens EIN `.ant-btn-primary` stehen darf. Ohne
     *    antd-`Button` ist das jetzt strukturell erfuellt statt durch das Weglassen einer
     *    Eigenschaft, die man vergessen kann.
     */
    <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
      {vorschlagOffen(a) ? (
        <form action={einplanenAnnehmenAction}>
          <input type="hidden" name="aufgabeId" value={a.id} />
          <input type="hidden" name="planDatum" value={a.vorschlagDatum ?? ""} />
          <input type="hidden" name="planUhrzeit" value={a.vorschlagUhrzeit ?? ""} />
          <button type="submit" className={s.zeilenKnopf}>
            Annehmen: {fmtTagKurz(a.vorschlagDatum!)}
            {a.vorschlagUhrzeit ? `, ${a.vorschlagUhrzeit}` : ""}
          </button>
        </form>
      ) : null}
      {/*
       * ══ „ANDERS EINPLANEN" IST KEIN WEG MEHR, SONDERN EIN FELD (Oberflaechen-Runde 2026-08-16,
       *    dritte Haelfte). Der Verweis fuehrte auf `/plan/<person>#einplanen-<id>`, also FORT von
       *    der Liste, in der man gerade liest, zu einem Formular, das dieselbe Aufgabe noch einmal
       *    nennt — und wer danach die naechste umplanen wollte, ging zurueck und wieder hin. Der
       *    Kommentar darueber hat den Verweis eine Runde frueher vom antd-`Button` zum `<a>`
       *    gemacht, „damit das Markup dasselbe sagt wie die Handlung"; diese Runde geht den Schritt
       *    zu Ende und macht die HANDLUNG zu dem, was sie inhaltlich ist — eine Aenderung an dieser
       *    Zeile, nicht ein Ortswechsel.
       *
       *    FACHLICH AENDERT SICH NICHTS: dieselbe `einplanenAction`, dieselben Feldnamen, dasselbe
       *    `zeigeAktionen = darfPlanAendern(...)`, das schon den Verweis gatete. Die Zielseite
       *    `/plan/<person>` bleibt vollstaendig erreichbar (Fusszeile, Fuehrungskarte, Zeitplaene
       *    der anderen) und behaelt als einzige das Dauerfeld.
       *
       *    DER WORTLAUT BLEIBT, DAMIT DER GRIFF BLEIBT: `name: "Anders einplanen"` findet jetzt
       *    einen Knopf statt eines Verweises — die Rolle wechselt, die Aufschrift nicht.
       */}
      <EinplanenInline aufgabe={a} />
    </div>
  );
}
