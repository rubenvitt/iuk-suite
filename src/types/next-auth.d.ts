import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      groups: string[];
      // Slugs der Fachgruppen, für die die Person Gruppenleitung ist. Modul-
      // spezifisch ausgewertet (feedback), aber wie `groups` aus dem ID-Token.
      fachgruppen: string[];
      isAdmin: boolean;
    };
    error?: string;
  }

  interface User {
    groups?: string[];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    groups?: string[];
    fachgruppen?: string[];
    accessToken?: string;
    idToken?: string;
    refreshToken?: string;
    expiresAt?: number;
    error?: string;
  }
}
