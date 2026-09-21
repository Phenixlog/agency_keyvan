"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui";

/**
 * Bouton d'envoi qui dit qu'il travaille. L'analyse de marque et la génération d'image
 * durent 10 à 30 s dans l'action serveur : sans retour, on croit que rien ne se passe.
 */
export function SubmitButton({
  children,
  pendingLabel,
  variant,
  className,
}: {
  children: ReactNode;
  pendingLabel: string;
  variant?: "primary" | "soft" | "ghost";
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant={variant} className={className} disabled={pending} aria-busy={pending}>
      {pending ? (
        <>
          <LoaderCircle size={18} strokeWidth={1.75} className="animate-spin" />
          {pendingLabel}
        </>
      ) : (
        children
      )}
    </Button>
  );
}
