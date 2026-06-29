import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";
import { config as loadDotenv } from "dotenv";

// Load the monorepo-root .env before anything reads process.env. Imported first
// in index.ts so it runs before other modules initialize. dotenv never overrides
// vars already present, so real platform env (production) still wins.
const here = dirname(fileURLToPath(import.meta.url));
const candidates = [
  resolve(here, "../../../.env"), // repo root when running from src (tsx)
  resolve(process.cwd(), ".env"),
  resolve(process.cwd(), "../../.env"),
];
for (const path of candidates) {
  if (existsSync(path)) {
    loadDotenv({ path });
    break;
  }
}
