"use client";

import { useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Drawer, Input, type InputRef } from "antd";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import type { Icons8Name } from "@/core/ikonen/katalog";
import type { Rueckmeldeweg } from "@/core/rueckmeldung/konfiguration";
import { RueckmeldungFlyin } from "@/core/rueckmeldung/RueckmeldungFlyin";
import { appEbene } from "@/core/shell/appEbene";
import { befehle, istPalettenKuerzel, type Befehl } from "@/core/shell/befehle";
import { usePalettenKuerzel } from "@/core/shell/Befehlspalette";
import type { Auswahl, GeordneterEintrag } from "@/core/shell/launcherAuswahl";
import { gruppiereNav } from "@/core/shell/navAbschnitte";
import { NavIkone } from "@/core/shell/navIkonen";
import { Nutzermenue } from "@/core/shell/Nutzermenue";
import { ortSeite } from "@/core/shell/ortTitel";
import { aktiverEintrag } from "@/core/shell/SuiteNav";
import { SEITENWECHSEL } from "@/core/shell/seitenwechselKlassen";
import type { LauncherEintrag, SuiteNavItem } from "@/core/shell/types";
import { useVerlassenWache } from "@/core/shell/verlassenWache";
import { suchbegriff } from "@/core/suche";
import { ThemeToggle } from "@/core/theme/ThemeToggle";
// Die suiteweite Suche des Portals (IDA-301) als Server Action: sie liest die Sitzung selbst, und
// jedes Modul filtert seine Treffer nach Rechten. Der zweite erlaubte Import aus dem Portal
// (`launcherEintraege.test.ts`, „Grenze zwischen core/shell und dem Modul portal“).
import { sucheAktion } from "@/app/m/portal/sucheAktion";
import m from "./menue.module.css";

/**
 * Was der Server (`MenueRahmen`) dem Menü mitgibt — nur Serialisierbares (Falle 9): fertige
 * hrefs, fertige Listen, Zeichen als Schlüssel. `process.env` und die Portal-Datenbank gibt es
 * im Client nicht.
 */
export interface MenueDaten {
  modulKey: string;
  modulTitel: string;
  modulIcon: Icons8Name;
  modulBereich: string;
  /** Startseite des Moduls, oder `null` ohne Host. */
  modulHref: string | null;
  nav: SuiteNavItem[];
  eintraege: LauncherEintrag[];
  auswahl: Auswahl;
  bereiche: readonly string[];
  portalHref: string | null;
  /** Die suiteweite Suche (IDA-301), oder `null` ohne Portal-Adresse. */
  suchHref: string | null;
  angemeldet: boolean;
  userName: string | null;
  userBild: string | null;
  profilHref: string | null;
  rueckmeldeweg: Rueckmeldeweg | null;
  modulStand: string | null;
}

type Ebene = "seiten" | "apps";

/** Eine Zeile unter „Springen zu“: ein Befehl oder ein Inhaltstreffer, dann heißt die Gruppe nach dem Modul. */
type Zeile = Omit<Befehl, "gruppe"> & { gruppe: string; fund?: boolean };

type Ergebnisse = Awaited<ReturnType<typeof sucheAktion>>;
interface Inhalte {
  laedt: boolean;
  ergebnisse: Ergebnisse;
  fehler: boolean;
}
const KEINE_INHALTE: Inhalte = { laedt: false, ergebnisse: [], fehler: false };

/** So lange nach dem letzten Tastendruck, bevor die Module gefragt werden. */
const VERZOEGERUNG_MS = 250;

/** Stabile Abmeldefunktion für `useSyncExternalStore` — die Antwort ändert sich nie. */
const NIE_AENDERND = () => () => {};

/**
 * EIN MENÜ, ZWEI EBENEN (IDA-347, Etappe 2; Entwurf `designrichtungen-poc/navigator.tsx`).
 *
 * Oben steht die App, in der du bist; darunter ihre Seiten. Ein Tipp auf die App schiebt die
 * zweite Ebene herein: alle Apps (Angeheftet, Zuletzt, nach Bereichen) und das Portal. Darüber
 * „Springen zu": Seiten dieser App, Apps und Dienste — dieselbe Logik wie die Befehlspalette
 * (`befehle.ts`) — und darunter die Inhalte der Module (IDA-391). Es ist die eine Suche der Suite:
 * die Startseite des Portals hat kein eigenes Feld mehr.
 *
 * Es ersetzt in `FullShell` zwei Navigationen — den App-Umschalter im Kopf und die Seitenleiste
 * bzw. den Drawer —, die bis dahin um „wo bin ich" und „wohin kann ich" konkurrierten.
 *
 * DIE AKTIVMARKIERUNG bleibt `aktiverEintrag` (`SuiteNav.tsx`) mit ihren drei ausgeschriebenen
 * Fallen; `"page"` nur beim echten Treffer, sonst `"true"`. Die Gruppierung ist `gruppiereNav`.
 *
 * WECHSEL DER EBENE: die verdeckte Ebene ist `inert` (aus Tabfolge und Vorlesebaum), und der
 * Fokus geht mit — auf „zurück" beim Hineinschieben, auf den App-Knopf beim Zurück. Ohne das
 * stünde er nach dem Klick auf einem Knoten, der gerade unbedienbar geworden ist.
 *
 * VERLASSEN-SPERRE (IDA-357): jeder Link im Menü und der Sprung per Enter laufen durch
 * `useVerlassenWache` — sperrt ein Modul das Verlassen (offener Speicherkonflikt im Kommplan-Editor),
 * fragt das Menü vorher nach. Der eigene App-Eintrag führt nirgends hin und trägt `data-verlassen-frei`.
 *
 * `testIdZusatz`: Seitenleiste und Blatt können gleichzeitig im Baum stehen; einmalige testIds
 * tragen im Blatt deshalb `-drawer` (dieselbe Regel wie `theme-toggle-drawer`).
 */
export function Navigator({
  daten,
  testIdZusatz = "",
  aufNavigation,
  suchFeld,
}: {
  daten: MenueDaten;
  testIdZusatz?: string;
  /** Das Blatt schließt sich nach der Wahl eines Ziels selbst — `next/link` lädt die Seite nicht neu. */
  aufNavigation?: () => void;
  suchFeld?: React.Ref<InputRef>;
}) {
  const { modulKey, modulTitel, modulIcon, modulBereich, modulHref, nav, eintraege, auswahl, bereiche } = daten;
  const pfad = usePathname();
  const router = useRouter();
  const wache = useVerlassenWache();
  const [ebene, setEbene] = useState<Ebene>("seiten");
  const [suche, setSuche] = useState("");
  const [inhalte, setInhalte] = useState<Inhalte>(KEINE_INHALTE);
  const kuerzel = usePalettenKuerzel();
  const wecker = useRef<ReturnType<typeof setTimeout> | null>(null);
  const anfrage = useRef(0);
  const appKnopf = useRef<HTMLButtonElement>(null);
  const zurueckKnopf = useRef<HTMLButtonElement>(null);
  const trefferListe = useRef<HTMLDivElement>(null);
  const fokusNachWechsel = useRef(false);
  const id = useId();
  const seitenId = `${id}-seiten`;
  const appsId = `${id}-apps`;

  useEffect(() => {
    if (!fokusNachWechsel.current) return;
    fokusNachWechsel.current = false;
    (ebene === "apps" ? zurueckKnopf : appKnopf).current?.focus({ preventScroll: true });
  }, [ebene]);

  /*
   * Die aufgerufene Seite steht im Blick: die Lagerbuch-Verwaltung trägt über zwanzig Einträge, und
   * ein Eintrag unter der Kante gibt die Orientierung nicht, für die die Liste da ist. `nearest`
   * scrollt nur die Ebene und nur, wenn er nicht schon sichtbar ist.
   */
  const seitenEbene = useRef<HTMLDivElement>(null);
  useEffect(() => {
    seitenEbene.current
      ?.querySelector<HTMLElement>('[data-testid="nav-link"][aria-current]')
      ?.scrollIntoView?.({ block: "nearest" });
  }, [pfad]);

  useEffect(() => () => {
    if (wecker.current) clearTimeout(wecker.current);
  }, []);

  /**
   * Die Menütreffer rechnet der Browser sofort; die Module fragt er kurz nach dem letzten
   * Tastendruck, und nur die jüngste Antwort zählt (ein langsamer Rücklauf überschriebe sonst eine
   * neuere). Ohne Portal-Adresse gibt es auch keine Suche dahinter.
   */
  function suchen(wert: string) {
    setSuche(wert);
    if (wecker.current) clearTimeout(wecker.current);
    const nummer = ++anfrage.current;
    const begriff = daten.suchHref ? suchbegriff(wert) : null;
    if (!begriff) {
      setInhalte(KEINE_INHALTE);
      return;
    }
    setInhalte({ laedt: true, ergebnisse: [], fehler: false });
    wecker.current = setTimeout(() => {
      // Ein gescheiterter Aufruf ist kein „Keine Treffer“: die Module sind dann gar nicht gefragt.
      sucheAktion(begriff).then(
        (ergebnisse) => {
          if (nummer === anfrage.current) setInhalte({ laedt: false, ergebnisse, fehler: false });
        },
        () => {
          if (nummer === anfrage.current) setInhalte({ laedt: false, ergebnisse: [], fehler: true });
        },
      );
    }, VERZOEGERUNG_MS);
  }

  function wechsle(nach: Ebene) {
    fokusNachWechsel.current = true;
    setEbene(nach);
  }

  const aktiv = aktiverEintrag(pfad, nav);
  // Das Portal steht als eigener Eintrag am Fuß der App-Ebene, nicht noch einmal in einem Bereich.
  const gruppen = useMemo(
    () => appEbene(eintraege.filter((e) => e.key !== "portal"), auswahl, bereiche),
    [eintraege, auswahl, bereiche],
  );
  const begriff = suchbegriff(suche);
  const treffer = useMemo((): Zeile[] | null => {
    if (!suche.trim()) return null;
    // Der Eintrag „In allen Modulen nach … suchen“ der Palette entfällt hier: die Treffer stehen
    // gleich darunter, und der lange Satz lief in der schmalen Leiste ins Abgeschnittene.
    const menue: Zeile[] = befehle({ eingabe: suche, nav, eintraege, suchHref: null });
    const funde: Zeile[] = inhalte.ergebnisse.flatMap((e) =>
      e.zustand === "treffer"
        ? e.treffer.map((t) => ({ key: `inhalt:${e.modul}:${t.id}`, titel: t.titel, hinweis: t.art, gruppe: e.titel, href: t.href, extern: false, fund: true }))
        : [],
    );
    const ganzeSuche: Zeile[] =
      daten.suchHref && begriff && funde.length > 0
        ? [{ key: "suche", titel: "Alle Treffer zeigen", gruppe: "", href: `${daten.suchHref}?q=${encodeURIComponent(begriff)}`, extern: false }]
        : [];
    return [...menue, ...funde, ...ganzeSuche];
  }, [suche, begriff, nav, eintraege, inhalte.ergebnisse, daten.suchHref]);
  const teilsGescheitert = inhalte.fehler || inhalte.ergebnisse.some((e) => e.zustand === "fehler");

  function fertig() {
    suchen("");
    aufNavigation?.();
  }

  function folge(b: Zeile) {
    // Ein externes Ziel öffnet einen neuen Tab, die Seite bleibt stehen.
    if (b.extern) geheZu(b);
    else wache.pruefe(() => geheZu(b));
  }

  function geheZu(b: Zeile) {
    fertig();
    if (b.extern) window.open(b.href, "_blank", "noopener,noreferrer");
    else if (b.gruppe === "Seiten") router.push(b.href);
    else window.location.assign(b.href);
  }

  function taste(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && treffer?.[0]) {
      e.preventDefault();
      folge(treffer[0]);
    } else if (e.key === "ArrowDown" && treffer?.length) {
      e.preventDefault();
      trefferListe.current?.querySelector<HTMLElement>('[data-testid="befehl"]')?.focus();
    } else if (e.key === "Escape" && suche) {
      // Nur bei gefülltem Feld: sonst gehört `Escape` dem Blatt. `stopPropagation`, weil rc-portal
      // einen globalen `keydown`-Hörer an `window` hängt (Begründung an `NavListe`, `SuiteNav.tsx`).
      suchen("");
      e.stopPropagation();
    }
  }

  function tasteInTreffern(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    const alle = [...(trefferListe.current?.querySelectorAll<HTMLElement>('[data-testid="befehl"]') ?? [])];
    const i = alle.indexOf(document.activeElement as HTMLElement);
    if (i === -1) return;
    e.preventDefault();
    if (e.key === "ArrowUp" && i === 0) {
      (document.querySelector(`[data-springen="${id}"]`) as HTMLElement | null)?.focus();
      return;
    }
    alle[Math.min(alle.length - 1, Math.max(0, i + (e.key === "ArrowDown" ? 1 : -1)))]?.focus();
  }

  const zeichen = (
    <span className={`${m.appzeichen} ${m.appzeichenGross}`} aria-hidden="true">
      <Icons8Ikone name={modulIcon} groesse={18} />
    </span>
  );
  const appText = (
    <span className={m.appKnopfText}>
      <strong data-testid={`module-title${testIdZusatz}`}>{modulTitel}</strong>
      <span>{modulBereich}</span>
    </span>
  );

  return (
    <nav aria-label="Navigation" className={m.navi} onClickCapture={wache.beiKlick}>
      {daten.angemeldet ? (
        <div className={m.suche}>
          <Input
            ref={suchFeld}
            data-testid={`befehlspalette-eingabe${testIdZusatz}`}
            data-springen={id}
            value={suche}
            onChange={(e) => suchen(e.target.value)}
            onKeyDown={taste}
            allowClear
            placeholder="Springen zu"
            aria-label="Springen zu"
            autoComplete="off"
            prefix={<Icons8Ikone name="search" groesse={14} />}
            // Das Kürzel nur mit Tastatur und Maus (`.kuerzel`, menue.module.css), nie am Telefon.
            suffix={
              suche ? undefined : (
                <kbd data-testid={`springen-kuerzel${testIdZusatz}`} className={m.kuerzel}>
                  {kuerzel}
                </kbd>
              )
            }
          />
        </div>
      ) : null}

      {treffer ? (
        <div ref={trefferListe} className={m.treffer} onKeyDown={tasteInTreffern} aria-label="Treffer" role="region">
          {treffer.length === 0 && !inhalte.laedt && !teilsGescheitert ? <div className={m.nichts}>Keine Treffer</div> : null}
          {treffer.map((b, i) => {
            const kopf = b.gruppe && (i === 0 || treffer[i - 1].gruppe !== b.gruppe) ? b.gruppe : null;
            const inhalt = (
              <>
                <span className={m.eintragText}>{b.titel}</span>
                {b.hinweis ? <span className={m.eintragNeben}>{b.hinweis}</span> : null}
              </>
            );
            return (
              <div key={b.key} className={m.gruppe}>
                {kopf ? <div className={m.abschnitt}>{kopf}</div> : null}
                {b.gruppe === "Seiten" ? (
                  <Link href={b.href} data-testid="befehl" className={m.eintrag} onClick={fertig}>
                    {inhalt}
                  </Link>
                ) : (
                  <a
                    href={b.href}
                    data-testid="befehl"
                    className={b.fund ? `${m.eintrag} ${m.fund}` : m.eintrag}
                    target={b.extern ? "_blank" : undefined}
                    rel={b.extern ? "noopener noreferrer" : undefined}
                    onClick={fertig}
                  >
                    {inhalt}
                  </a>
                )}
              </div>
            );
          })}
          {inhalte.laedt ? (
            <div data-testid="springen-laedt" className={m.status} role="status">
              Suche in den Modulen …
            </div>
          ) : teilsGescheitert ? (
            <div data-testid="springen-fehler" className={m.status} role="status">
              Nicht alle Module ließen sich durchsuchen.
            </div>
          ) : null}
        </div>
      ) : (
        <div className={m.spur} data-ebene={ebene}>
          <div ref={seitenEbene} id={seitenId} className={m.ebene} inert={ebene !== "seiten"}>
            {daten.angemeldet ? (
              <button
                ref={appKnopf}
                type="button"
                data-testid={`app-umschalter${testIdZusatz}`}
                className={m.appKnopf}
                aria-expanded={ebene === "apps"}
                aria-controls={appsId}
                aria-label={`${modulTitel}, App wechseln`}
                onClick={() => wechsle("apps")}
              >
                {zeichen}
                {appText}
                <Icons8Ikone name="swap" groesse={16} className={m.pfeil} />
              </button>
            ) : (
              // Anonym kein Umschalter: eine Liste, deren Einträge sämtlich zum Login umleiten,
              // verspräche „hier kannst du hin" (Begründung in `SuiteHeader`).
              <a href={modulHref ?? "/"} className={m.appKnopf}>
                {zeichen}
                {appText}
              </a>
            )}
            {nav.length > 0 ? (
              <div data-testid={`modulleiste${testIdZusatz}`}>
                {gruppiereNav(nav).map((g) => (
                  <div key={g.titel ?? "__ohne"} className={m.gruppe}>
                    {g.titel ? (
                      <div data-testid="nav-abschnitt" className={m.abschnitt}>
                        {g.titel}
                      </div>
                    ) : null}
                    {g.items.map((e) => (
                      <Link
                        key={e.key}
                        href={e.href}
                        data-testid="nav-link"
                        className={m.eintrag}
                        aria-current={aktiv?.schluessel === e.key ? (aktiv.genau ? "page" : "true") : undefined}
                        onClick={aufNavigation}
                      >
                        <NavIkone name={e.ikon} />
                        <span className={m.eintragText}>{e.title}</span>
                      </Link>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          {daten.angemeldet ? (
            <div
              id={appsId}
              data-testid={`app-panel${testIdZusatz}`}
              className={m.ebene}
              inert={ebene !== "apps"}
            >
              <button ref={zurueckKnopf} type="button" className={m.zurueck} onClick={() => wechsle("seiten")}>
                <Icons8Ikone name="chevron-left" groesse={16} />
                {modulTitel}
              </button>
              {gruppen.map((g) => (
                <div key={g.titel} className={m.gruppe}>
                  <div data-testid="app-abschnitt" className={m.abschnitt}>
                    {g.titel}
                  </div>
                  {g.eintraege.map((e) => (
                    <AppEintrag key={e.key} e={e} aktuell={e.key === modulKey} zurueck={() => wechsle("seiten")} />
                  ))}
                </div>
              ))}
              {daten.portalHref ? (
                <a
                  href={daten.portalHref}
                  data-testid="app-portal"
                  className={`${m.eintrag} ${m.portal}`}
                  aria-current={modulKey === "portal" ? "true" : undefined}
                >
                  <Icons8Ikone name="apps" groesse={18} />
                  <span className={m.eintragText}>Portal</span>
                </a>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </nav>
  );
}

function AppEintrag({ e, aktuell, zurueck }: { e: GeordneterEintrag; aktuell: boolean; zurueck: () => void }) {
  const link = (
    <a
      data-testid="app-eintrag"
      className={m.eintrag}
      href={e.href}
      target={e.extern ? "_blank" : undefined}
      rel={e.extern ? "noopener noreferrer" : undefined}
      aria-current={aktuell ? "true" : undefined}
      data-verlassen-frei={aktuell ? "" : undefined}
      onClick={(ev) => {
        // Die eigene App ist kein Ziel, sondern der Weg zurück zu ihren Seiten. Mittelklick und
        // „in neuem Tab" bleiben ein echter Link.
        if (!aktuell || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.button !== 0) return;
        ev.preventDefault();
        zurueck();
      }}
    >
      <span className={m.appzeichen} aria-hidden="true">
        {e.iconUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- fremdes Dienstsymbol, kein Next-Bild
          <img src={e.iconUrl} alt="" referrerPolicy="no-referrer" loading="lazy" />
        ) : (
          <Icons8Ikone name={e.icon ?? "link"} groesse={14} />
        )}
      </span>
      <span className={m.eintragText}>{e.title}</span>
    </a>
  );
  if (!e.verwaltung) return link;
  return (
    <div className={m.eintragZeile}>
      {link}
      <a data-testid="app-verwaltung" className={m.zweitlink} href={e.verwaltung.href} aria-label={e.verwaltung.titel}>
        Verwaltung
      </a>
    </div>
  );
}

/**
 * DIE HÜLLE DES MENÜS — beide Ausprägungen stehen im Baum, CSS zeigt eine davon (ein
 * JS-Breakpoint zeigte beim ersten Render die falsche, `docs/design/README.md`).
 *
 * - Desktop (`.nurDesktop`): das Menü dauerhaft, darunter Konto und Theme.
 * - Telefon (`.nurMobil`): EIN Ort-Knopf (App und Seite). Er öffnet dasselbe Menü als Blatt von
 *   unten; Konto und Theme stehen dort am Fuß.
 *
 * DAS BLATT UND DER FOKUS (Falle 24): `autoFocus={false}`, sonst nimmt der Container den Fokus
 * zeitversetzt nach den Effekten des Inhalts. Gesetzt wird er in `afterOpenChange` nur, wenn er
 * noch auf dem Ort-Knopf oder nirgends steht — hat jemand bis dahin selbst getippt, bleibt er dort.
 * Beim Schließen gibt rc-drawer ihn an den Ort-Knopf zurück; das ist hier richtig, denn das Blatt
 * schließt nur aus sich selbst heraus.
 *
 * KEIN `forceRender`: geschlossen legt der Drawer nichts an, also auch kein Portal auf dem Server
 * (die Begründung, warum das zählt, steht am Drawer in `SuiteNav.tsx`) und nichts, was im Druck
 * eine leere Seite anhängt.
 *
 * ⌘K / Strg+K springt ins Suchfeld — auf dem Telefon über das Blatt. Ob die Seitenleiste zu sehen
 * ist, fragt der Tastendruck selbst (`matchMedia`), nicht der Render.
 */
export function SuiteLeiste({ daten }: { daten: MenueDaten }) {
  const pfad = usePathname();
  const [offen, setOffen] = useState(false);
  const leistenSuche = useRef<InputRef>(null);
  const blattSuche = useRef<InputRef>(null);
  const suchenNachOeffnen = useRef(false);
  const ortKnopf = useRef<HTMLButtonElement>(null);
  const montiert = useSyncExternalStore(NIE_AENDERND, () => true, () => false);

  useEffect(() => {
    if (!daten.angemeldet) return;
    const kuerzel = (e: KeyboardEvent) => {
      if (!istPalettenKuerzel(e)) return;
      e.preventDefault();
      if (window.matchMedia("(min-width: 768px)").matches) {
        leistenSuche.current?.focus();
      } else {
        suchenNachOeffnen.current = true;
        setOffen(true);
        blattSuche.current?.focus();
      }
    };
    window.addEventListener("keydown", kuerzel);
    return () => window.removeEventListener("keydown", kuerzel);
  }, [daten.angemeldet]);

  const seite = ortSeite(pfad, daten.nav, daten.modulKey === "portal");

  return (
    <>
      <div className={`${m.leiste} ${m.nurDesktop}`}>
        <Navigator daten={daten} suchFeld={leistenSuche} />
        <div className={m.fuss}>
          <Nutzermenue
            angemeldet={daten.angemeldet}
            userName={daten.userName}
            userBild={daten.userBild}
            profilHref={daten.profilHref}
            rueckmeldeweg={daten.rueckmeldeweg}
            modulStand={daten.modulStand}
            mitNamen
            placement="topLeft"
          />
          <ThemeToggle />
        </div>
      </div>

      <div className={`${m.ortZeile} ${m.nurMobil}`}>
        <button
          ref={ortKnopf}
          type="button"
          data-testid="menue-knopf"
          className={m.ort}
          aria-haspopup="dialog"
          aria-expanded={offen}
          onClick={() => setOffen(true)}
        >
          <span className={`${m.appzeichen} ${m.appzeichenGross}`} aria-hidden="true">
            <Icons8Ikone name={daten.modulIcon} groesse={18} />
          </span>
          <span className={m.ortText}>
            {seite ? <span className={m.ortApp}>{daten.modulTitel}</span> : null}
            <span className={m.ortSeite}>{seite ?? daten.modulTitel}</span>
          </span>
          <Icons8Ikone name="chevron-down" groesse={16} className={m.pfeil} />
        </button>
      </div>

      <Drawer
        open={offen}
        onClose={() => setOffen(false)}
        placement="bottom"
        size="88dvh"
        closable={false}
        destroyOnHidden
        autoFocus={false}
        title={null}
        rootClassName={m.blatt}
        styles={{ body: { padding: 0, display: "flex", flexDirection: "column" } }}
        afterOpenChange={(jetzt) => {
          if (!jetzt) return;
          const frei = document.activeElement === ortKnopf.current || document.activeElement === document.body;
          const suchen = suchenNachOeffnen.current;
          suchenNachOeffnen.current = false;
          if (!frei) return;
          // Ohne ⌘K nicht ins Suchfeld: am Telefon klappte sonst bei jedem Öffnen die Tastatur auf.
          if (suchen) blattSuche.current?.focus();
          else document.querySelector<HTMLElement>('[data-testid="app-umschalter-drawer"]')?.focus();
        }}
        aria-label="Navigation"
      >
        <div data-testid="suite-drawer" className={m.blattInhalt} style={{ viewTransitionName: SEITENWECHSEL.blatt }}>
          <div className={m.griff} aria-hidden="true" />
          <Navigator
            daten={daten}
            testIdZusatz="-drawer"
            suchFeld={blattSuche}
            aufNavigation={() => setOffen(false)}
          />
          <div className={`${m.fuss} ${m.blattFuss}`}>
            <Nutzermenue
              angemeldet={daten.angemeldet}
              userName={daten.userName}
              userBild={daten.userBild}
              profilHref={daten.profilHref}
              rueckmeldeweg={daten.rueckmeldeweg}
              modulStand={daten.modulStand}
              mitNamen
              placement="topLeft"
              testIdZusatz="-drawer"
            />
            <ThemeToggle testId="theme-toggle-drawer" />
          </div>
        </div>
      </Drawer>

      {/* Das Rückmelde-Flyin hängt hier, weil die Leiste auf jeder angemeldeten Seite steht; Knopf
          und Portal-Kachel öffnen es über `flyinZustand.ts`. Erst nach der Hydration — ein Portal
          hat auf dem Server kein `document`. */}
      {montiert && daten.rueckmeldeweg?.art === "formular" ? <RueckmeldungFlyin modulKey={daten.modulKey} /> : null}
    </>
  );
}
