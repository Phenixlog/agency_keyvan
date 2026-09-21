"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ImagePlus, LoaderCircle } from "lucide-react";
import { addAsset } from "@/app/(app)/app/studio/actions";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const MAX_BYTES = 10 * 1024 * 1024;
const EXTENSIONS: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
const FIELD = "w-full rounded-inner bg-soft px-4 py-3 text-body text-ink placeholder:text-mute focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

/**
 * The photo goes from the browser straight to Storage (no server body limit, no server memory),
 * then the server records what it shows — and checks the path belongs to the active brand.
 */
export function AssetUploader({ brandId, kinds }: { brandId: string; kinds: Record<string, string> }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const file = data.get("file");
    if (!(file instanceof File) || !file.size) return;
    const extension = EXTENSIONS[file.type];
    if (!extension) return setNote({ ok: false, message: "Format non pris en charge : JPG, PNG ou WebP." });
    if (file.size > MAX_BYTES) return setNote({ ok: false, message: "Photo trop lourde : 10 Mo au maximum." });

    setBusy(true);
    setNote(null);
    try {
      const path = `brands/${brandId}/references/${crypto.randomUUID()}.${extension}`;
      const { error } = await createSupabaseBrowserClient().storage.from("outs").upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw new Error(error.message);
      const result = await addAsset(path, String(data.get("label") || ""), String(data.get("kind") || "product"));
      setNote(result);
      if (result.ok) {
        form.reset();
        router.refresh();
      }
    } catch (e) {
      setNote({ ok: false, message: `Envoi impossible : ${e instanceof Error ? e.message : "erreur réseau"}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="grid gap-4">
      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <label className="grid gap-2">
          <span className="text-small font-semibold text-ink">Photo</span>
          <input type="file" name="file" required accept="image/jpeg,image/png,image/webp" className={`${FIELD} file:mr-3 file:rounded-pill file:border-0 file:bg-ink file:px-3 file:py-1 file:text-small file:text-card`} />
        </label>
        <label className="grid gap-2">
          <span className="text-small font-semibold text-ink">Ce qu’elle montre</span>
          <input name="label" required maxLength={80} placeholder="« Tasse Lune ivoire », « L’atelier »…" className={FIELD} />
        </label>
        <label className="grid gap-2">
          <span className="text-small font-semibold text-ink">Type</span>
          <select name="kind" defaultValue="product" className={FIELD}>
            {Object.entries(kinds).map(([key, label]) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-small text-mute">Le nom compte : c’est lui qui dit au modèle quel objet garder à l’identique. Une photo nette, le sujet bien visible, donne les meilleurs résultats.</p>
      {note ? <p role="status" className={`rounded-inner px-4 py-3 text-small ${note.ok ? "bg-success-tint text-success" : "bg-danger-tint text-danger"}`}>{note.message}</p> : null}
      <button type="submit" disabled={busy} className="inline-flex items-center justify-center gap-2 justify-self-start rounded-pill bg-ink px-6 py-3 text-small font-semibold text-card transition duration-(--duration-fast) ease-cimaise hover:-translate-y-px disabled:opacity-50">
        {busy ? <LoaderCircle size={18} strokeWidth={1.75} className="animate-spin" /> : <ImagePlus size={18} strokeWidth={1.75} />}
        {busy ? "Envoi…" : "Ajouter à la photothèque"}
      </button>
    </form>
  );
}
