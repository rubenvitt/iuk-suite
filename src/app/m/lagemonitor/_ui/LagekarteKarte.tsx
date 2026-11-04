"use client";

/**
 * Die Karte der Lagekarte (IDA-348): maplibre mit dem Stil des Online-Monitors (`_lib/kartenstil.ts`). Ein Punkt
 * wird per Klick gesetzt und lässt sich ziehen; eine Fläche bekommt mit jedem Klick eine Ecke, bis sie geschlossen
 * ist, und jede Ecke lässt sich ziehen. Die übrigen Objekte stehen grau dahinter. Nur über `next/dynamic` laden
 * (`ssr: false`): maplibre braucht `window` und WebGL schon beim Import.
 *
 * Der Zustand gehört dem Formular (`LagekarteFormular`); diese Komponente zeigt ihn nur und meldet Klicks und
 * Verschiebungen zurück. Eine Ecke, die gerade gezogen wird, schreibt nur in die Karte und erst am Ende ins Formular,
 * sonst baute jede Mausbewegung die Griffe neu und der Zug risse ab.
 */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Map as MapLibreMap, Marker, setWorkerUrl, type GeoJSONSource } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { farbe as farbeAus, type Farbe } from "../_lib/kategorieRegeln";
import { basemapStyle, type KartenTheme } from "../_lib/kartenstil";
import { ECKEN_MAX, runde, type Art, type Lage } from "../_lib/lagekarteRegeln";
import v from "./verwaltung.module.css";

// maplibre baut die Worker-URL zur Laufzeit neben seinem eigenen Bündel zusammen, das sieht kein Bundler. Die
// Worker-Datei ist in sich geschlossen; als Asset über `new URL(…, import.meta.url)` liegt sie unter `/_next/static`.
setWorkerUrl(new URL("../../../../../node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

export interface Hintergrund {
  id: string;
  art: Art;
  name: string;
  breite: number | null;
  laenge: number | null;
  ring: Lage[] | null;
}

export interface Start {
  /** Umschließendes Rechteck `[[West, Süd], [Ost, Nord]]`; ohne es `mitte` und `zoom`. */
  umriss: [Lage, Lage] | null;
  mitte: Lage;
  zoom: number;
}

function themeJetzt(): KartenTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}
function themeAbo(melden: () => void): () => void {
  const b = new MutationObserver(melden);
  b.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => b.disconnect();
}

const GRAU = { light: "#6b737b", dark: "#9aa2ab" } as const;
const LEER = { type: "FeatureCollection", features: [] } as const;
type Daten = Parameters<GeoJSONSource["setData"]>[0];

type Merkmal = { type: "Feature"; properties: { name: string }; geometry: { type: "Polygon"; coordinates: Lage[][] } | { type: "Point"; coordinates: Lage } };

function hintergrundDaten(andere: readonly Hintergrund[]): Daten {
  const features = andere.flatMap((o): Merkmal[] => {
    if (o.art === "flaeche" && o.ring && o.ring.length >= 3) {
      return [{ type: "Feature", properties: { name: o.name }, geometry: { type: "Polygon", coordinates: [[...o.ring, o.ring[0]]] } }];
    }
    if (o.art === "punkt" && o.breite !== null && o.laenge !== null) {
      return [{ type: "Feature", properties: { name: o.name }, geometry: { type: "Point", coordinates: [o.laenge, o.breite] } }];
    }
    return [];
  });
  return { type: "FeatureCollection", features } as Daten;
}

function entwurfDaten(art: Art, ecken: readonly Lage[], geschlossen: boolean): Daten {
  if (art !== "flaeche" || ecken.length < 2) return LEER as unknown as Daten;
  const zu = geschlossen || ecken.length >= 3;
  return {
    type: "Feature",
    properties: {},
    geometry: zu && ecken.length >= 3
      ? { type: "Polygon", coordinates: [[...ecken, ecken[0]]] }
      : { type: "LineString", coordinates: [...ecken] },
  };
}

export default function LagekarteKarte({
  art,
  farbe,
  svg,
  punkt,
  ecken,
  geschlossen,
  andere,
  start,
  onPunkt,
  onEcken,
}: {
  art: Art;
  farbe: Farbe;
  svg: string | null;
  punkt: Lage | null;
  ecken: Lage[];
  geschlossen: boolean;
  andere: Hintergrund[];
  start: Start;
  onPunkt: (l: Lage) => void;
  onEcken: (e: Lage[]) => void;
}) {
  const theme = useSyncExternalStore(themeAbo, themeJetzt, () => "light" as const);
  const container = useRef<HTMLDivElement>(null);
  const [karte, setKarte] = useState<MapLibreMap | null>(null);
  // Die Klick-Behandlung sieht immer den letzten Stand, ohne die Karte neu zu bauen.
  const stand = useRef({ art, ecken, geschlossen, onPunkt, onEcken });
  useEffect(() => {
    stand.current = { art, ecken, geschlossen, onPunkt, onEcken };
  });
  const startRef = useRef(start);
  const ansicht = useRef<{ mitte: Lage; zoom: number } | null>(null);

  // Neu gebaut nur beim Wechsel Hell/Dunkel; der Ausschnitt bleibt dabei stehen.
  useEffect(() => {
    const s = startRef.current;
    const m = new MapLibreMap({
      container: container.current!,
      style: basemapStyle(theme),
      center: ansicht.current?.mitte ?? s.mitte,
      zoom: ansicht.current?.zoom ?? s.zoom,
      attributionControl: { compact: true },
      dragRotate: false,
      pitchWithRotate: false,
    });
    m.touchZoomRotate.disableRotation();
    if (!ansicht.current && s.umriss) {
      const [[w, sd], [o, n]] = s.umriss;
      if (w === o && sd === n) m.jumpTo({ center: [w, sd], zoom: 15 });
      else m.fitBounds(s.umriss, { padding: 48, maxZoom: 16, animate: false });
    }
    m.on("moveend", () => {
      const c = m.getCenter();
      ansicht.current = { mitte: [c.lng, c.lat], zoom: m.getZoom() };
    });
    m.on("click", (e) => {
      // Ein Klick auf einen Griff ist kein neuer Punkt.
      if (e.originalEvent.target !== m.getCanvas()) return;
      const l: Lage = [runde(e.lngLat.lng), runde(e.lngLat.lat)];
      const st = stand.current;
      if (st.art === "punkt") st.onPunkt(l);
      else if (!st.geschlossen && st.ecken.length < ECKEN_MAX) st.onEcken([...st.ecken, l]);
    });
    m.once("style.load", () => {
      const grau = GRAU[theme];
      m.addSource("andere", { type: "geojson", data: LEER as unknown as Daten });
      m.addSource("entwurf", { type: "geojson", data: LEER as unknown as Daten });
      const flaeche = ["==", ["geometry-type"], "Polygon"] as ["==", ["geometry-type"], "Polygon"];
      m.addLayer({ id: "andere-flaeche", type: "fill", source: "andere", filter: flaeche, paint: { "fill-color": grau, "fill-opacity": 0.1 } });
      m.addLayer({ id: "andere-kante", type: "line", source: "andere", filter: flaeche, paint: { "line-color": grau, "line-width": 1 } });
      m.addLayer({ id: "andere-punkt", type: "circle", source: "andere", filter: ["==", ["geometry-type"], "Point"], paint: { "circle-radius": 4, "circle-color": grau, "circle-stroke-color": theme === "dark" ? "#15181d" : "#ffffff", "circle-stroke-width": 1 } });
      m.addLayer({
        id: "andere-name",
        type: "symbol",
        source: "andere",
        layout: { "text-field": ["get", "name"], "text-font": ["noto_sans_regular"], "text-size": 11, "text-offset": [0, 1.1], "text-anchor": "top" },
        paint: { "text-color": grau, "text-halo-color": theme === "dark" ? "#15181d" : "#ffffff", "text-halo-width": 1.2 },
      });
      m.addLayer({ id: "entwurf-flaeche", type: "fill", source: "entwurf", filter: flaeche, paint: { "fill-color": "#000", "fill-opacity": 0.16 } });
      m.addLayer({ id: "entwurf-kante", type: "line", source: "entwurf", paint: { "line-color": "#000", "line-width": 1.5 } });
      setKarte(m);
    });
    return () => {
      setKarte(null);
      m.remove();
    };
  }, [theme]);

  const ton = theme === "dark" ? farbeAus(farbe).nacht : farbeAus(farbe).ton;

  useEffect(() => {
    if (!karte) return;
    (karte.getSource("andere") as GeoJSONSource | undefined)?.setData(hintergrundDaten(andere));
  }, [karte, andere]);

  useEffect(() => {
    if (!karte) return;
    (karte.getSource("entwurf") as GeoJSONSource | undefined)?.setData(entwurfDaten(art, ecken, geschlossen));
    karte.setPaintProperty("entwurf-flaeche", "fill-color", ton);
    karte.setPaintProperty("entwurf-kante", "line-color", ton);
    karte.getCanvas().style.cursor = art === "punkt" || (!geschlossen && ecken.length < ECKEN_MAX) ? "crosshair" : "";
  }, [karte, art, ecken, geschlossen, ton]);

  // Griffe: der Punkt mit seinem Zeichen, bei einer Fläche jede Ecke.
  useEffect(() => {
    if (!karte) return;
    const griffe: Marker[] = [];
    if (art === "punkt" && punkt) {
      const el = document.createElement("div");
      el.className = v.kartenPunkt;
      el.setAttribute("aria-hidden", "true");
      if (svg) {
        const img = document.createElement("img");
        img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
        img.alt = "";
        img.draggable = false;
        el.appendChild(img);
      }
      const mk = new Marker({ element: el, draggable: true }).setLngLat(punkt).addTo(karte);
      mk.on("dragend", () => {
        const l = mk.getLngLat();
        stand.current.onPunkt([runde(l.lng), runde(l.lat)]);
      });
      griffe.push(mk);
    }
    if (art === "flaeche") {
      ecken.forEach((ecke, i) => {
        const el = document.createElement("div");
        el.className = v.kartenEcke;
        el.setAttribute("aria-hidden", "true");
        el.dataset.ecke = String(i);
        const mk = new Marker({ element: el, draggable: true }).setLngLat(ecke).addTo(karte);
        const neu = (): Lage[] => {
          const l = mk.getLngLat();
          return ecken.map((e, j): Lage => (j === i ? [runde(l.lng), runde(l.lat)] : e));
        };
        mk.on("drag", () => (karte.getSource("entwurf") as GeoJSONSource | undefined)?.setData(entwurfDaten("flaeche", neu(), geschlossen)));
        mk.on("dragend", () => stand.current.onEcken(neu()));
        griffe.push(mk);
      });
    }
    return () => griffe.forEach((g) => g.remove());
  }, [karte, art, punkt, svg, ecken, geschlossen]);

  return <div ref={container} className={v.karte} data-testid="lagekarte-karte" data-bereit={karte ? "true" : "false"} />;
}
