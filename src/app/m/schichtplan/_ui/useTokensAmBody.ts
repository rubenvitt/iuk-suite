"use client";

import { useEffect } from "react";
import s from "./schichtplan.module.css";

/** Hängt die Farb-Tokens an den `body`, solange die Seite steht: Schubladen und Auswahllisten rendern in Portale. */
export function useTokensAmBody(): void {
  useEffect(() => {
    document.body.classList.add(s.tokens);
    return () => document.body.classList.remove(s.tokens);
  }, []);
}
