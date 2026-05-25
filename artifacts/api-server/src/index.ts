import app from "./app";
import { logger } from "./lib/logger";
import { getPublicUrl } from "./lib/recall";

const rawPort = process.env["PORT"];
if (!rawPort) throw new Error("PORT environment variable is required but was not provided.");
const port = Number(rawPort);
if (Number.isNaN(port) || port <= 0) throw new Error(`Invalid PORT value: "${rawPort}"`);

// ── Startup env check ──────────────────────────────────────────────────────────
const REQUIRED_VARS = ["RECALL_API_KEY", "GEMINI_API_KEY", "RAEL_EMAIL", "RAEL_PASSWORD"];
const OPTIONAL_VARS = ["ELEVENLABS_API_KEY", "ELEVENLABS_VOICE_ID", "REPLIT_URL", "REPLIT_DOMAINS"];

function checkEnv(): void {
  const missing: string[] = [];
  const present: string[] = [];

  for (const v of REQUIRED_VARS) {
    if (process.env[v]) present.push(v);
    else missing.push(v);
  }
  for (const v of OPTIONAL_VARS) {
    if (process.env[v]) present.push(`${v} (optional)`);
    else console.warn(`[ENV] optional: ${v} not set`);
  }

  console.log("[ENV] ✅ present:", present.join(", "));
  if (missing.length) {
    console.error("[ENV] ❌ MISSING:", missing.join(", "));
  }

  const publicUrl = getPublicUrl();
  console.log(`[ENV] public URL: ${publicUrl || "(not set — /screen will use relative paths)"}`);
}

app.listen(port, () => {
  logger.info({ port }, "Server listening");
  checkEnv();
});
