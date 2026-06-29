import { spawn } from "node:child_process";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { loadEnv } from "@ava/config";
import type { TranscriptResult } from "@ava/types";
import type { TranscriptionProvider, TranscribeInput } from "../contracts.js";
import { parseWhisperCpp } from "./util.js";

/**
 * Local transcription via whisper.cpp (`whisper-cli`) — NO API KEY required, so a
 * Claude-only setup can still transcribe. Auto-detects the spoken language.
 *
 * Setup: `brew install whisper-cpp`, download a multilingual ggml model, and set
 * WHISPER_LOCAL_MODEL to its path. The extracted audio is already 16 kHz mono WAV.
 */
export class LocalWhisperProvider implements TranscriptionProvider {
  readonly name = "local-whisper";

  async transcribe(input: TranscribeInput): Promise<TranscriptResult> {
    const env = loadEnv();
    if (!input.audioPath) throw new Error("Local Whisper requires a local audioPath");
    if (!env.WHISPER_LOCAL_MODEL) {
      throw new Error(
        "Local Whisper needs a model — set WHISPER_LOCAL_MODEL to a whisper.cpp ggml model path " +
          "(e.g. .data/models/ggml-base.bin). Download from huggingface.co/ggerganov/whisper.cpp.",
      );
    }

    const dir = await mkdtemp(path.join(tmpdir(), "ava-whisper-"));
    try {
      const outBase = path.join(dir, "out");
      await this.runCli(env.WHISPER_LOCAL_CMD, [
        "-m", env.WHISPER_LOCAL_MODEL,
        "-f", input.audioPath,
        "-oj", // write JSON to <outBase>.json
        "-of", outBase,
        "-l", input.language || "auto", // auto-detect spoken language
        "-np", // no progress prints
      ]);
      const json = JSON.parse(await readFile(`${outBase}.json`, "utf8"));
      return parseWhisperCpp(json, input.language);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }

  private runCli(cmd: string, args: string[]): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("error", (err) =>
        reject(
          new Error(
            `Failed to launch "${cmd}" — run \`brew install whisper-cpp\` (or set WHISPER_LOCAL_CMD): ${err.message}`,
          ),
        ),
      );
      child.on("close", (code) =>
        code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-2000)}`)),
      );
    });
  }
}
