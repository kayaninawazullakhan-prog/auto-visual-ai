import { spawn } from "node:child_process";
import { loadEnv } from "@ava/config";

export function ffmpegBin(): string {
  return loadEnv().FFMPEG_PATH || "ffmpeg";
}

export function ffprobeBin(): string {
  return loadEnv().FFPROBE_PATH || "ffprobe";
}

/** Run a binary, capturing stdout/stderr. Rejects on non-zero exit. */
export function run(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", (err) =>
      reject(
        new Error(
          `Failed to launch "${cmd}". Is it installed / on PATH (or FFMPEG_PATH set)? ${err.message}`,
        ),
      ),
    );
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

/** Extract a single still frame (default 1s in) as a JPEG thumbnail. */
export async function extractFrame(
  inputPath: string,
  outputPath: string,
  atSec = 1,
): Promise<void> {
  await run(ffmpegBin(), [
    "-y",
    "-ss",
    String(atSec),
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-q:v",
    "3",
    outputPath,
  ]);
}

/**
 * Extract a mono 16 kHz PCM WAV — the format Whisper-family models prefer — from
 * any input container (mp4/mov/avi/mkv).
 */
export async function extractAudio(inputPath: string, outputPath: string): Promise<void> {
  await run(ffmpegBin(), [
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-ac",
    "1",
    "-ar",
    "16000",
    "-c:a",
    "pcm_s16le",
    outputPath,
  ]);
}
