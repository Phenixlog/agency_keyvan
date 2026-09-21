import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

/** Primitives de la direction « Cimaise ». Tout sort des tokens (app/globals.css ↔ lib/tokens.ts). */

function cx(...parts: (string | false | null | undefined)[]) {
  return parts.filter(Boolean).join(" ");
}

/* ---------- Surfaces ---------- */

export function Card({ className, ...props }: ComponentProps<"section">) {
  return <section className={cx("min-w-0 rounded-card bg-card p-6", className)} {...props} />;
}

/** L'unique case « accent » d'un écran : aplat de la couleur de la marque cliente active. */
export function BrandCard({ className, children, ...props }: ComponentProps<"section">) {
  return (
    <section
      className={cx(
        "relative min-w-0 overflow-hidden rounded-card bg-brand p-6 text-on-brand transition-colors duration-(--duration-retint) ease-cimaise",
        className
      )}
      {...props}
    >
      <span aria-hidden className="hatch pointer-events-none absolute -bottom-10 -right-10 size-60 rounded-full opacity-15" />
      <div className="relative">{children}</div>
    </section>
  );
}

export function CardHeader({ title, aside }: { title: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-4 flex items-center justify-between gap-2">
      <h2 className="text-title text-ink">{title}</h2>
      {aside}
    </div>
  );
}

/* ---------- Texte ---------- */

/** Métadonnée en mono : versions, formats, dates — les annotations d'épreuve. */
export function Meta({ className, ...props }: ComponentProps<"span">) {
  return <span className={cx("font-mono text-meta text-mute", className)} {...props} />;
}

export function VersionTag({ v }: { v: number | string }) {
  return (
    <span className="rounded-tag bg-tint px-2 py-1 font-mono text-meta text-ink transition-colors duration-(--duration-retint) ease-cimaise">
      v{v}
    </span>
  );
}

const TONES = {
  neutral: "bg-soft text-mute",
  success: "bg-success-tint text-success",
  danger: "bg-danger-tint text-danger",
  warning: "bg-warning-tint text-warning",
} as const;

export function Tag({ tone = "neutral", children }: { tone?: keyof typeof TONES; children: ReactNode }) {
  return (
    <span className={cx("inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2 py-1 font-mono text-meta", TONES[tone])}>
      {children}
    </span>
  );
}

export function Notice({ tone, children }: { tone: "success" | "danger" | "warning"; children: ReactNode }) {
  return <p className={cx("rounded-inner px-4 py-3 text-small", TONES[tone])}>{children}</p>;
}

/* ---------- Actions ---------- */

const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 rounded-pill text-small font-semibold transition duration-(--duration-fast) ease-cimaise focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:opacity-50";
const BUTTON_VARIANTS = {
  primary: "bg-ink px-6 py-3 text-card hover:-translate-y-px",
  soft: "bg-soft px-4 py-2 text-ink hover:bg-line",
  ghost: "px-2 py-2 font-normal text-mute hover:text-ink",
} as const;

type Variant = { variant?: keyof typeof BUTTON_VARIANTS };

export function Button({ variant = "primary", className, ...props }: ComponentProps<"button"> & Variant) {
  return <button className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...props} />;
}

export function ButtonLink({ variant = "primary", className, ...props }: ComponentProps<typeof Link> & Variant) {
  return <Link className={cx(BUTTON_BASE, BUTTON_VARIANTS[variant], className)} {...props} />;
}

/* ---------- Formulaires ---------- */

const FIELD =
  "w-full rounded-inner bg-soft px-4 py-3 text-body text-ink placeholder:text-mute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input className={cx(FIELD, className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea className={cx(FIELD, "resize-y", className)} {...props} />;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="grid gap-2">
      <span className="text-small font-semibold text-ink">{label}</span>
      {children}
      {hint ? <span className="text-small text-mute">{hint}</span> : null}
    </label>
  );
}

/* ---------- États vides ---------- */

export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid justify-items-start gap-3 rounded-inner bg-soft p-6">
      <p className="font-display text-h2 font-normal text-ink">{title}</p>
      <p className="max-w-prose text-small text-mute">{children}</p>
      {action}
    </div>
  );
}
