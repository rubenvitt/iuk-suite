"use client";

import { usePathname, useRouter } from "next/navigation";

/**
 * Schreibt URL-getriebene Filter relativ auf den aktuellen Modulpfad.
 *
 * Dies ist die einzige `usePathname`-Datei des Moduls. `replace` haelt
 * Filtereingaben aus der Browser-Historie heraus; leere Werte entfernen den
 * jeweiligen Parameter. Ein leerer Patch setzt alle Filter zurueck.
 */
export function useUrlFilter(): (params: Record<string, string>) => void {
  const router = useRouter();
  const pathname = usePathname();

  return (params: Record<string, string>) => {
    const suchparameter = Object.keys(params).length === 0
      ? new URLSearchParams()
      : new URLSearchParams(window.location.search);

    for (const [name, wert] of Object.entries(params)) {
      if (wert) suchparameter.set(name, wert);
      else suchparameter.delete(name);
    }

    const query = suchparameter.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  };
}
