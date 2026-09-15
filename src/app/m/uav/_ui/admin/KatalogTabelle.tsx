"use client";

import { useMemo, useState } from "react";
import { Button, Drawer, Tag } from "antd";
import {
  Datentabelle,
  filterAktiv,
  nachJaNein,
  nachText,
  nachZahl,
  trifftWert,
  werteAlsFilter,
  zustandsFilter,
  type FilterZustand,
} from "@/core/tabelle";
import { flyinBreite } from "@/core/theme/flyin";
import { aufgabenSortierenAction } from "../../_actions/katalog";
import type { TaskDTO, Teil } from "../../_lib/typen";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { SPACE } from "@/core/theme/tokens";
import { AufgabeFormular } from "./AufgabeFormular";

const TEIL_TITEL: Record<Teil, string> = { 1: "Teil 1", 2: "Teil 2", 3: "Teil 3" };

/**
 * „aktiv"/„inaktiv" ist ein Prädikat über der Zeile, kein Feldwert — deshalb
 * `zustandsFilter` statt `werteAlsFilter` (`core/tabelle/spaltenfilter.ts`).
 * Beide Haken zusammen verodern sich, zeigen also wieder alles.
 */
const AKTIV_FILTER = zustandsFilter<TaskDTO>([
  { wert: "aktiv", text: "aktiv", trifft: (a) => a.aktiv },
  { wert: "inaktiv", text: "inaktiv", trifft: (a) => !a.aktiv },
]);

/*
 * DER AUFGABENKATALOG ALS TABELLE (Aufgabe 17) — eigene `"use client"`-
 * Komponente mit nur serialisierbaren Daten (`TaskDTO[]`) als Prop (Falle 9).
 * Reihenfolge NUR über Hoch/Runter-Buttons (Brief: „kein Drag — Tap-tauglich",
 * CLAUDE.md-Vorgabe für den Katalog) — Vorbild `uav-praxis/src/admin/
 * CatalogPage.tsx`s `verschieben`, optimistisch lokal verschoben und danach
 * per `aufgabenSortierenAction` geschrieben; schlägt der Schreibvorgang fehl,
 * bringt ein Reload die autoritative Reihenfolge zurück (kein eigener
 * Rückbau-Zustand — das Zurücksetzen der Serverliste würde denselben Fehler
 * ohnehin nur verschleiern).
 *
 * ANLEGEN/BEARBEITEN/LÖSCHEN LAUFEN ÜBER `AufgabeFormular` IM `Drawer` — die
 * Aktionen selbst liefern die aktualisierte/neue Zeile zurück, der lokale
 * State wird direkt daraus fortgeschrieben, kein zusätzlicher Refetch nötig.
 *
 * ══ DER `Seitenkopf` STEHT HIER UND NICHT IN `page.tsx`, UND DAS IST DIE EINZIGE
 *    DER DREI VERWALTUNGSSEITEN, BEI DER DAS SO IST. Sein `aktionen`-Platz trägt
 *    „Aufgabe anlegen", und dieser Knopf öffnet den `Drawer` — er braucht also
 *    denselben Zustand wie die Tabelle. Die Alternativen wären ein Context nur für
 *    ein Boolean oder eine zweite Client-Komponente, die den Zustand hochhebt und
 *    danach exakt diese Datei wäre. `Seitenkopf` trägt kein `"use client"`, ist aber
 *    reines Markup plus `next/link` und deshalb in einer Client-Insel unverändert
 *    richtig (Vorbild `files/_ui/PosteingangTabelle.tsx`, dieselbe Bauform).
 *    Vorher stand der Knopf in einer eigenen rechtsbündigen Zeile ÜBER der Tabelle,
 *    ohne Bezug zur Überschrift daneben.
 *
 * ══ EINE SPUR, DIE SCHRUMPFEN DARF — UND DAS WAR DER GANZE MOBILE ÜBERLAUF. `/admin/katalog`
 *    maß bei 390px Viewport `documentElement.scrollWidth === 808`, obwohl die Tabelle
 *    ihr `scroll={{ x: "max-content" }}` längst trug. Die Ursache lag eine Ebene
 *    darüber: ein Gitter- (wie ein Flex-) Kind hat die Vorgabe `min-width: auto` und
 *    schrumpft deshalb NICHT unter die Inhaltsbreite seines Kindes — der eigene
 *    Scroll-Container der Tabelle kam nie zum Zug, weil ihm niemand eine schmalere
 *    Spur gab. `gridTemplateColumns: "minmax(0, 1fr)"` ist die Spur, die schrumpfen
 *    darf. Kein Gate sieht das: die Zahl kennt nur ein echter Browser.
 *    ⚠️ `scroll={{ x: "max-content" }}` steht seit der Umstellung auf `@/core/tabelle`
 *    nicht mehr in dieser Datei — es ist dort die Vorgabe, zusammen mit
 *    `pagination={false}` und dem Spaltenkopf-Kicker. Die Spur darüber bleibt trotzdem
 *    nötig; sie ist die Hälfte, die `Datentabelle` nicht kennt.
 *
 * ══ DER RANG KOMMT AUS DER ZEILE, NICHT AUS DEM ANZEIGE-INDEX (DRK-333). Bis dahin
 *    las `verschieben` den `index`, den antd in `render` durchreicht — und das ist der
 *    Index der ANGEZEIGTEN Liste. Solange die Anzeige die Speicherreihenfolge war,
 *    stimmte das; genau deshalb trug diese Tabelle als einzige weder `sorter` noch
 *    `filters`. Der Preis war kein Anzeigefehler, sondern ein SCHREIBENDER Vorgang auf
 *    dem falschen Datensatz: hätte jemand nach „Titel" sortiert, verschöbe der Knopf
 *    eine andere Zeile, und `aufgabenSortierenAction` schriebe das Ergebnis fest — ohne
 *    jede Rückmeldung, dass etwas schiefging. ⚠️ Kein Tor sieht das; es ist ein
 *    Laufzeitversatz zwischen zwei Listen, kein Typfehler.
 *    `verschieben` bekommt deshalb die `id` und sucht ihren Platz in `aufgaben` — der
 *    Liste in GESPEICHERTER Reihenfolge. Damit darf die Tabelle sortieren und filtern
 *    wie jede andere.
 *
 * ══ UND DAMIT DIE ANTWORT AUF „WAS HEISST NACH OBEN, WENN ANDERS SORTIERT IST?":
 *    IMMER „einen Platz nach vorn in der gespeicherten Reihenfolge" — in der Ordnung
 *    also, die die Teilnehmer später sehen. Die Anzeigeordnung ist nur die Brille, durch
 *    die man die Zeile sucht. ⚠️ Das hat eine Folge, die man sehen können muss: unter
 *    einer fremden Sortierung bewegt sich die Zeile auf dem Schirm NICHT, obwohl der
 *    Knopf gewirkt hat. Deshalb trägt die Spalte „Reihenfolge" die PLATZZIFFER neben den
 *    Pfeilen — sie zählt hoch oder runter, auch wenn die Zeile stehen bleibt. Ein Knopf
 *    ohne sichtbare Wirkung wird zweimal gedrückt.
 */
export function KatalogTabelle({ aufgaben: anfangsAufgaben }: { aufgaben: TaskDTO[] }) {
  const [aufgaben, setAufgaben] = useState<TaskDTO[]>(anfangsAufgaben);
  const [neuOffen, setNeuOffen] = useState(false);
  const [bearbeiten, setBearbeiten] = useState<TaskDTO | null>(null);
  const [busy, setBusy] = useState(false);
  /**
   * ⚠️ GEMERKT WIRD DER ZUSTAND, NICHT DIE LISTE (Falle 15). Gebraucht wird er
   * für genau eine Frage: ob der Leertext „noch nichts angelegt" oder „nichts
   * passt zum Filter" heißen muss.
   */
  const [spaltenFilter, setSpaltenFilter] = useState<FilterZustand>({});

  /**
   * Der Platz JE ID in der gespeicherten Reihenfolge — die eine Quelle, aus der
   * die Pfeile ihren Rang lesen. Aus `aufgaben`, nie aus dem Render-Index.
   */
  const platzJeId = useMemo(
    () => new Map(aufgaben.map((aufgabe, platz) => [aufgabe.id, platz])),
    [aufgaben],
  );

  function angelegt(aufgabe: TaskDTO): void {
    setAufgaben((liste) => [...liste, aufgabe]);
    setNeuOffen(false);
  }

  function geaendert(aufgabe: TaskDTO): void {
    setAufgaben((liste) => liste.map((a) => (a.id === aufgabe.id ? aufgabe : a)));
    setBearbeiten(null);
  }

  function geloescht(id: string): void {
    setAufgaben((liste) => liste.filter((a) => a.id !== id));
    setBearbeiten(null);
  }

  /**
   * ⛔ DIE ZEILE KOMMT ALS `id`, NICHT ALS POSITION. Der Platz wird hier aus
   * `aufgaben` aufgelöst — der Liste in gespeicherter Reihenfolge —, damit eine
   * Sortierung oder ein Filter in den Spaltenköpfen nicht die falsche Zeile
   * verschiebt. Geschrieben wird weiter die GANZE Reihenfolge: `tasksNeuSortieren`
   * vergibt `sortOrder` aus der Position in der Id-Liste.
   */
  function verschieben(id: string, richtung: -1 | 1): void {
    const index = platzJeId.get(id);
    if (index === undefined) return;
    const ziel = index + richtung;
    if (ziel < 0 || ziel >= aufgaben.length) return;
    const neu = [...aufgaben];
    const [bewegt] = neu.splice(index, 1);
    if (!bewegt) return;
    neu.splice(ziel, 0, bewegt);
    setAufgaben(neu);
    setBusy(true);
    void aufgabenSortierenAction(neu.map((a) => a.id)).finally(() => setBusy(false));
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: SPACE.lg }}>
      <Seitenkopf
        titel="Aufgabenkatalog"
        beschreibung="Diese Aufgaben sehen die Teilnehmer in ihrem Training. Du legst fest, in welcher Reihenfolge sie erscheinen, wie oft jede geübt werden soll und welche gerade gilt."
        aktionen={
          <Button type="primary" onClick={() => setNeuOffen(true)}>
            Aufgabe anlegen
          </Button>
        }
      />

      <Datentabelle<TaskDTO>
        rowKey="id"
        dataSource={aufgaben}
        onChange={(_seite, filter) => setSpaltenFilter(filter)}
        locale={{
          /*
           * „Noch nichts angelegt" und „nichts passt" sind zwei verschiedene
           * Sätze; der falsche lädt zum Anlegen einer Aufgabe ein, die es gibt.
           *
           * ⚠️ DIE LEERE LISTE WIRD ZUERST GEFRAGT, und das ist kein Stil. Der
           * Filter bleibt stehen, wenn die letzte Aufgabe darunter GELÖSCHT wird
           * (`geloescht` leert `aufgaben`, rührt `spaltenFilter` aber nicht an) —
           * und dann behauptet „nichts passt zum Filter" einen Bestand, den es
           * nicht mehr gibt, genau vor der Person, die jetzt die erste neue
           * Aufgabe anlegen soll. Dieselbe Reihenfolge wie in
           * `lagerbuch/…/inventur/InventurForm.tsx`.
           */
          emptyText: aufgaben.length > 0 && filterAktiv(spaltenFilter)
            ? "Keine Aufgabe passt zum Filter."
            : "Noch keine Aufgaben im Katalog.",
        }}
        columns={[
          // Den Kicker setzt `Datentabelle`; `title` ist deshalb eine nackte Zeichenkette.
          //
          // Sortierer sind hier erlaubt, weil die Tabelle ALLES hält, was es gibt
          // (`alleTasks(db, true)`, inklusive der inaktiven) — die Regel dazu steht
          // in `core/tabelle/sortierer.ts`.
          {
            title: "Teil",
            key: "teil",
            filters: werteAlsFilter(aufgaben, (a) => TEIL_TITEL[a.teil]),
            onFilter: trifftWert<TaskDTO>((a) => TEIL_TITEL[a.teil]),
            render: (_: unknown, a: TaskDTO) => TEIL_TITEL[a.teil],
          },
          {
            title: "Nummer",
            key: "nummer",
            // `numeric: true` im Sammler ordnet „1.10" hinter „1.2" statt davor.
            sorter: nachText<TaskDTO>((a) => a.nummer),
            render: (_: unknown, a: TaskDTO) => a.nummer,
          },
          {
            title: "Titel",
            key: "titel",
            sorter: nachText<TaskDTO>((a) => a.titel),
            render: (_: unknown, a: TaskDTO) => a.titel,
          },
          {
            title: "Ziel",
            key: "ziel",
            sorter: nachZahl<TaskDTO>((a) => a.zielanzahlDefault),
            render: (_: unknown, a: TaskDTO) => a.zielanzahlDefault,
          },
          {
            title: "Aktiv",
            key: "aktiv",
            sorter: nachJaNein<TaskDTO>((a) => a.aktiv),
            ...AKTIV_FILTER,
            render: (_: unknown, a: TaskDTO) => <Tag color={a.aktiv ? "green" : "default"}>{a.aktiv ? "aktiv" : "inaktiv"}</Tag>,
          },
          {
            title: "Bild",
            key: "bild",
            render: (_: unknown, a: TaskDTO) =>
              a.bildUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- kleine Vorschau, kein LCP-Kandidat.
                <img src={a.bildUrl} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 4 }} />
              ) : (
                "—"
              ),
          },
          {
            title: "Reihenfolge",
            key: "reihenfolge",
            /*
             * ⛔ KEIN `index` HIER. Die Platzziffer und beide Ränder kommen aus
             * `platzJeId`, also aus der gespeicherten Reihenfolge — antds dritter
             * `render`-Parameter wäre der Index der ANGEZEIGTEN Liste und machte
             * unter jeder Sortierung die falsche Zeile zur ersten.
             */
            render: (_: unknown, a: TaskDTO) => {
              const platz = platzJeId.get(a.id) ?? 0;
              return (
                <div style={{ display: "flex", gap: SPACE.xs, alignItems: "center" }}>
                  <span data-rolle="uav-katalog-platz">{platz + 1}</span>
                  <Button
                    onClick={() => verschieben(a.id, -1)}
                    disabled={busy || platz === 0}
                    aria-label={`${a.nummer} nach oben`}
                  >
                    ↑
                  </Button>
                  <Button
                    onClick={() => verschieben(a.id, 1)}
                    disabled={busy || platz === aufgaben.length - 1}
                    aria-label={`${a.nummer} nach unten`}
                  >
                    ↓
                  </Button>
                </div>
              );
            },
          },
          {
            title: "Aktionen",
            key: "aktionen",
            render: (_: unknown, a: TaskDTO) => <Button onClick={() => setBearbeiten(a)}>Bearbeiten</Button>,
          },
        ]}
      />

      {/*
        480 BLEIBT DIE WUNSCHBREITE. Dieses Formular braucht nicht mehr —
        gemessen (13.09.2026) sind es 835 px Inhalt, die auf jedem
        Desktop-Schirm in eine kurze Rolle passen. Neu ist allein der Deckel.

        ⚠️ UND ER BEHEBT HIER KEINEN GEMESSENEN AUSFALL — dieselbe Messung
        zeigte die Schublade bis hinunter zu 320 px Fensterbreite sauber im
        Bild (Schliessen-Knopf bei +24 px), weil antd bei `100vw` kappt. Er
        steht trotzdem, weil diese Kappung GEMESSENES Fremdverhalten ist und
        kein Vertrag, und weil sie an einer Seite mit waagerechtem Ueberlauf
        nachweislich zu spaet greift: im Modul `lagerbuch` war `100vw`
        506 px breit bei 480 px Fenster, und der Schliessen-Knopf stand
        ausserhalb. Welche Seite eines Tages ueberlaeuft, weiss die
        Schublade nicht. Begruendung in `core/theme/flyin.ts`.
      */}
      <Drawer
        open={neuOffen}
        onClose={() => setNeuOffen(false)}
        title="Neue Aufgabe"
        size={flyinBreite(480)}
        destroyOnHidden
      >
        <AufgabeFormular onGespeichert={angelegt} onAbbrechen={() => setNeuOffen(false)} />
      </Drawer>

      <Drawer
        open={bearbeiten != null}
        onClose={() => setBearbeiten(null)}
        title={bearbeiten ? `Aufgabe ${bearbeiten.nummer} bearbeiten` : undefined}
        size={flyinBreite(480)}
        destroyOnHidden
      >
        {bearbeiten ? (
          <AufgabeFormular
            aufgabe={bearbeiten}
            onGespeichert={geaendert}
            onGeloescht={geloescht}
            onAbbrechen={() => setBearbeiten(null)}
          />
        ) : null}
      </Drawer>
    </div>
  );
}
