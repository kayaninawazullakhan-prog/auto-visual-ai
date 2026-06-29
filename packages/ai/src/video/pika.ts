import { loadEnv, MissingProviderKeyError } from "@ava/config";
import type { GeneratedVideo, GenerationOptions } from "@ava/types";
import type { VideoProvider } from "../contracts.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Pika text-to-video. Pika's public API surface is less standardized than
 * Runway/Kling; this follows the common create+poll pattern. If your Pika API
 * version differs, adjust the endpoints/field names here — the contract and the
 * rest of the pipeline stay unchanged.
 */
export class PikaVideoProvider implements VideoProvider {
  readonly name = "pika";

  async generate(prompt: string, opts?: GenerationOptions): Promise<GeneratedVideo> {
    const env = loadEnv();
    if (!env.PIKA_API_KEY) throw new MissingProviderKeyError("pika", ["PIKA_API_KEY"]);

    const headers = {
      Authorization: `Bearer ${env.PIKA_API_KEY}`,
      "Content-Type": "application/json",
    };

    const created = await fetch(`${env.PIKA_API_URL}/v1/generate`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        prompt,
        aspectRatio: opts?.aspectRatio ?? "9:16",
        duration: Math.round(opts?.durationSec ?? 5),
        ...(opts?.imageUrl ? { image: opts.imageUrl } : {}),
      }),
    });
    if (!created.ok) throw new Error(`Pika create failed (${created.status}): ${await created.text()}`);
    const createdJson = (await created.json()) as { id?: string; jobId?: string };
    const id = createdJson.id ?? createdJson.jobId;
    if (!id) throw new Error("Pika did not return a job id");

    const deadline = Date.now() + 15 * 60 * 1000;
    while (true) {
      if (Date.now() > deadline) throw new Error("Pika job timed out");
      await sleep(3000);
      const poll = (await (
        await fetch(`${env.PIKA_API_URL}/v1/videos/${id}`, { headers })
      ).json()) as { status?: string; url?: string; videoUrl?: string; resultUrl?: string };

      const status = (poll.status ?? "").toLowerCase();
      const url = poll.url ?? poll.videoUrl ?? poll.resultUrl;
      if (status === "finished" || status === "succeeded" || status === "completed") {
        if (!url) throw new Error("Pika finished but returned no video URL");
        return {
          url,
          width: opts?.width ?? 0,
          height: opts?.height ?? 0,
          durationSec: opts?.durationSec ?? 5,
          meta: { providerRequestId: id },
        };
      }
      if (status === "failed" || status === "error") throw new Error("Pika job failed");
    }
  }
}
