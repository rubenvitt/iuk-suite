import NextAuth from "next-auth";
import { authConfig } from "@/core/auth/config";

/**
 * Die Konfiguration wird PRO ANFRAGE gebaut, nicht einmal beim Modulstart —
 * `NextAuth(fn)` statt `NextAuth(obj)`. Warum das noetig ist und was
 * `request === undefined` bedeutet, steht in `config.ts`. Diese Datei enthaelt
 * bewusst nichts weiter: alles Pruefbare liegt in `config.ts`, `refresh.ts`,
 * `cookies.ts` und `redirect.ts`.
 */
export const { auth, handlers, signIn, signOut } = NextAuth(authConfig);
