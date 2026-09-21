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
  aspectRatio: string;
  resolution: "1k" | "2k" | "4k";
  /**
   * Reference images (the client's real product, or the creation to retouch). Their presence
   * switches to the editing model, which keeps the subject and follows an instruction.
   */
  images?: string[];
};

const WAVESPEED_BASE_URL = "https://api.wavespeed.ai/api/v3";
/** Three proposals per brief: the fast, balanced tier (≈ $0.024 per image at 1k). */
const MODEL_PATH = process.env.WAVESPEED_MODEL || "openai/gpt-image-2.5-flare/text-to-image";
/** With a reference photo, fidelity to the client's real product matters: the precision tier (≈ $0.039). */
const MODEL_EDIT_PATH = process.env.WAVESPEED_MODEL_EDIT || "openai/gpt-image-2.5-sunburst/edit";
const QUALITY = process.env.WAVESPEED_QUALITY || "medium";

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
  const editing = Boolean(params.images?.length);
  const url = `${WAVESPEED_BASE_URL}/${editing ? MODEL_EDIT_PATH : MODEL_PATH}`;
  const body = {
    prompt: params.prompt,
    aspect_ratio: params.aspectRatio,
    resolution: params.resolution,
    quality: QUALITY,
    output_format: "jpeg",
    enable_sync_mode: false,
    ...(editing ? { images: params.images } : {}),
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

