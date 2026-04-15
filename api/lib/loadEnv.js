/**
 * Loads `.env` / `.env.local` from the repo root for `vercel dev` and local runs.
 * Vercel production injects env vars — these files are usually absent there.
 */
import dotenv from "dotenv";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..", "..");

for (const root of [process.cwd(), repoRoot]) {
  const envFile = join(root, ".env");
  const localFile = join(root, ".env.local");
  if (existsSync(envFile)) dotenv.config({ path: envFile });
  if (existsSync(localFile)) dotenv.config({ path: localFile, override: true });
}
