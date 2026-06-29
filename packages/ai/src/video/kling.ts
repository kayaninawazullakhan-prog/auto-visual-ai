import { loadEnv, MissingProviderKeyError } from "@ava/config";
import type { GeneratedVideo, GenerationOptions } from "@ava/types";
import type { VideoProvider } from "../contracts.js";
import { signHs256 } from "../util/jwt.js";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function klingAspect(aspect?: GenerationOptions["aspectRatio"]): string {
  if (aspect === "16:9") return "16:9";
  if (aspect === "1:1") return "1:1";
  return "9:16";
}

/** Kling text-to-video. Auth is a short-lived HS256 JWT (access + secret key). */
export class KlingVideoProvider implements VideoProvider {
  readonly name = "kling";

  private token(): string {
    const env = loadEnv();
    if (!env.KLING_ACCESS_KEY || !env.KLING_SECRET_KEY) {
      throw new MissingProviderKeyError("kling", ["KLING_ACCESS_KEY", "KLING_SECRET_KEY"]);
    }
    const now = Math.floor(Date.now() / 1000);
    return signHs256({ iss: env.KLING_ACCESS_KEY, exp: now + 1800, nbf: now - 5 }, env.KLING_SECRET_KEY);
  }

  async generate(prompt: string, opts?: GenerationOptions): Promise<GeneratedVideo> {
    const env = loadEnv();
    const auth = { Authorization: `Bearer ${this.token()}`, "Content-Type": "application/json" };

    const created = await fetch(`${env.KLING_API_URL}/v1/videos/text2video`, {
      method: "POST",
      headers: auth,
      body: JSON.stringify({
        model_name: env.KLING_MODEL,
        prompt,
        aspect_ratio: klingAspect(opts?.aspectRatio),
        duration: String(Math.round(opts?.durationSec ?? 5)),
      }),
    });
    if (!created.ok) throw new Error(`Kling create failed (${created.status}): ${await created.text()}`);
    const createdJson = (await created.json()) as { data?: { task_id?: string } };
    const taskId = createdJson.data?.task_id;
    if (!taskId) throw new Error("Kling did not return a task_id");

    const deadline = Date.now() + 15 * 60 * 1000;
    while (true) {
      if (Date.now() > deadline) throw new Error("Kling task timed out");
      await sleep(3000);
      const poll = (await (
        await fetch(`${env.KLING_API_URL}/v1/videos/text2video/${taskId}`, {
          headers: { Authorization: `Bearer ${this.token()}` },
        })
      ).json()) as {
        data?: { task_status?: string; task_status_msg?: string; task_result?: { videos?: Array<{ url: string }> } };
      };
      const status = poll.data?.task_status;

      if (status === "succeed") {
        const url = poll.data?.task_result?.videos?.[0]?.url;
        if (!url) throw new Error("Kling succeeded but returned no video URL");
        return {
          url,
          width: opts?.width ?? 0,
          height: opts?.height ?? 0,
          durationSec: opts?.durationSec ?? 5,
          meta: { model: env.KLING_MODEL, providerRequestId: taskId },
        };
      }
      if (status === "failed") throw new Error(`Kling task failed: ${poll.data?.task_status_msg ?? "unknown"}`);
    }
  }
}
