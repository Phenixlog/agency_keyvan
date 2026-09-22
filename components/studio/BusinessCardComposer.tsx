"use client";

import { Contact } from "lucide-react";
import { CARD_FIELDS } from "@/lib/tiles/model";

const FIELD = "w-full rounded-inner bg-card px-3 py-2 text-body text-ink placeholder:text-mute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * The details of a business card, typed by the user and drawn verbatim: the front carries the brand,
 * the back carries the person. Nothing here is written by a model. Three pairs come back in one lot.
 */
export function BusinessCardComposer({ hasLogo }: { hasLogo: boolean }) {
  return (
    <section aria-label="La carte de visite" className="grid gap-4 rounded-inner bg-tint p-4 transition-colors duration-(--duration-retint) ease-cimaise">
      <span className="flex items-center gap-2 text-small font-semibold text-ink">
        <Contact size={16} strokeWidth={1.75} className="flex-none" /> Les coordonnées du verso, dessinées telles quelles
      </span>
      <div className="grid gap-3 md:grid-cols-2">
        {CARD_FIELDS.map((field) => (
          <label key={field.key} className={`grid gap-1 ${field.key === "address" || field.key === "tagline" ? "md:col-span-2" : ""}`}>
            <span className="text-small text-ink">{field.label}</span>
            <input name={`card_${field.key}`} maxLength={field.max} placeholder={field.placeholder} required={field.key === "name"} className={FIELD} autoComplete={field.key === "email" ? "email" : field.key === "phone" ? "tel" : "off"} />
          </label>
        ))}
      </div>
      <p className="font-mono text-meta text-mute">
        3 paires recto + verso, à plat, prêtes à envoyer à l’imprimeur · 6 images · environ {hasLogo ? 24 : 15} centimes · 2 à 3 minutes{hasLogo ? " · le vrai logo posé sur chaque face" : " · sans logo : déposez-le dans Marque pour qu’il soit dessiné"}
      </p>
    </section>
  );
}
