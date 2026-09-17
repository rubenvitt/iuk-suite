import { test, expect } from "@playwright/test";
import { devLogin } from "./fixtures";
import {
  AUFGABEN_HOST,
  AUFGABEN_KOORDINATION_SITZUNG,
  AUFGABEN_ZUGANG_GRUPPE,
} from "./helpers/aufgaben";

/*
 * DIE BREITEN-FAELLE DES MODULS `aufgaben` — abgetrennt von `aufgaben.spec.ts` (DRK-408).
 *
 * ⚠️ DER SCHNITT IST NACH LAUFZEIT GELEGT, NICHT NACH FALLZAHL, und das ist der ganze Punkt.
 * `aufgaben` war mit 8:58 die langsamste e2e-Gruppe und deckelte damit den ganzen CI-Lauf,
 * waehrend `uav-zeichen` nach 1:25 fertig war und sein Runner sieben Minuten stillstand.
 * Gemessen (Lauf 35218938723, `reporter: "list"`): von den 468 s, die `aufgaben.spec.ts`
 * brauchte, entfielen 240 s auf die Faelle in DIESER Datei — 185 s allein auf „Kein
 * waagerechtes Scrollen" mit seinen vier Viewports mal neun Seiten. Nach Fallzahl waere
 * derselbe Schnitt woanders gelandet: diese Datei traegt 48 der 86 Faelle, aber nur die
 * Haelfte der Zeit.
 *
 * WAS HIERHER GEHOERT UND WAS NICHT: hier steht, was eine BREITE zusichert — laeuft die Seite
 * ueber, steht das Brett nebeneinander oder gestapelt, zeigt der Wochenplan Liste oder Gitter,
 * steht die Fuehrungskarte an erster Stelle, loest der Dunkelmodus auf. Drueben steht, was ein
 * WEG zusichert — Zugang, Gegenproben, Nachweis, Ziehen, die vollen Durchlaeufe. Eine neue
 * Datei-Zuordnung entscheidet sich an dieser Frage, nicht an der Laufzeit; die Balance ist
 * Folge, nicht Kriterium.
 *
 * ⚠️ KEIN FALL DIESER DATEI HAENGT AN EINEM FALL DER ANDEREN, und das ist die Bedingung, unter
 * der der Schnitt ueberhaupt zulaessig war: jeder Fall hier meldet sich selbst an und ruft
 * seine Seite selbst auf. Der einzige gekoppelte Verbund des Moduls ist das Nachweis-Trio
 * (`nachweisHref`/`sauberesNachweisSrc` auf Modulebene, die IDOR-Gegenprobe haengt per
 * `test.skip` am Upload-Fall) — es steht vollstaendig in `aufgaben.spec.ts` und wurde nicht
 * angefasst. Wer hier einen Fall ergaenzt, der Zustand aus einer anderen Datei braucht, nimmt
 * genau die stille Flakiness zurueck, gegen die dieser Schnitt so vorsichtig gelegt wurde:
 * die beiden Dateien laufen in VERSCHIEDENEN Gruppen, also in verschiedenen Prozessen gegen
 * verschiedene `next dev`-Server — `workers: 1` traegt hier nichts mehr.
 *
 * HOST UND GRUPPEN KOMMEN AUS `helpers/aufgaben.ts`, nicht als Literale von hier: zwei
 * Literale liefen auseinander, ohne dass ein Lauf rot wuerde (Begruendung dort).
 */

const HOST = AUFGABEN_HOST;
const GRUPPE = AUFGABEN_ZUGANG_GRUPPE;
const KOORDINATION = AUFGABEN_KOORDINATION_SITZUNG;

/**
 * AUF 360PX IST DAS BRETT KEINE SPALTENLANDSCHAFT, SONDERN EIN STAPEL — und das wird an den
 * TATSAECHLICHEN KOORDINATEN gemessen, nicht am Stylesheet.
 *
 * `aufgaben-css.test.ts` prueft, dass die Datei die Absicht TRAEGT (`grid-template-columns:
 * minmax(0, 1fr)` im 767.98px-Block). Ob ein Browser daraus eine Spur rechnet, sieht nur dieser
 * Fall: bei 1280px muessen die Personenspalten VERSCHIEDENE x-Werte haben, bei 360px DENSELBEN.
 * Beide Breiten in EINEM Fallpaar, damit ein Fehler in beide Richtungen sichtbar wuerde — eine
 * Messung nur bei 360px bliebe auch dann gruen, wenn das Brett auf JEDER Breite stapelte, und das
 * waere der Verlust der ganzen Sicht.
 */
for (const vp of [
  { breite: 1280, hoehe: 900, erwartung: "nebeneinander" as const },
  { breite: 360, hoehe: 800, erwartung: "gestapelt" as const },
]) {
  test.describe(`Brett bei ${vp.breite}px`, () => {
    test.use({ viewport: { width: vp.breite, height: vp.hoehe } });

    test(`steht ${vp.erwartung}`, async ({ page }) => {
      await devLogin(page, {
        host: HOST,
        groups: KOORDINATION,
        email: "rike@localtest.me",
        callbackPath: "/verteilen",
      });
      const res = await page.goto(`http://${HOST}:3100/verteilen?ansicht=brett`);
      expect(res?.status()).toBe(200);
      await expect(page.locator("[data-rolle='brett']")).toBeVisible();

      const spalten = page.locator("[data-rolle='brett'] [data-person]");
      const anzahl = await spalten.count();
      expect(anzahl, "der Seed traegt drei aktive BuFDis — ohne mehrere Spalten misst dieser Fall nichts").toBeGreaterThanOrEqual(2);

      const xWerte: number[] = [];
      for (let i = 0; i < anzahl; i++) {
        const kasten = await spalten.nth(i).boundingBox();
        expect(kasten, `Spalte ${i} hat keinen Kasten`).not.toBeNull();
        xWerte.push(Math.round(kasten!.x));
      }

      if (vp.erwartung === "gestapelt") {
        expect(new Set(xWerte).size, `gestapelt erwartet, gemessen x = ${xWerte.join(", ")}`).toBe(1);
      } else {
        expect(
          new Set(xWerte).size,
          `nebeneinander erwartet, gemessen x = ${xWerte.join(", ")}`,
        ).toBe(anzahl);
      }
    });
  });
}

/*
 * DIE UMSCHALTUNG BEI 390, 820 UND 1280PX (Spec §9.6, §10, Brief Teil 4 Punkt 4). Beide
 * Auspraegungen rendern IMMER ins HTML (Kopfkommentar `Wochenplan.tsx`); nur eine Medienabfrage
 * (767.98px) blendet je eine aus — ein Sichtbarkeits-Check ist deshalb der einzige, der die
 * tatsaechlich AUSGELIEFERTE Umschaltung sieht, kein jsdom-Test wertet eine `@media`-Regel aus.
 * 820px ist ausdruecklich die Mitte zwischen den beiden Enden (Spec §10: „die Suite hatte dort
 * zweimal Defekte, die an beiden Enden unsichtbar waren").
 */
for (const vp of [
  { breite: 390, hoehe: 844, sichtbar: "tagesliste" as const },
  { breite: 820, hoehe: 1180, sichtbar: "wochengitter" as const },
  { breite: 1280, hoehe: 720, sichtbar: "wochengitter" as const },
]) {
  test.describe(`Umschaltung bei ${vp.breite}px`, () => {
    test.use({ viewport: { width: vp.breite, height: vp.hoehe } });

    test(`zeigt ${
      vp.sichtbar === "tagesliste"
        ? "die Tagesliste, nicht das Wochengitter"
        : "das Wochengitter, nicht die Tagesliste"
    }`, async ({ page }) => {
      await devLogin(page, { host: HOST, groups: GRUPPE, email: "alina@localtest.me", callbackPath: "/" });

      const wochengitter = page.locator('[data-rolle="wochengitter"]');
      const tagesliste = page.locator('[data-rolle="tagesliste"]');

      if (vp.sichtbar === "tagesliste") {
        await expect(tagesliste).toBeVisible();
        await expect(wochengitter).toBeHidden();
      } else {
        await expect(wochengitter).toBeVisible();
        await expect(tagesliste).toBeHidden();
      }
    });
  });
}

/**
 * KEIN WAAGERECHTES SCROLLEN AUF KEINEM DER DREI VIEWPORTS (Brief Teil 4, Punkt 5) — LOKAL IN
 * DIESER DATEI, NICHT IN EINEM HELFER: Vorbild `e2e/lagerbuch-mobil.spec.ts:98-104`, dieselbe
 * Begruendung dort ("ein Layout-Helfer gehoert nicht zu dem, was diese Datei traegt").
 *
 * GEMESSEN WIRD `documentElement` UND `body`: die Brief-Formulierung nennt woertlich
 * `scrollWidth <= clientWidth am body`, die uebliche Aussagekraft liegt aber am `documentElement`
 * (Vorbild `lagerbuch-mobil.spec.ts`). Beide Werte werden deshalb geprueft, statt sich fuer einen
 * zu entscheiden — weichen sie je einmal ab, ist DAS ein Befund fuer den Bericht, keine still
 * aufgeloeste Wahl.
 *
 * MINDESTENS EINE SEITE MIT ECHTER `Table` IST PFLICHT (`/verteilen`, `/personen`): die
 * Brief-Begruendung ist woertlich "die Zusicherung, an der eine Tabelle ohne `scroll={{x}}`
 * auffaellt" — ein Sweep nur ueber "Meine Woche" (keine `Table`) waere dafuer wirkungslos.
 */
async function ueberlauf(page: import("@playwright/test").Page) {
  return page.evaluate(() => ({
    vwDoc: document.documentElement.clientWidth,
    scrollDoc: document.documentElement.scrollWidth,
    vwBody: document.body.clientWidth,
    scrollBody: document.body.scrollWidth,
    schuldige: [...document.querySelectorAll("body *")]
      .filter((el) => {
        const b = el.getBoundingClientRect();
        return b.right > window.innerWidth + 1 && b.width > 1 && b.height > 1;
      })
      .map((el) => {
        const b = el.getBoundingClientRect();
        const klasse = typeof el.className === "string" ? el.className : "";
        return `${el.tagName}.${klasse.slice(0, 40)} rechts=${Math.round(b.right)} text="${(el.textContent ?? "").trim().slice(0, 60)}"`;
      })
      .slice(0, 5),
  }));
}

/**
 * `groups` IST SEIT DEM 2026-08-15 EIN EIGENES FELD JE ZEILE, KEIN FESTES `GRUPPE` IN DER SCHLEIFE
 * (Quellenwechsel): drei dieser Zeilen fahren Koordinationsseiten (`/verteilen`, `/personen`,
 * `/archiv`), und die erreicht Rike nur noch MIT der Koordinationsgruppe. Ohne dieses Feld waeren es
 * bei vier Breiten ZWOELF rote Faelle, und ihre Meldung lautete „HTTP 404 statt 200" — nach einem
 * kaputten Layout klingt das nicht.
 *
 * ⚠️ AUCH `/archiv` BRAUCHT SIE, obwohl die Route selbst kein Koordinationsgate traegt: die Zeile
 * prueft `getByRole("heading", { name: "Archiv" })`, und die Seite antwortet einer `auftrag`-Person
 * durchaus mit 200 — aber `darfAufgabeSehen` filtert ihr Bendix' Selbstaufgabe und Doertes Aufgabe
 * weg (sie ist bei keiner der beiden Ersteller, Zugewiesene oder Pruefer). Die Gruppe haelt diese
 * Zeile deshalb bei DEM Inhalt, dessen Breite sie messen soll.
 */
const UEBERLAUF_SEITEN: { label: string; pfad: string; email: string; groups: string; titel: string }[] = [
  { label: "/ (Alina)", pfad: "/", email: "alina@localtest.me", groups: GRUPPE, titel: "Meine Woche" },
  // BENDIX' UND CARLAS WOCHEN SIND DIE EIGENTLICHEN GEGENPROBEN (advisor-Hinweis nach dem ersten
  // 820px-Fund): `flex-wrap: wrap` auf `.routineZeile` behebt den langen Routinennamen, aber NICHT
  // notwendigerweise `.budget`/`.budgetUeberbucht` — beide tragen `white-space: nowrap`
  // (`aufgaben.module.css`), und Bendix' Montag ist die EINE ueberbuchte Demo-Fixtur
  // ("9,17 / 7,80 Std. — überbucht", laenger als jede Alina-Zeile). Carlas "Nachtbereitschaft-
  // Übergabe" ist der laengste Routinenname im ganzen Seed. Ohne diese beiden Zeilen bewiese der
  // Sweep nur "eine Person mit kurzen Texten laeuft nicht ueber" — nicht die Zusicherung, die der
  // Brief verlangt.
  { label: "/ (Bendix, ueberbuchter Montag)", pfad: "/", email: "bendix@localtest.me", groups: GRUPPE, titel: "Meine Woche" },
  { label: "/ (Carla, laengster Routinenname)", pfad: "/", email: "carla@localtest.me", groups: GRUPPE, titel: "Meine Woche" },
  /*
   * DIE ZWEI EINSTIEGE, DIE DIE OBERFLAECHEN-SPEC NEU BAUT (§3.3, §11.2) — NACHTRAEGLICH
   * AUFGENOMMEN, WEIL DIE DECKUNG SONST GENAU DORT ZU KLEIN WAERE, WO SICH ETWAS AENDERT. Die
   * Liste fuehrte bis hierher `/` fuer die DREI BuFDis, `/verteilen`, `/personen` und `/archiv` —
   * also drei Fassungen derselben Rolle und keine einzige der beiden anderen. Rikes und Maltes
   * Einstieg sind seit Schritt 4 neu gebaut (Fuehrungskarte, Zonen mit Deckel, „Die Woche der
   * drei"), und beide bringen Zeilen mit, die auf 390px zuerst brechen: Rikes Zonenueberschriften
   * tragen eine Zahl in Klammern, Maltes „Eigene Auftraege" ist ungedeckelt und damit die
   * laengste Liste des Moduls.
   *
   * 6 → 8 Zeilen, 24 → 32 Faelle. Zur fuenften Breite (360px) siehe den eigenen Block unter dieser
   * Schleife — sie wird GEZIELT gefahren, nicht global.
   */
  { label: "/ (Rike, Koordination)", pfad: "/", email: "rike@localtest.me", groups: KOORDINATION, titel: "Verteilung" },
  { label: "/ (Malte, Auftraggeber)", pfad: "/", email: "malte@localtest.me", groups: GRUPPE, titel: "Meine Aufträge" },
  // `Table` mit `scroll={{x: "max-content"}}` — die eine Seite, fuer die diese Zusicherung
  // ueberhaupt etwas beweist (s. Kopfkommentar).
  { label: "/verteilen", pfad: "/verteilen", email: "rike@localtest.me", groups: KOORDINATION, titel: "Verteilen" },
  /*
   * ══ DIE BRETT-SICHT IST EINE EIGENE ZEILE, UND OHNE SIE WAERE DIESER SWEEP AN DER NEUEN
   *    RISIKOFLAECHE BLIND (vierte Oberflaechen-Runde 2026-08-16).
   *
   *    Die Zeile darueber ruft `/verteilen` OHNE Suchparameter, und das ist per Vorgabe die
   *    LISTE (`alsAnsicht(undefined) === "liste"`). Sie wuerde also fuer immer die Zeilenliste
   *    messen und gruen melden, waehrend das Brett bei 390px oder 768px ueber den Rand laeuft —
   *    ein Sweep, der etwas anderes misst, als sein Name sagt.
   *
   *    UND DAS BRETT IST GENAU DIE BREITESTE NEUE SACHE DER SEITE: N+1 Spalten mit einer
   *    220px-Untergrenze je Spur. Bei 390px muss die Medienabfrage sie auf EINE Spur stapeln, bei
   *    768px auf so viele, wie in 528px Inhaltsflaeche passen (die engste Breite des Moduls
   *    ueberhaupt, s. Kopfkommentar der Breitenliste unten). Beides ist eine Rechnung, kein
   *    Versprechen — und nur ein echter Browser rechnet sie.
   */
  {
    label: "/verteilen?ansicht=brett",
    pfad: "/verteilen?ansicht=brett",
    email: "rike@localtest.me",
    groups: KOORDINATION,
    titel: "Verteilen",
  },
  { label: "/personen", pfad: "/personen", email: "rike@localtest.me", groups: KOORDINATION, titel: "Personenverwaltung" },
  { label: "/archiv", pfad: "/archiv", email: "rike@localtest.me", groups: KOORDINATION, titel: "Archiv" },
];

/*
 * 768PX IST DIE VIERTE BREITE, UND SIE IST DIE ENGSTE — NACHTRAEGLICH AUFGENOMMEN (Nach-Rebase-
 * Runde, Befund B). Bis dahin fuhr dieser Sweep 390/820/1280 und liess damit ausgerechnet die
 * KANTE aus, an der die Suite-Seitenleiste einschnappt: `src/core/shell/shell.module.css` zeigt
 * `.sider` ab `@media (min-width: 768px)`. 768px ist also die erste Breite, an der dem Modul die
 * 240px fehlen — und zugleich die kleinste, an der das Wochengitter ueberhaupt sichtbar ist
 * (`aufgaben.module.css` blendet es bis 767.98px aus). Beides zusammen ergibt die schmalste
 * Inhaltsflaeche, die dieses Modul je bekommt: gemessen 528px, gegenueber 580px bei 820px.
 *
 * WAS DAS GEKOSTET HAT, IST BELEGT UND NICHT HYPOTHETISCH: `/` lief bei 768px um 28px ueber
 * (`scrollWidth` 796 bei `clientWidth` 768) — ein DRITTER roter Fall neben den zwei bei 820px, den
 * nie jemand gesehen hat, weil keine Messung dort stand. Eine Viewport-Liste, die an einer Kante
 * nicht misst, ist genau an der Stelle blind, an der sich das Layout aendert.
 *
 * DIE LISTE IST AUCH JETZT NICHT VOLLSTAENDIG, und das steht hier, damit es nicht als „geprueft"
 * durchgeht: `/routinen` und `/freigaben` sind in `UEBERLAUF_SEITEN` NICHT enthalten, obwohl ihre
 * Zeilenaktionen in derselben Runde von 24px auf 44px gewachsen sind. Beide wurden bei 820px von
 * Hand nachgemessen und laufen nicht ueber; bewacht sind sie nicht. Bewusst so belassen — die
 * Laufzeit dieses Sweeps waechst multiplikativ ueber Seiten x Breiten.
 */
for (const vp of [
  { breite: 390, hoehe: 844 },
  { breite: 768, hoehe: 1180 },
  { breite: 820, hoehe: 1180 },
  { breite: 1280, hoehe: 720 },
]) {
  test.describe(`Kein waagerechtes Scrollen bei ${vp.breite}px`, () => {
    test.use({ viewport: { width: vp.breite, height: vp.hoehe } });

    for (const seite of UEBERLAUF_SEITEN) {
      test(`${seite.label} laeuft nicht ueber`, async ({ page }) => {
        await devLogin(page, {
          host: HOST,
          groups: seite.groups,
          email: seite.email,
          callbackPath: seite.pfad,
        });
        const antwort = await page.goto(`http://${HOST}:3100${seite.pfad}`);
        expect(antwort?.status(), `${seite.pfad}: HTTP`).toBe(200);
        await expect(page.getByRole("heading", { name: seite.titel, level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");

        const mass = await ueberlauf(page);
        expect(
          mass.scrollDoc,
          `${seite.pfad} bei ${vp.breite}px (documentElement): ${mass.schuldige.join(" | ")}`,
        ).toBeLessThanOrEqual(mass.vwDoc);
        expect(
          mass.scrollBody,
          `${seite.pfad} bei ${vp.breite}px (body): ${mass.schuldige.join(" | ")}`,
        ).toBeLessThanOrEqual(mass.vwBody);
      });
    }
  });
}

/**
 * 360PX — DIE FUENFTE BREITE, UND SIE WIRD GEZIELT GEFAHREN STATT GLOBAL (Oberflaechen-Spec
 * 2026-08-16 §9/S4, §11.2).
 *
 * WARUM UEBERHAUPT: 360px ist die Messbreite, an der die Spec ihre Skizzen bemisst und an der der
 * Deckel von FUENF Zeilen je Zone begruendet ist („die Zeilenzahl, die auf 360px noch ueber der
 * Falzkante einer Zone steht"). Die drei Einstiege sind die einzigen Flaechen, fuer die diese Zahl
 * eine Aussage traegt — sie tragen die Fuehrungskarte mit ihren 16px Innenpolster (die eine
 * Medienabfrage) und die Kartenform der Zeilen (`.zeilenListe > li { flex-direction: column }`).
 *
 * WARUM NICHT ALS FUENFTER EINTRAG IN DER BREITENLISTE OBEN: dieselbe Abwaegung, die der
 * Kopfkommentar dort fuer `/routinen` und `/freigaben` schon ausschreibt — die Laufzeit dieses
 * Sweeps waechst MULTIPLIKATIV ueber Seiten × Breiten, und 360px belegte fuer `/verteilen`,
 * `/personen` und `/archiv` nichts, was 390px nicht schon belegt (keine dieser Seiten hat eine
 * Schaltschwelle dazwischen; es gibt im ganzen Modul genau EINE Medienabfrage bei 767.98px).
 * 9 × 4 + 4 = 40 Faelle statt 9 × 5 = 45.
 *
 * ⚠️ DIE BRETT-SICHT IST SEIT DER VIERTEN OBERFLAECHEN-RUNDE (2026-08-16) DIE EINE AUSNAHME VON DER
 * ABWAEGUNG IM ABSATZ DARUEBER, und die Ausnahme ist begruendet, nicht bequem: `/verteilen?ansicht=
 * brett` ist die EINZIGE Flaeche des Moduls, deren Spurenzahl aus einer 220px-Untergrenze folgt —
 * 360px ist damit die Breite, an der eine Spur ueberhaupt noch passen MUSS, und 390px belegt das
 * nicht (30px sind genau die Reserve, um die es geht). Es bleibt bei DREI Zeilen fuer `/`.
 */
test.describe("Kein waagerechtes Scrollen bei 360px — die drei Einstiege und das Brett", () => {
  test.use({ viewport: { width: 360, height: 740 } });

  // AUSGESCHRIEBEN STATT AUS `UEBERLAUF_SEITEN` GEFILTERT: ein Filter ueber `label` haenge an einer
  // Zeichenkette, die niemand als Schnittstelle liest — waechst die Liste oben um eine vierte
  // BuFDi, fuehre er sie hier still mit, und die Zahl im Kopfkommentar stimmte nicht mehr.
  for (const seite of [
    { label: "/ (Alina)", pfad: "/", email: "alina@localtest.me", groups: GRUPPE, titel: "Meine Woche" },
    { label: "/ (Rike, Koordination)", pfad: "/", email: "rike@localtest.me", groups: KOORDINATION, titel: "Verteilung" },
    { label: "/ (Malte, Auftraggeber)", pfad: "/", email: "malte@localtest.me", groups: GRUPPE, titel: "Meine Aufträge" },
    {
      label: "/verteilen?ansicht=brett",
      pfad: "/verteilen?ansicht=brett",
      email: "rike@localtest.me",
      groups: KOORDINATION,
      titel: "Verteilen",
    },
  ]) {
    test(`${seite.label} laeuft bei 360px nicht ueber`, async ({ page }) => {
      await devLogin(page, {
        host: HOST,
        groups: seite.groups,
        email: seite.email,
        callbackPath: seite.pfad,
      });
      const antwort = await page.goto(`http://${HOST}:3100${seite.pfad}`);
      expect(antwort?.status(), `${seite.pfad}: HTTP`).toBe(200);
      await expect(page.getByRole("heading", { name: seite.titel, level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");

      const mass = await ueberlauf(page);
      expect(
        mass.scrollDoc,
        `${seite.label} bei 360px (documentElement): ${mass.schuldige.join(" | ")}`,
      ).toBeLessThanOrEqual(mass.vwDoc);
      expect(
        mass.scrollBody,
        `${seite.label} bei 360px (body): ${mass.schuldige.join(" | ")}`,
      ).toBeLessThanOrEqual(mass.vwBody);
    });
  }
});

/*
 * DIE DREI ZUSAGEN DER FUEHRUNGSKARTE, DIE KEIN ANDERES TOR TREFFEN KANN (§3.3, §11.2) — je Rolle
 * einmal: die Karte IST DA, sie steht AN ERSTER STELLE, und darin steht HOECHSTENS EIN
 * `.ant-btn-primary`.
 *
 * WARUM `aufgaben-flaeche` UND NICHT `aufgaben-content`: `page.tsx` legt `aufgaben-content` um den
 * GANZEN Einstieg, der `SeitenKopf` steht darin — „die Karte ist das erste Element" waere dort
 * schlicht falsch und der Test einer, der etwas anderes misst, als sein Name sagt (dieselbe
 * Familie wie die Fallen 10 und 11). Und der Zaehler misst denselben Wrapper, damit ein
 * Primaerknopf der SUITE-SHELL die Zusage weder falsch-rot machen noch auf „hoechstens zwei"
 * abschwaechen kann.
 *
 * WAS HIER BEWUSST NICHT STEHT: die BELEGUNGEN der Karte. Sie sind ein reiner Selektor ueber
 * Datenzeilen und werden in `_lib/lage.test.ts` erschoepfend geprueft — samt dem Wochenendfall,
 * dessen e2e-Fassung zwischen zwei Laeufen kippte, ohne dass sich Daten geaendert haetten.
 */
for (const rolle of [
  { label: "Alina (BuFDi)", email: "alina@localtest.me", groups: GRUPPE, titel: "Meine Woche" },
  { label: "Rike (Koordination)", email: "rike@localtest.me", groups: KOORDINATION, titel: "Verteilung" },
  { label: "Malte (Auftraggeber)", email: "malte@localtest.me", groups: GRUPPE, titel: "Meine Aufträge" },
]) {
  test(`Fuehrungskarte: ${rolle.label} sieht sie an erster Stelle, mit hoechstens einem Primaerknopf`, async ({
    page,
  }) => {
    await devLogin(page, {
      host: HOST,
      groups: rolle.groups,
      email: rolle.email,
      callbackPath: "/",
    });
    const antwort = await page.goto(`http://${HOST}:3100/`);
    expect(antwort?.status(), "die Karte darf die Seite nicht auf 500 werfen").toBe(200);
    await expect(page.getByRole("heading", { name: rolle.titel, level: 1 })).toBeVisible();

    const flaeche = page.getByTestId("aufgaben-flaeche");
    await expect(flaeche, "der Wrapper unter dem Seitenkopf fehlt").toHaveCount(1);

    // ERSTES KIND UEBER EINEN CSS-SELEKTOR, NICHT UEBER `evaluate`: `> :first-child` bindet die
    // POSITION, nicht nur die Anwesenheit — eine Karte irgendwo in der Flaeche erfuellt das nicht.
    await expect(
      page.locator("[data-testid='aufgaben-flaeche'] > :first-child[data-rolle='fuehrung']"),
      "die Fuehrungskarte ist nicht das erste Kind von `aufgaben-flaeche`",
    ).toHaveCount(1);

    // „GENAU EIN PRIMAERKNOPF" IST ALS HOECHSTENS EINER GELESEN (§3.4, Regel P): gibt es fuer diese
    // Person mit dieser Aufgabe in diesem Zustand keine Zustandsaktion, gibt es KEINEN — ein roter
    // Knopf ohne Zustandswechsel waere eine Behauptung.
    const primaer = await flaeche.locator(".ant-btn-primary").count();
    expect(primaer, `${rolle.label}: ${primaer} Primaerknoepfe in \`aufgaben-flaeche\``).toBeLessThanOrEqual(1);
  });
}

/**
 * DUNKELMODUS UEBER `getComputedStyle`, NICHT UEBER DAS ATTRIBUT (Brief Teil 4, Punkt 6): eine
 * unaufgeloeste `--auf-*`-Variable meldet sich nie von selbst — nur eine tatsaechliche Auswertung
 * zeigt, ob sie zu ihrem dunklen Wert aufloest. ERST DER HELLE WERT, DANN ERST NACH DEM UMSCHALTEN
 * DER DUNKLE (advisor-Hinweis): nur den dunklen Wert zu pruefen koennte "der Umschalter wirkt" nicht
 * von "beide Zweige sind ohnehin dunkel" unterscheiden.
 *
 * `setAttribute("data-theme", "dark")` IM BROWSER REICHT HIER (Vorbild `shell-mobil.spec.ts`s
 * `--iuk-marke`-Test): `--auf-*` haengt an `:root[data-theme="dark"] .modul` in
 * `aufgaben.module.css` und wertet das Attribut direkt aus, unabhaengig vom serverseitig gesetzten
 * Theme-Cookie.
 */
test("Dunkelmodus: --auf-tinte loest ueber getComputedStyle tatsaechlich zu ihrem dunklen Wert auf", async ({
  page,
}) => {
  await devLogin(page, { host: HOST, groups: GRUPPE, email: "alina@localtest.me", callbackPath: "/" });
  const inhalt = page.getByTestId("aufgaben-content");

  const hell = await inhalt.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--auf-tinte").trim(),
  );
  expect(hell, "heller Wert weicht von aufgaben.module.css ab").toBe("#1a1d20");

  await page.evaluate(() => document.documentElement.setAttribute("data-theme", "dark"));
  const dunkel = await inhalt.evaluate((el) =>
    getComputedStyle(el).getPropertyValue("--auf-tinte").trim(),
  );
  expect(
    dunkel,
    "im Dunkelmodus bleibt --auf-tinte auf dem hellen Wert stehen — eine unaufgeloeste CSS-Variable meldet sich nie von selbst",
  ).toBe("#ece9e2");
});
