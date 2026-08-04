import {
  AppstoreOutlined,
  BorderOutlined,
  CaretUpOutlined,
  CommentOutlined,
  ContainerOutlined,
  DesktopOutlined,
  FolderOutlined,
  GlobalOutlined,
  QrcodeOutlined,
} from "@ant-design/icons";
import type { ComponentType } from "react";

/*
 * Icon-Name (aus ModuleDef.icon, Registry) -> @ant-design/icons Komponente.
 * Unbekannte Namen fallen beim Konsumenten auf AppstoreOutlined zurueck, statt
 * den Render zu crashen — eine neue Registry-Zeile soll die Kopfzeile nicht
 * zerlegen.
 *
 * DER RUECKFALL IST DIE FALLE, NICHT DIE RETTUNG: `icon` muss ein Schluessel
 * DIESER Map sein, nicht bloss ein existierender @ant-design/icons-Name. Beim
 * Registry-Eintrag von `files` (2026-07-30) stand hier `FolderOutlined` nicht
 * drin — der Eintrag trug daraufhin still das Portal-Icon. Kein Fehler, kein
 * Log, nur ein falsches Bild in jeder Kopfzeile. Deshalb ist die Map exportiert
 * und `SuiteNav.test.tsx` prueft sie GEGEN DIE REGISTRY: jedes Modul-Icon muss
 * hier stehen. Wer ein Modul ergaenzt, wird vom Test daran erinnert.
 *
 * DIESE MAP IST CLIENT-ONLY. EINE SERVER COMPONENT DARF SIE NICHT IMPORTIEREN.
 *
 * Hier stand bis zum 2026-08-01 das Gegenteil („eine Server Component erhaelt
 * hier also echte Komponenten"). Das war falsch, und zwar teuer: es ist genau
 * der Satz, der T41 einen halben Tag gekostet hat. GEMESSEN am 2026-08-01 mit
 * einer Wegwerf-Route unter `next dev` (Next 16.2.6/Turbopack,
 * `@ant-design/icons` 6.3.2), per curl abgerufen:
 *
 *   Server Component, `import { ICONS } from "@/core/shell/icons"`, ohne ein
 *   einziges Icon zu rendern
 *     -> HTTP 500
 *        TypeError: (0 , _react.createContext) is not a function
 *        at module evaluation (src/core/shell/icons.ts:1:1)
 *
 * DER IMPORT WIRFT, NICHT DER RENDER — die Zeile 1 dieser Datei ist die Stelle.
 * Ein direktes `from "@ant-design/icons"` in der Seite faellt identisch aus.
 * Dass `ICONS` ein WERT ist, rettet also nichts; es gibt den Wert nie.
 *
 * URSACHE — der ganze Weg, und er ist feiner als „das Paket traegt kein
 * `use client`". Jedes Glied nachlesbar in `node_modules`, ohne Server:
 *
 *   `@ant-design/icons`  (der NACKTE Spezifizierer)
 *     -> `exports["."].node.import` = `./index.mjs`      (package.json)
 *     -> `index.mjs` ist dreizeilig: `export * from './lib/index.js'`
 *     -> `lib/index.js` ist CJS und zieht `lib/components/Context.js`
 *     -> dort steht auf MODULEBENE
 *        `const IconContext = (0, _react.createContext)({})`,
 *        und `_react` ist in der RSC-Ebene Nexts vendored Shim
 *        `next/dist/server/route-modules/app-page/vendored/rsc/react.js`
 *        (nicht `react/react.react-server.js` — die Wirkung ist dieselbe,
 *        der Weg ist es nicht), der `createContext` nicht hat.
 *
 * DIE INTEROP-FORM IST DER FINGERABDRUCK: `(0, _react.createContext)` steht nur
 * in `lib/`; `es/components/Context.js` schreibt schlicht `createContext({})`.
 * Der Fehlertext oben nennt also selbst den `lib`-Zweig, und der Chunk
 * bestaetigt ihn — `.next/dev/server/chunks/ssr/00zm_@ant-design_icons_lib_*.js`,
 * erste Modulzeile `@ant-design/icons/lib/components/Context.js [app-rsc]`, im
 * RSC-Graphen daneben `index.mjs`, `lib/index.js`, `lib/icons/index.js`.
 *
 * NICHT „DER BARREL" IST DIE FALLE, SONDERN DER NACKTE SPEZIFIZIERER. Hier
 * stand bis zum 2026-08-01 `es/index.js` als Ursache; das ist gemessen falsch.
 * Dieselbe Wegwerf-Route mit `{ FolderOutlined }` aus `@ant-design/icons/es`
 * lieferte HTTP 200 und `<span class="anticon anticon-folder"><svg …>` im
 * SSR-HTML — in derselben Sitzung, mit dem nackten Spezifizierer als
 * Kontrolle auf 500. (`…/lib` ist davon kein zweiter Beleg: `exports["./lib"]`
 * zeigt unter `import` auf dieselbe `./es/index.js`.)
 *
 * WARUM `…/es` durchgeht — und das ist KEIN FREIBRIEF FUER DEN SUBPFAD,
 * sondern gilt nur der Import-FORM. Zwei Messungen, gleiche Route, gleiche
 * Sitzung:
 *
 *   `import { FolderOutlined } from "@ant-design/icons/es"`  -> HTTP 200
 *   `import * as Icons       from "@ant-design/icons/es"`    -> HTTP 500
 *      `createContext only works in Client Components`
 *
 * Der Namensraum-Import laesst sich nicht auf einen Tiefenpfad umschreiben und
 * zwingt den Barrel in die RSC-Ebene; dann faellt `es/components/Context.js`
 * genauso um wie sein `lib`-Zwilling, nur mit Reacts freundlicherem Text statt
 * `undefined`. Beim benannten Import liegen im RSC-Graphen dagegen NUR
 * `es/icons/FolderOutlined.js` und `es/components/AntdIconLight.js (client
 * reference proxy)` — `es/index.js` und `es/components/Context.js` nie.
 * (Dass Nexts `optimizePackageImports` die Umschreibung macht — das Paket steht
 * per Default drin, `next/dist/server/config.js:995` — liegt nahe, ist aber
 * gegen blosses Tree-Shaking nicht separat belegt. Fuer die Regel unten macht
 * es keinen Unterschied.)
 *
 * VERLAESSLICH IST ALSO NUR DER TIEFEN-IMPORT, und der aus der Paketstruktur
 * heraus statt aus einer Bundler-Optimierung: `exports["./*"]` zeigt unter
 * `import` auf `./es/icons/*.js`, und `es/icons/FolderOutlined.js` importiert
 * ausser React nur die SVG-Daten (`@ant-design/icons-svg/lib/asn/…`) und
 * `../components/AntdIconLight` — ein Blatt MIT `"use client"` (wie
 * `AntdIcon.js`, und in `es/` wie in `lib/`). `Context` kommt auf diesem Weg
 * nie vor. Gemessen: `@ant-design/icons/FolderOutlined` -> HTTP 200, Icon im
 * SSR-HTML.
 *
 * WARUM HIER TROTZDEM KEIN `"use client"` STEHT — auch das gemessen, nicht
 * gefolgert: mit der Direktive lieferte dieselbe Route HTTP 200 und
 * `Object.keys(ICONS).length === 0`. Die Server Component bekaeme eine
 * Client-Referenz statt des Objekts (Falle 6), jeder Nachschlag liefe ins
 * Leere, und der Rueckfall oben traege still das falsche Icon; erst beim
 * Rendern kaeme `Element type is invalid … but got: undefined`. LAUT IST BESSER
 * ALS STILL: ohne Direktive scheitert der Fehlgriff sofort und mit Adresse.
 *
 * KEIN GATE SIEHT DAS. `pnpm typecheck` und `pnpm build` bleiben gruen, und
 * Vitest kann es strukturell nicht finden — dort laedt `react` ueber die
 * `default`-Bedingung, `createContext` ist vorhanden, die Icons rendern
 * klaglos. `icons.test.ts` prueft deshalb den QUELLTEXT: jeder Importeur dieser
 * Map und jeder Importeur des nackten Spezifizierers muss `"use client"`
 * tragen — statisch, dynamisch, als Nebeneffekt oder per `require`. Den echten
 * 500 sieht nur ein echter Abruf.
 *
 * Wer in einer Server Component ein Symbol braucht, nimmt eigenes Inline-SVG
 * (Vorbild: `m/files/(verwaltung)/shares/[id]/page.tsx`) oder schiebt das Icon
 * in eine Client-Insel.
 *
 * UND WOZU DANN NOCH DIE EIGENE DATEI? Der Grund, aus dem die Map am 2026-07-30
 * aus `SuiteNav.tsx` hierher gezogen wurde („damit eine Server Component sie
 * lesen kann"), ist nach der Messung hinfaellig — keine kann. Was die Trennung
 * heute traegt: `SuiteNav.test.tsx` bekommt die Map ohne die Client-Maschinerie
 * der Navigation daneben, und die Datei ist der eine Ort, an dem die
 * Client-Only-Zusage steht und geprueft wird. Sie ist also KEIN Baustein fuer
 * Server-Code — wer sie dafuer heben will, braucht eine Map aus NAMEN statt aus
 * Komponenten, und das ist ein eigener Entwurf, kein Verschieben.
 */
export const ICONS: Record<string, ComponentType> = {
  AppstoreOutlined,
  QrcodeOutlined,
  BorderOutlined,
  CaretUpOutlined,
  GlobalOutlined,
  DesktopOutlined,
  CommentOutlined,
  FolderOutlined,
  ContainerOutlined,
};
