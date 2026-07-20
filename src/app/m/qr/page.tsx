import Link from "next/link";
import { auth } from "@/core/auth";
import { listPresets } from "@/app/m/qr/_lib/presets";
import { PresetGrid } from "@/app/m/qr/PresetGrid";
import { UrlInput } from "@/app/m/qr/UrlInput";
import { HistoryList } from "@/app/m/qr/HistoryList";

const KINDS = [
  { href: "/wifi", label: "WLAN", icon: "📶" },
  { href: "/tel", label: "Telefon", icon: "📞" },
  { href: "/contact", label: "Kontakt", icon: "👤" },
];

export default async function QrHomePage() {
  const session = await auth();
  // Anonym: keine Presets. Das Modul ist requiresAuth: false, session ist dann
  // schlicht null — kein Fehler, nur weniger Inhalt.
  const presets = session?.user ? await listPresets() : [];

  return (
    <div className="flex flex-col gap-6" data-testid="qr-home">
      <UrlInput />

      <section aria-label="Weitere Typen" className="flex flex-col gap-3">
        <h2 className="font-semibold">Andere Typen</h2>
        <div className="grid grid-cols-3 gap-3">
          {KINDS.map((k) => (
            <Link
              key={k.href}
              href={k.href}
              className="flex min-h-[var(--tap-xl)] flex-col items-center justify-center gap-1 rounded border border-[var(--color-linie)] p-2"
            >
              <span aria-hidden="true" className="text-2xl">
                {k.icon}
              </span>
              <span className="text-sm">{k.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {session?.user ? (
        <PresetGrid presets={presets} />
      ) : (
        <p data-testid="qr-login-hint" className="text-[var(--color-stahl)]">
          {/* Die MinimalShell hat keinen Login-Einstieg im Header, und ein
              anonymes Modul leitet nirgends automatisch hin — ohne diesen Link
              wüsste der Nutzer vom Anmelden, käme aber nicht hin. */}
          <Link href={`/login?callbackUrl=${encodeURIComponent("/")}`} className="underline">
            Anmelden
          </Link>
          , um persönliche Schnellzugriffe zu sehen.
        </p>
      )}

      <HistoryList />
    </div>
  );
}
