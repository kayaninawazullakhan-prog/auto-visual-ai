import { loadEnv, MissingProviderKeyError } from "@ava/config";
import type { TranscriptResult } from "@ava/types";
import type { TranscriptionProvider, TranscribeInput } from "../contracts.js";
import { parseWhisperx } from "./util.js";

interface ReplicatePrediction {
  id: string;
  status: "starting" | "processing" | "succeeded" | "failed" | "canceled";
  output?: unknown;
  error?: string;
  urls?: { get?: string };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** WhisperX via Replicate — needs a publicly reachable audio URL. */
export class ReplicateWhisperProvider implements TranscriptionProvider {
  readonly name = "replicate-whisper";

  async transcribe(input: TranscribeInput): Promise<TranscriptResult> {
    const env = loadEnv();
    if (!env.REPLICATE_API_TOKEN) {
      throw new MissingProviderKeyError("replicate-whisper", ["REPLICATE_API_TOKEN"]);
    }
    if (!input.audioUrl) {
      throw new Error("Replicate Whisper requires an accessible audioUrl");
    }

    const token = env.REPLICATE_API_TOKEN;
    const model = env.REPLICATE_WHISPER_MODEL;

    const created = await fetch(
      `https://api.replicate.com/v1/models/${model}/predictions`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          input: {
            audio: input.audioUrl,
            align_output: true,
            ...(input.language ? { language: input.language } : {}),
          },
        }),
      },
    );
    if (!created.ok) {
      throw new Error(`Replicate create failed (${created.status}): ${await created.text()}`);
    }

    let prediction = (await created.json()) as ReplicatePrediction;
    const getUrl =
      prediction.urls?.get ??
      `https://api.replicate.com/v1/predictions/${prediction.id}`;

    const deadline = Date.now() + 15 * 60 * 1000; // 15 min cap
    while (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
      if (Date.now() > deadline) throw new Error("Replicate transcription timed out");
      await sleep(2500);
      const poll = await fetch(getUrl, { headers: { Authorization: `Bearer ${token}` } });
      prediction = (await poll.json()) as ReplicatePrediction;
    }

    if (prediction.status !== "succeeded") {
      throw new Error(`Replicate transcription ${prediction.status}: ${prediction.error ?? "unknown error"}`);
    }

    return parseWhisperx(prediction.output, input.language);
  }
}
