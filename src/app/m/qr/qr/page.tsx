import Link from "next/link";
import { QrDisplay } from "@/app/m/qr/QrDisplay";

/**
 * QR-Ansicht, der URL-Vertrag aus easy-qr: `/qr?data=…&label=…&kind=…`.
 *
 * `data` trägt den FERTIG kodierten QR-String — alle Erzeuger rufen
 * `payloadToQrString` selbst auf, bevor sie hierher navigieren. Diese Seite
 * kodiert deshalb nichts nach: ein zweites `tel:`-Präfix ergäbe eine Nummer,
 * die niemand erreicht, und ein `JSON.parse` scheiterte an jedem geteilten
 * WLAN-Link. Sie reicht `data` unverändert an die Anzeige durch.
 *
 * `kind` steuert allein, ob der Rohtext zusaetzlich unter dem Code steht, und
 * braucht darum keine Pruefung gegen eine Liste gueltiger Werte.
 */
export default async function QrViewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;

  // Doppelt gesetzte Parameter (`?kind=wifi&kind=x`) kommen als Array an. Das
  // ungeprueft durchzureichen hat Zaehne: `kind !== "wifi"` waere fuer ein Array
  // wahr und stellte die Passwort-Zeile wieder gross unter den Code, und ein
  // zweites `data` ergaebe still einen Code mit "tel:+49301234,x" statt einer
  // waehlbaren Nummer. Nur der erste Wert zaehlt — so las easy-qr ueber
  // `searchParams.get()` schon immer.
  const first = (value: string | string[] | undefined) =>
    Array.isArray(value) ? value[0] : value;
  const data = first(params.data);
  const label = first(params.label);
  const kind = first(params.kind);

  if (!data) {
    return <p data-testid="qr-missing">Kein Inhalt übergeben.</p>;
  }

  // WLAN-Zeile und vCard sind Maschinentext — die WLAN-Zeile zeigte noch dazu
  // das Passwort im Klartext groß unter dem Code.
  const showRawData = kind !== "wifi" && kind !== "vcard";

  return (
    <div className="flex flex-col items-center gap-4" data-testid="qr-view">
      {/* Landepunkt geteilter Links: ohne diesen Weg zurück käme man von hier
          nur über die Adresszeile zum Generator. */}
      <Link href="/" className="min-h-[var(--tap)] self-start leading-[var(--tap)]">
        ← Zurück
      </Link>
      {label ? <h1 className="text-lg font-bold">{label}</h1> : null}
      <QrDisplay text={data} label={label ?? "qr"} />
      <p className="text-center text-sm text-[var(--color-stahl)]">
        <strong>Helligkeit auf Maximum.</strong> Doppeltippen für Vollbild, lang drücken zum
        Invertieren.
      </p>
      {showRawData ? (
        <p
          data-testid="qr-raw"
          className="w-full max-w-md text-center font-mono text-sm break-all text-[var(--color-stahl)]"
        >
          {data}
        </p>
      ) : null}
    </div>
  );
}
