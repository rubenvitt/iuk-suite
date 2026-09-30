/**
 * Die Farben des Plans. Papier kennt keinen Dunkelmodus: die Zeichnung ist auch am Bildschirm
 * weiß, damit Ansicht und Ausdruck gleich aussehen (Spec A3). Suite-Rot nur als Marke im Kopf,
 * nie als Fläche (Falle 3): „hervorheben" ist ein warmes Hellorange.
 */
export const FARBE = { tinte: "#000000", papier: "#ffffff", anker: "#8c8c8c", hervor: "#ffe3b3", abzeichen: "#f0f0f0", marke: "#c8000f" } as const;
export const STRICH = { karte: 0.25, linie: 0.3, duenn: 0.15, hervor: 0.6 } as const;
