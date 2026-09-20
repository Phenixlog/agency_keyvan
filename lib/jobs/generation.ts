type JobStatus = "queued" | "running" | "succeeded" | "failed";

type Job = {
  id: string;
  prompt: string;
  status: JobStatus;
  createdAt: number;
  updatedAt: number;
  output?: string;
  error?: string;
};

const jobs = new Map<string, Job>();

export function queueGenerationJob(prompt: string): { jobId: string } {
  const id =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2);
  const now = Date.now();
  const job: Job = {
    id,
    prompt,
    status: "queued",
    createdAt: now,
    updatedAt: now,
  };
  jobs.set(id, job);
  // simulate async progression (stub)
  setTimeout(() => {
    const j = jobs.get(id);
    if (!j) return;
    j.status = "running";
    j.updatedAt = Date.now();
    setTimeout(() => {
      const jj = jobs.get(id);
      if (!jj) return;
      jj.status = "succeeded";
      jj.output = "Sortie de génération (stub)";
      jj.updatedAt = Date.now();
    }, 800);
  }, 300);
  return { jobId: id };
}

export function getGenerationJobStatus(jobId: string): Job | undefined {
  return jobs.get(jobId);
}

