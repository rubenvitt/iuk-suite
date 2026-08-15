import Link from "next/link";
import type { ReactNode } from "react";
import { Button, Col, Row } from "antd";
import { einplanenAnnehmenAction } from "../actions";
import { aufgabenFuerPerson, bufdis, rangGrenzen, routinenFuer } from "../_db/queries";
import type { AufgabeRow, PersonRow } from "../_db/schema";
import type { DB } from "../_db/client";
import {
  aufgabenInWoche,
  fmtStunden,
  heuteOffen,
  tagesBudget,
  vorschlagOffen,
  wartetAufEinplanung,
} from "../_lib/anzeige";
import {
  ausgewaehlterTag,
  fmtTagKurz,
  montagAusParam,
  montagDerWoche,
  wochenTage,
} from "../_lib/datum";
import { darfPlanAendern, darfRoutinenVerwalten, type Akteur } from "../_lib/zugang";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";
import { AufgabenListe } from "./AufgabenListe";
import { Kachel } from "./Kachel";
import { SeitenKopf } from "./SeitenKopf";
import { TagesWaehler } from "./TagesWaehler";
import { WochenWaehler } from "./WochenWaehler";
import { Wochenplan } from "./Wochenplan";

/*
 * „MEINE WOCHE" — DER BUFDI-EINSTIEG (Spec §8.1, Aufgabe 13). Vier Teile in der vorgeschriebenen
 * Reihenfolge: Kopf mit Wochenwaehler, KPI-Zeile, Posteingang-Streifen, die fuenf Tagesspalten.
 * Server Component (kein "use client") — sie liest `db` direkt, wie `routinenInhalt` in
 * `routinen/page.tsx`; `page.tsx` bleibt dünn und reicht nur die aufgeloeste Person und die rohen
 * Suchparameter durch.
 *
 * `Button`/`Row`/`Col` DIREKT IN DIESER SERVER COMPONENT: kein Compound-Zugriff (Falle 1), Vorbild
 * `files/_ui/AblageKachel.tsx` (`async function AblageKachel()`, kein "use client", `<form
 * action={aufraeumenAction}><Button htmlType="submit">…`) — dieselbe Form wird hier fuer
 * "Annehmen" benutzt.
 *
 * DIE ZAHLEN DER KACHELN UND DIE LISTE DARUNTER TEILEN SICH DIESELBE ABLEITUNG
 * (`wartetAufEinplanung`/`heuteOffen` aus `_lib/anzeige.ts`) UND DENSELBEN LESEPFAD
 * (`aufgabenFuerPerson`) — keine zweite Zaehlung.
 *
 * DIE ZWEI VERTAGTEN KPI-VERWEISE (Aufgabe 16) — „Freigabe offen" und „Zurückgewiesen" trugen bis
 * hierhin bewusst KEIN `href` (Aufgabe 13: „ein Knopf auf eine 404-Seite wäre schlechter als
 * keiner" — `/freigaben` existierte noch nicht, UND ist ohnehin fuer `bufdi` KEIN Ziel: die Route
 * ist auf `auftrag`/`koordination` gegatet, `darfFreigabenSehen`, weil sie die Warteschlange DERER
 * zeigt, die freigeben, nicht der Zugewiesenen). Beide Kacheln verlinken deshalb NICHT auf
 * `/freigaben`, sondern auf zwei neue, schreibgeschuetzte Abschnitte AUF DIESER Seite
 * (`#freigabe-offen`, `#zurueckgewiesen`) — dieselbe Form wie die bereits bestehenden Anker
 * `#posteingang` hier bzw. `#freigabe`/`#ueberfaellig` in `EinstiegKoordination.tsx`. SCHREIBGESCHUETZT,
 * NICHT WEIL ES NICHTS ZU TUN GAEBE (`zurueckgewiesen` erlaubt der zugewiesenen Person durchaus
 * „Wiederaufnehmen"), SONDERN WEIL DIE AKTION BEREITS EINEN ORT HAT: `/a/<id>`s Aktionszone (Aufgabe
 * 16). Ein zweiter, hier eingebauter Knopf waere dieselbe Aktion an zwei Stellen gehalten — die
 * Person klickt stattdessen auf den Titel und landet auf der Seite, die ohnehin alles zeigt
 * (Verlauf, Zurückweisungsgrund, Aktion).
 */
export function EinstiegBufdi({
  db,
  akteur,
  heute,
  wocheParam,
  tagParam,
}: {
  db: DB;
  akteur: Akteur;
  heute: string;
  wocheParam?: string;
  tagParam?: string;
}) {
  // Die Zeile eigens benannt: sie speist die reinen Anzeige- und Ladepfade (`aufgabenFuerPerson`,
  // `tagesBudget`, `Wochenplan person=`). Die beiden Rechtefragen unten stellen den `Akteur`.
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
  // DASSELBE PRAEDIKAT WIE `/routinen` SELBST (`darfRoutinenVerwalten`, Aufgabe 13) — nicht
  // `darfPlanAendern`, obwohl beide fuer eine aktive BuFDi heute denselben Wert liefern: der
  // Fussverweis muss dem Riegel der ZIELSEITE folgen, nicht einer zufaellig gleichwertigen
  // Bedingung (Spec §7: dasselbe Praedikat in Navigation und Riegel).
  const darfRoutinen = darfRoutinenVerwalten(akteur, heute);

  const einzuplanen = meineAufgaben.filter(wartetAufEinplanung);
  const heuteOffenListe = meineAufgaben.filter((a) => heuteOffen(a, heute));
  const freigabeOffenListe = meineAufgaben.filter((a) => a.status === "freigabe_offen");
  const zurueckgewiesenListe = meineAufgaben.filter((a) => a.status === "zurueckgewiesen");

  const budgets = tage.map((tag) => tagesBudget(meineAufgaben, meineRoutinen, person, tag));
  const verplantMinuten = budgets.reduce((summe, b) => summe + b.verplantMinuten, 0);
  const sollMinuten = budgets.reduce((summe, b) => summe + b.sollMinuten, 0);
  // `aufgabenInWoche` (`_lib/anzeige.ts`, Review Fix-Runde 1): vorher eine dritte, ungetestete
  // Fassung dieser Mitgliedschaft inline hier — jetzt dieselbe Ableitung wie ueberall sonst.
  const aufgabenDieseWoche = aufgabenInWoche(meineAufgaben, tage);
  const kontext =
    `Diese Woche: ${aufgabenDieseWoche} Aufgabe${aufgabenDieseWoche === 1 ? "" : "n"}, ` +
    `${fmtStunden(verplantMinuten)} von ${fmtStunden(sollMinuten)} Std. verplant.`;

  return (
    <>
      <SeitenKopf brotkrume={[{ label: "Aufgaben" }]} titel="Meine Woche" kontext={kontext} />

      <div style={{ marginBlockEnd: SPACE.lg }}>
        <WochenWaehler montag={montag} heute={heute} />
      </div>

      <Row gutter={[SPACE.sm, SPACE.sm]} style={{ marginBlockEnd: SPACE.xl }}>
        <Col xs={12} md={6}>
          <Kachel
            zahl={einzuplanen.length}
            beschriftung="Einzuplanen"
            href={einzuplanen.length > 0 ? "#posteingang" : undefined}
          />
        </Col>
        <Col xs={12} md={6}>
          <Kachel
            zahl={heuteOffenListe.length}
            beschriftung="Heute offen"
            // ZUR WOCHE VON HEUTE, NICHT ZUR ANGEZEIGTEN WOCHE (advisor-Fund): `heuteOffen` zaehlt
            // ueber `heute`, unabhaengig davon, welche Woche `WochenWaehler` gerade anzeigt. Wer
            // zwei Wochen vor- oder zurueckblaettert, saehe sonst eine korrekte Zahl, die auf eine
            // Woche verlinkt, in der "heute" gar nicht liegt.
            href={
              heuteOffenListe.length > 0
                ? `/plan/${person.id}?woche=${montagDerWoche(heute)}`
                : undefined
            }
          />
        </Col>
        <Col xs={12} md={6}>
          <Kachel
            zahl={freigabeOffenListe.length}
            beschriftung="Freigabe offen"
            ton="ocker"
            href={freigabeOffenListe.length > 0 ? "#freigabe-offen" : undefined}
          />
        </Col>
        <Col xs={12} md={6}>
          <Kachel
            zahl={zurueckgewiesenListe.length}
            beschriftung="Zurückgewiesen"
            ton="achtung"
            href={zurueckgewiesenListe.length > 0 ? "#zurueckgewiesen" : undefined}
          />
        </Col>
      </Row>

      <section id="posteingang" style={{ marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Posteingang</h2>
        <AufgabenListe
          zeilen={einzuplanen.map((a) => ({
            aufgabe: a,
            aktionen: zeigeAktionen ? posteingangAktionen(a, person) : undefined,
          }))}
          heute={heute}
          leerText="Posteingang leer — alles verteilt"
        />
      </section>

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

      <section id="freigabe-offen" style={{ marginBlockStart: SPACE.xl, marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Freigabe offen</h2>
        <AufgabenListe
          zeilen={freigabeOffenListe.map((a) => ({ aufgabe: a }))}
          heute={heute}
          leerText="Keine Aufgabe wartet auf Freigabe."
        />
      </section>

      <section id="zurueckgewiesen" style={{ marginBlockEnd: SPACE.xl }}>
        <h2 style={{ ...SCHRIFT.unterTitel, margin: `0 0 ${SPACE.sm}px` }}>Zurückgewiesen</h2>
        <AufgabenListe
          zeilen={zurueckgewiesenListe.map((a) => ({ aufgabe: a }))}
          heute={heute}
          leerText="Keine zurückgewiesene Aufgabe."
        />
      </section>

      <div
        style={{
          marginBlockStart: SPACE.xl,
          display: "flex",
          flexDirection: "column",
          gap: SPACE.sm,
        }}
      >
        {darfRoutinen ? <Link href="/routinen">Routinen verwalten</Link> : null}
        {andereBufdis.map((b) => (
          <Link key={b.id} href={`/plan/${b.id}`}>
            Zeitplan von {b.name}
          </Link>
        ))}
      </div>
    </>
  );
}

/**
 * „ANNEHMEN" IST KEIN NEUER UEBERGANG — es ist `einplanenAction` mit dem vorgeschlagenen Tag und
 * der vorgeschlagenen Uhrzeit (Brief), aufgerufen ueber `einplanenAnnehmenAction`
 * (`actions.ts`) — die duenne Form-Bruecke, weil `einplanenAction`s `useActionState`-Signatur
 * `(prev, formData) => Promise<FormState>` nicht direkt als `action`-Prop eines zustandslosen
 * Formulars taugt (`pnpm typecheck` lehnt das ab). Der Verlauf haelt darueber fest, ob angenommen
 * oder abgewichen wurde (`einplanenNotiz` in `actions.ts` vergleicht `vorschlagDatum`/
 * `vorschlagUhrzeit` gegen die tatsaechlich eingeplanten Werte) — „Annehmen" laeuft also durch
 * DENSELBEN Weg wie ein manuelles Einplanen, nur mit vorausgefuellten, versteckten Feldern statt
 * eines sichtbaren Formulars. Nur gerendert, wenn `vorschlagOffen` — ohne Vorschlag gibt es nichts
 * anzunehmen, nur „Anders einplanen" bleibt.
 *
 * DER VORSCHLAG STEHT IM KNOPFTEXT (Spec §8.1, Review Fix-Runde 1 — vorher stand nur "Annehmen",
 * ohne dass irgendwo auf der Seite stand, WAS angenommen wird): „Annehmen: Do, 13.08." bzw. mit
 * Uhrzeit „Annehmen: Do, 13.08., 09:00" — `vorschlagUhrzeit` ist entweder `null` (keine Uhrzeit im
 * Vorschlag, ein Anker wie bei jedem anderen Eintrag) oder eine bereits validierte "HH:MM"-Zeichenkette
 * (`istGueltigeUhrzeit` in `actions.ts`), deshalb ohne weitere Formatierung eingesetzt.
 *
 * „ANDERS EINPLANEN" OEFFNET `EinplanenFormular` — NICHT HIER, SONDERN AUF `/plan/<eigene id>`
 * (Aufgabe 13 baut auch diese Route): der Anker `#einplanen-<id>` springt dort zu genau dem
 * Formular dieser Aufgabe, vorbelegt mit `task.planDatum` (leer) bzw. einer manuell gewaehlten
 * Uhrzeit. Der Streifen hier bleibt dadurch schlank; die volle Bedienung (inklusive Dauerkorrektur)
 * lebt an der einen Stelle, die ohnehin fuer den eigenen Zeitplan zustaendig ist.
 */
function posteingangAktionen(a: AufgabeRow, person: PersonRow): ReactNode {
  return (
    <div style={{ display: "flex", gap: SPACE.sm, flexWrap: "wrap" }}>
      {vorschlagOffen(a) ? (
        <form action={einplanenAnnehmenAction}>
          <input type="hidden" name="aufgabeId" value={a.id} />
          <input type="hidden" name="planDatum" value={a.vorschlagDatum ?? ""} />
          <input type="hidden" name="planUhrzeit" value={a.vorschlagUhrzeit ?? ""} />
          <Button type="primary" htmlType="submit">
            Annehmen: {fmtTagKurz(a.vorschlagDatum!)}
            {a.vorschlagUhrzeit ? `, ${a.vorschlagUhrzeit}` : ""}
          </Button>
        </form>
      ) : null}
      <Button href={`/plan/${person.id}#einplanen-${a.id}`}>Anders einplanen</Button>
    </div>
  );
}
