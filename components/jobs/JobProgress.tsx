"use client";
import { useEffect, useState } from "react";

export function JobProgress() {
  const [jobId, setJobId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outLink, setOutLink] = useState<string | null>(null);

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const id = sp.get("job");
    if (!id) return;
    setJobId(id);
  }, []);

  useEffect(() => {
    if (!jobId) return;
    let stop = false;
    async function tick() {
      try {
        const res = await fetch(`/api/jobs/${jobId}`, { cache: "no-store" });
        if (!res.ok) throw new Error(await res.text());
        const json = await res.json();
        const s = json?.job?.status || null;
        setStatus(s);
        if (s === "failed") {
          setError(json?.job?.error || "Échec de génération.");
        }
        if (s === "succeeded") {
          const outId = json?.job?.output?.out_id;
          if (outId) {
            setOutLink(`/app/studio?focus=${outId}`);
          }
        }
        if (!stop && s && s !== "succeeded" && s !== "failed" && s !== "canceled") {
          setTimeout(tick, 1000);
        }
      } catch (e: any) {
        setError(e?.message || "Erreur réseau");
      }
    }
    tick();
    return () => {
      stop = true;
    };
  }, [jobId]);

  if (!jobId) return null;
  return (
    <div className="mt-6 rounded-lg border border-zinc-200 p-4">
      <div className="text-sm text-zinc-800">
        Job <span className="font-mono">{jobId}</span> — Statut: <strong>{status || "…"} </strong>
      </div>
      {error ? <div className="mt-2 text-sm text-rose-700">{error}</div> : null}
      {outLink ? (
        <a href={outLink} className="mt-3 inline-flex rounded-md bg-accent px-3 py-1.5 text-white hover:opacity-90">
          Ouvrir dans Studio
        </a>
      ) : null}
    </div>
  );
}

