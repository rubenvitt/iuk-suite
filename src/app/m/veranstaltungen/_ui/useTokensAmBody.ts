"use client";

import { useEffect } from "react";
import s from "./veranstaltungen.module.css";

/** Hängt die Farb-Tokens an den `body`, solange die Seite steht: das Flyin rendert in ein Portal. */
export function useTokensAmBody(): void {
  useEffect(() => {
    document.body.classList.add(s.tokens);
    return () => document.body.classList.remove(s.tokens);
  }, []);
}
