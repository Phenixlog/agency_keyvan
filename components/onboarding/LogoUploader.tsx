"use client";

import { useState, type ChangeEvent } from "react";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { registerLogo } from "@/app/(onboarding)/onboarding/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MAX_BYTES = 8 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "image/svg+xml": "svg" };

/** The logo goes from the browser straight to Storage, then the server records it on the brand (path checked). */
export function LogoUploader({ brandId, current }: { brandId: string; current: string | null }) {
  const [busy, setBusy] = useState(false);
  const [logo, setLogo] = useState(current);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);

  async function onChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const extension = EXTENSIONS[file.type];
    if (!extension) return setNote({ ok: false, message: "Format non pris en charge : PNG, JPG, WebP ou SVG." });
    if (file.size > MAX_BYTES) return setNote({ ok: false, message: "Fichier trop lourd : 8 Mo au maximum." });
    setBusy(true);
    setNote(null);
    try {
      const path = `brands/${brandId}/logo/${crypto.randomUUID()}.${extension}`;
      const { error } = await createSupabaseBrowserClient().storage.from("outs").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
      const result = await registerLogo(path);
      setNote(result);
      if (result.ok) setLogo(result.url);
    } catch (e) {
      setNote({ ok: false, message: `Envoi impossible : ${e instanceof Error ? e.message : "erreur réseau"}` });
    } finally {
      setBusy(false);
      event.target.value = "";
    }
  }

  return (
    <div className="grid gap-3">
      <div className="flex items-center gap-4">
        <span className="relative grid size-20 flex-none place-items-center overflow-hidden rounded-inner bg-soft">
          {logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logo} alt="Logo" className="absolute inset-0 size-full object-contain p-2" />
          ) : (
            <ImagePlus size={20} strokeWidth={1.75} className="text-mute" />
          )}
        </span>
        <label className="inline-flex cursor-pointer items-center gap-2 rounded-pill bg-soft px-4 py-2 text-small font-semibold text-ink transition duration-(--duration-fast) ease-cimaise hover:bg-line">
          {busy ? <LoaderCircle size={16} strokeWidth={1.75} className="animate-spin" /> : <ImagePlus size={16} strokeWidth={1.75} />}
          {busy ? "Envoi…" : logo ? "Remplacer le logo" : "Déposer le logo"}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" onChange={onChange} disabled={busy} className="sr-only" />
        </label>
      </div>
      {note ? <p role="status" className={`rounded-inner px-4 py-2 text-small ${note.ok ? "bg-success-tint text-success" : "bg-danger-tint text-danger"}`}>{note.message}</p> : null}
    </div>
  );
}
