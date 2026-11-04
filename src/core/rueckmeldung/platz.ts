/**
 * DER PLATZ UNTER DEM SCHWEBENDEN RÜCKMELDEKNOPF (IDA-352).
 *
 * Kein `"use client"` (Falle 6): `core/tabelle` liest den Griff in seiner
 * Messung, und ein Wert aus einem Client-Modul käme anderswo als Referenz an.
 *
 * `PLATZ` ist der Platzhalter im Fluss, den der Knopf am Ende des Inhalts
 * stehen lässt. `FUSSLEISTE` markiert eine Leiste, die selbst unten im Bild (Wert „schmal“:
 * nur unter 768px) klebt: solange eine steht, tritt der Knopf samt Platz zurück.
 */
export const PLATZ = "rueckmeldung-platz";
export const FUSSLEISTE = "data-fussleiste";
