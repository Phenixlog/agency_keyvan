import { createHash } from "crypto";

export type WaveSpeedSubmitResponse = {
  code: number;
  message: string;
  data?: {
    id: string;
    status?: string;
    urls?: { get?: string };
  };
};

export type WaveSpeedResultResponse = {
  code: number;
  message: string;
  data?: {
    id: string;
    status: "created" | "processing" | "completed" | "failed" | "canceled" | string;
    outputs?: string[]; // URLs (or base64 when requested)
  };
};

export type WaveSpeedImageParams = {
  prompt: string;
  size?: string; // e.g., "1024*1024"
  output_format?: "jpeg" | "png" | "webp";
  seed?: number;
  enable_sync_mode?: boolean;
};

const WAVESPEED_BASE_URL = "https://api.wavespeed.ai/api/v3";
const MODEL_PATH = "wavespeed-ai/z-image/turbo";

export function ensureWaveSpeedKey(): string {
  const key = process.env.WAVESPEED_API_KEY || "";
  if (!key) {
    throw new Error(
      "WAVESPEED_API_KEY manquant. Ajoutez la variable d’environnement pour activer la génération d’images."
    );
  }
  return key;
}

export async function submitImageTask(params: WaveSpeedImageParams): Promise<string> {
  const apiKey = ensureWaveSpeedKey();
  const url = `${WAVESPEED_BASE_URL}/${MODEL_PATH}`;
  const body = {
    prompt: params.prompt,
    size: params.size ?? "1024*1024",
    output_format: params.output_format ?? "jpeg",
    seed: params.seed ?? -1,
    enable_sync_mode: params.enable_sync_mode ?? false,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WaveSpeed submit error ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as WaveSpeedSubmitResponse;
  const taskId = json?.data?.id;
  if (!taskId) {
    throw new Error(`WaveSpeed: id de tâche introuvable dans la réponse.`);
  }
  return taskId;
}

export async function fetchTaskResult(taskId: string): Promise<WaveSpeedResultResponse> {
  const apiKey = ensureWaveSpeedKey();
  const url = `${WAVESPEED_BASE_URL}/predictions/${encodeURIComponent(taskId)}/result`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WaveSpeed result error ${res.status}: ${text.slice(0, 500)}`);
  }
  const json = (await res.json()) as WaveSpeedResultResponse;
  return json;
}

export function hashForFilename(input: string): string {
  return createHash("sha1").update(input).digest("hex").slice(0, 16);
}

