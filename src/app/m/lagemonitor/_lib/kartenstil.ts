// Übernommen aus lagemonitor bcb19c4 (28.10.2026): frontend/src/map/basemapStyle.ts (gekürzt: nur online, ohne Offline-Kacheln)
// Übernommen aus Suchlage d621418 (27.10.2026): frontend/src/map/basemapStyle.ts
// Übernommen aus Lifeline Hub 3eb9115f2 (16.10.2026): frontend/src/pages/lagekarte/basemapStil.ts
// Der Kartenstil des Online-Lagemonitors, damit die Lagekarte in der Verwaltung so aussieht wie am Monitor. Nur Typen
// aus maplibre: die Datei läuft auch in Vitest und auf dem Server, die Karte selbst lädt `_ui/LagekarteKarte.tsx`.
import type { ExpressionSpecification, LayerSpecification, StyleSpecification } from "maplibre-gl";

export type KartenTheme = "light" | "dark";

const FARBEN: Record<KartenTheme, Record<string, string>> = {
  light: {
    hintergrund: "#e8e8e8",
    erde: "#f5f5f3",
    // Landnutzung nach Shortbread-`kind` gestaffelt (statt einfarbig): Grün/Wald, Acker, Wohnen,
    // Gewerbe, Friedhof, Sand.
    gruen: "#dfeacb",
    wald: "#d3e2ba",
    acker: "#f0efe1",
    wohn: "#efece6",
    gewerbe: "#e9e3dd",
    friedhof: "#dbe4d2",
    sand: "#f1e7cf",
    site: "#ece9e4",
    wasser: "#a8cdf0",
    wasserLinie: "#7bb0e4",
    gebaeude: "#e2ddd6",
    strasse: "#ffffff",
    strasseKante: "#dad8d2",
    bahn: "#c6c2bb",
    pfad: "#cdcac2",
    grenze: "#c39cc3",
    label: "#3a3a3a",
    labelWasser: "#3f6ea8",
    labelHalo: "#ffffff",
  },
  dark: {
    hintergrund: "#0f1115",
    erde: "#15181d",
    gruen: "#1a2417",
    wald: "#1f2c19",
    acker: "#191c15",
    wohn: "#1a1d22",
    gewerbe: "#1e2128",
    friedhof: "#172015",
    sand: "#25241b",
    site: "#1b1e24",
    wasser: "#15233f",
    wasserLinie: "#33578c",
    gebaeude: "#23262b",
    strasse: "#33373d",
    strasseKante: "#41454c",
    bahn: "#3a3e45",
    pfad: "#2b2e34",
    grenze: "#5a3f5a",
    label: "#d6d6d6",
    labelWasser: "#8fb4e0",
    labelHalo: "#0f1115",
  },
};

/**
 * Das Shortbread-Layer-Set über der Vector-Source `src`. source-layer-Namen und `kind`-Vokabulare
 * sind gegen das reale Shortbread-Schema verifiziert; einen "landuse"-Layer gibt es dort nicht
 * (→ "land"). Bewusst nicht gerendert (Clutter): pois, addresses, aerialways, public_transport,
 * street_labels_points, streets_polygons_labels, boundary_labels.
 */
function regionLayers(f: Record<string, string>, src: string): LayerSpecification[] {
  const label = {
    "text-color": f.label,
    "text-halo-color": f.labelHalo,
    "text-halo-width": 1.2,
  } as const;
  const wasserLabel = {
    "text-color": f.labelWasser,
    "text-halo-color": f.labelHalo,
    "text-halo-width": 1.1,
  } as const;
  const textFeld: ExpressionSpecification = ["coalesce", ["get", "name_de"], ["get", "name"]];
  // Reihenfolge = Zeichenreihenfolge (unten → oben): Flächen, Wasser, Gebäude, Straßen, Grenzen, Labels.
  const layers: LayerSpecification[] = [
    // Meer/Ozean (eigener Layer "ocean", ein großes Polygon je Küstenkachel) als Wasser-Fill ganz
    // unten.
    {
      id: "ozean",
      source: src,
      "source-layer": "ocean",
      type: "fill",
      paint: { "fill-color": f.wasser },
    },

    // --- Landnutzung nach kind gestaffelt ---
    {
      id: "land",
      source: src,
      "source-layer": "land",
      type: "fill",
      paint: {
        "fill-color": [
          "match",
          ["get", "kind"],
          ["forest", "wood"],
          f.wald,
          [
            "grass",
            "meadow",
            "grassland",
            "scrub",
            "heath",
            "park",
            "village_green",
            "garden",
            "orchard",
            "allotments",
            "greenfield",
            "plant_nursery",
            "greenhouse_horticulture",
            "recreation_ground",
            "pitch",
            "playground",
            "wet_meadow",
            "swamp",
          ],
          f.gruen,
          ["farmland", "farmyard"],
          f.acker,
          ["residential"],
          f.wohn,
          [
            "industrial",
            "commercial",
            "retail",
            "railway",
            "quarry",
            "landfill",
            "brownfield",
            "garages",
            "construction",
          ],
          f.gewerbe,
          ["cemetery", "grave_yard"],
          f.friedhof,
          ["sand", "beach"],
          f.sand,
          f.erde,
        ],
      },
    },
    // Areale (Parkplätze, Schul-/Klinikgelände …) dezent grau unterlegen.
    {
      id: "sites",
      source: src,
      "source-layer": "sites",
      type: "fill",
      minzoom: 13,
      paint: { "fill-color": f.site, "fill-opacity": 0.55 },
    },

    // --- Gewässer ---
    {
      id: "wasser",
      source: src,
      "source-layer": "water_polygons",
      type: "fill",
      paint: { "fill-color": f.wasser },
    },
    // Dämme (Flächen) + Piers/Molen (begehbar → straßenfarben) über der Wasserfläche.
    {
      id: "staudamm_flaechen",
      source: src,
      "source-layer": "dam_polygons",
      type: "fill",
      minzoom: 12,
      paint: { "fill-color": f.gebaeude },
    },
    {
      id: "pier_flaechen",
      source: src,
      "source-layer": "pier_polygons",
      type: "fill",
      minzoom: 13,
      paint: { "fill-color": f.strasse },
    },
    {
      // Linien-Gewässer: Bäche, Flüsse, Gräben.
      id: "wasser_linien",
      source: src,
      "source-layer": "water_lines",
      type: "line",
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": f.wasserLinie,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          9,
          ["match", ["get", "kind"], ["river", "canal"], 0.8, 0.3],
          14,
          ["match", ["get", "kind"], ["river", "canal"], 2.2, ["stream"], 1.2, 0.7],
          17,
          ["match", ["get", "kind"], ["river", "canal"], 4, ["stream"], 2, 1.2],
        ],
      },
    },
    // Fährverbindungen (gestrichelt) + Damm-/Pier-Linien.
    {
      id: "faehren",
      source: src,
      "source-layer": "ferries",
      type: "line",
      minzoom: 9,
      paint: {
        "line-color": f.wasserLinie,
        "line-dasharray": [2, 2],
        "line-width": ["interpolate", ["linear"], ["zoom"], 9, 0.6, 14, 1.2],
      },
    },
    {
      id: "staudamm_linien",
      source: src,
      "source-layer": "dam_lines",
      type: "line",
      minzoom: 13,
      paint: { "line-color": f.strasseKante, "line-width": 1 },
    },
    {
      id: "pier_linien",
      source: src,
      "source-layer": "pier_lines",
      type: "line",
      minzoom: 14,
      paint: { "line-color": f.strasseKante, "line-width": 1.4 },
    },

    // --- Bebauung / Bauwerke ---
    // Brücken-Deck bodenfarben unterlegen, damit darüber laufende Straßen sauber ablesbar sind.
    {
      id: "bruecken",
      source: src,
      "source-layer": "bridges",
      type: "fill",
      minzoom: 14,
      paint: { "fill-color": f.erde, "fill-opacity": 0.85 },
    },
    {
      id: "gebaeude",
      source: src,
      "source-layer": "buildings",
      type: "fill",
      minzoom: 13,
      paint: { "fill-color": f.gebaeude },
    },
    // Fußgängerzonen/Plätze als Fläche (Straßen-Linien laufen darüber).
    {
      id: "strassen_flaechen",
      source: src,
      "source-layer": "street_polygons",
      type: "fill",
      minzoom: 14,
      paint: { "fill-color": f.strasse },
    },

    // --- Straßen (Zeichenreihenfolge: Bahn/Wege unten, Hauptstraßen oben) ---
    {
      id: "bahn",
      source: src,
      "source-layer": "streets",
      type: "line",
      filter: ["==", ["get", "kind"], "rail"],
      paint: {
        "line-color": f.bahn,
        "line-dasharray": [3, 2],
        "line-width": ["interpolate", ["linear"], ["zoom"], 10, 0.6, 16, 1.6],
      },
    },
    {
      id: "wege",
      source: src,
      "source-layer": "streets",
      type: "line",
      minzoom: 13,
      filter: [
        "match",
        ["get", "kind"],
        ["path", "track", "footway", "steps", "cycleway", "bridleway"],
        true,
        false,
      ],
      paint: {
        "line-color": f.pfad,
        "line-dasharray": [2, 1.5],
        "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.5, 17, 1.4],
      },
    },
    {
      id: "strassen_neben",
      source: src,
      "source-layer": "streets",
      type: "line",
      filter: [
        "match",
        ["get", "kind"],
        ["residential", "unclassified", "living_street", "service", "pedestrian"],
        true,
        false,
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": f.strasse,
        "line-width": ["interpolate", ["linear"], ["zoom"], 11, 0.4, 14, 1.4, 17, 4],
      },
    },
    {
      id: "strassen_haupt_kante",
      source: src,
      "source-layer": "streets",
      type: "line",
      filter: [
        "match",
        ["get", "kind"],
        ["motorway", "trunk", "primary", "secondary", "tertiary"],
        true,
        false,
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": f.strasseKante,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 1.2, 14, 4.5, 17, 9],
      },
    },
    {
      id: "strassen_haupt",
      source: src,
      "source-layer": "streets",
      type: "line",
      filter: [
        "match",
        ["get", "kind"],
        ["motorway", "trunk", "primary", "secondary", "tertiary"],
        true,
        false,
      ],
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": f.strasse,
        "line-width": ["interpolate", ["linear"], ["zoom"], 8, 0.6, 14, 3, 17, 7],
      },
    },

    // --- Verwaltungsgrenzen (gestrichelt, dezent) ---
    {
      id: "grenzen",
      source: src,
      "source-layer": "boundaries",
      type: "line",
      filter: ["all", ["has", "admin_level"], ["<=", ["to-number", ["get", "admin_level"]], 8]],
      paint: {
        "line-color": f.grenze,
        "line-opacity": 0.6,
        "line-dasharray": [3, 2],
        "line-width": ["interpolate", ["linear"], ["zoom"], 4, 0.6, 12, 1.4],
      },
    },

    // --- Beschriftung ---
    {
      id: "wasser_linien_namen",
      source: src,
      "source-layer": "water_lines_labels",
      type: "symbol",
      layout: {
        "symbol-placement": "line",
        "text-field": textFeld,
        "text-font": ["noto_sans_regular"],
        "text-size": 10,
      },
      paint: wasserLabel,
    },
    {
      id: "wasser_flaechen_namen",
      source: src,
      "source-layer": "water_polygons_labels",
      type: "symbol",
      layout: { "text-field": textFeld, "text-font": ["noto_sans_regular"], "text-size": 11 },
      paint: wasserLabel,
    },
    {
      id: "strassennamen",
      source: src,
      "source-layer": "street_labels",
      type: "symbol",
      layout: {
        "symbol-placement": "line",
        "text-field": textFeld,
        "text-font": ["noto_sans_regular"],
        "text-size": 11,
      },
      paint: label,
    },
    {
      id: "orte",
      source: src,
      "source-layer": "place_labels",
      type: "symbol",
      layout: {
        "text-field": textFeld,
        "text-font": ["noto_sans_regular"],
        "text-size": [
          "match",
          ["get", "kind"],
          ["city"],
          15,
          ["town"],
          13,
          ["village"],
          11,
          ["suburb", "neighbourhood", "hamlet"],
          10,
          12,
        ],
      },
      paint: label,
    },
  ];
  return layers;
}

const VERSATILES = "https://tiles.versatiles.org";

/** Heller bzw. dunkler Shortbread-Stil, gespeist von VersaTiles (online, wie der Online-Monitor). */
export function basemapStyle(theme: KartenTheme): StyleSpecification {
  const f = FARBEN[theme];
  return {
    version: 8,
    glyphs: `${VERSATILES}/assets/glyphs/{fontstack}/{range}.pbf`,
    sources: {
      basemap: {
        type: "vector",
        tiles: [`${VERSATILES}/tiles/osm/{z}/{x}/{y}`],
        minzoom: 0,
        maxzoom: 14,
        attribution: "© OpenStreetMap-Mitwirkende",
      },
    },
    layers: [
      { id: "hintergrund", type: "background", paint: { "background-color": f.erde } },
      ...regionLayers(f, "basemap"),
    ],
  };
}
