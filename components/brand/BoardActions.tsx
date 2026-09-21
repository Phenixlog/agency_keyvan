"use client";

import { useState } from "react";
import { Check, Copy, FileDown } from "lucide-react";

const BUTTON = "inline-flex items-center justify-center gap-2 rounded-pill bg-soft px-4 py-2 text-small font-semibold text-ink transition duration-(--duration-fast) ease-cimaise hover:bg-line";

/** The browser's own "Save as PDF": the print stylesheet hides the workshop and keeps the board. */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className={BUTTON}>
      <FileDown size={16} strokeWidth={1.75} /> Exporter en PDF
    </button>
  );
}

export function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={BUTTON}
      onClick={async () => {
        await navigator.clipboard.writeText(new URL(path, window.location.origin).toString());
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check size={16} strokeWidth={1.75} /> : <Copy size={16} strokeWidth={1.75} />}
      {copied ? "Lien copié" : "Copier le lien"}
    </button>
  );
}
