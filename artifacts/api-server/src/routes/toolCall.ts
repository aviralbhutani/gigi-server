import { Router, type IRouter, type Request, type Response } from "express";
import {
  browserLoginRael,
  browserScrollDown,
  browserScrollUp,
  browserClick,
  browserGoto,
  browserScreenshotRaw,
} from "../lib/browser";
import { analyzeScreen } from "../lib/vision";
import { setOutputMedia, getPublicUrl } from "../lib/recall";
import { getActiveBotId, setLatestScreenshot, getLatestScreenshot } from "../lib/state";

const router: IRouter = Router();

// ── Immediate messages GiGi speaks while background work runs ─────────────────

function immediateMessage(action: string, target?: string): string {
  switch (action) {
    case "login":
      return "Logging into Rael Maps now — I'll have your live dispatch console up in just a moment.";
    case "analyze_screen":
      return "Let me take a look at what's on screen and walk you through it.";
    case "analyze_and_click":
      return "Analyzing the screen and navigating to the next item now.";
    case "scroll_down":
      return "Scrolling down.";
    case "scroll_up":
      return "Scrolling back up.";
    case "click":
      return target ? `Clicking on ${target}.` : "Clicking that now.";
    case "navigate":
      return target ? `Navigating to ${target}.` : "Navigating there now.";
    case "screenshot":
      return "Capturing the current view.";
    case "show_whiteboard":
      return "Switching back to the whiteboard now.";
    default:
      return "On it.";
  }
}

// ── Background worker — runs after response is already sent ───────────────────

async function runBackground(action: string, target?: string): Promise<void> {
  const botId = getActiveBotId();
  const base = getPublicUrl();

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log(`[BG] START action="${action}" target="${target ?? ""}" botId="${botId ?? "NONE"}" base="${base || "(empty)"}"`);

  try {
    // 1. Perform the browser action
    switch (action) {
      case "login":
        console.log("[BG] calling browserLoginRael()...");
        await browserLoginRael();
        console.log("[BG] browserLoginRael() complete ✅");
        break;
      case "scroll_down":
        await browserScrollDown();
        break;
      case "scroll_up":
        await browserScrollUp();
        break;
      case "click":
        if (target) await browserClick(target);
        break;
      case "navigate":
        if (target) await browserGoto(target);
        break;
      case "show_whiteboard":
        if (botId) {
          await setOutputMedia(botId, "https://welaunch.click/?agent=gigi-avi");
          console.log("[BG] show_whiteboard → Recall ✅");
        } else {
          console.log("[BG] show_whiteboard — no active botId, skipping Recall");
        }
        return;
      case "screenshot":
      case "analyze_screen":
      case "analyze_and_click":
        break; // screenshot taken below
    }

    // 2. Take screenshot and store in memory
    console.log("[BG] taking screenshot...");
    const buf = await browserScreenshotRaw();
    setLatestScreenshot(buf);
    console.log(`[BG] screenshot stored in memory (${buf.length} bytes, ~${Math.round(buf.length / 1024)}KB)`);
    console.log(`[BG] /screenshot.jpg will serve this buffer; /screen HTML polls it every 1.5s`);

    // 3. POST to Recall output_media → /screen  (before Gemini — must not be blocked by analysis errors)
    if (botId && base) {
      const screenUrl = `${base}/screen`;
      console.log(`[BG] POSTing Recall output_media → "${screenUrl}"`);
      await setOutputMedia(botId, screenUrl);
      console.log("[BG] Recall output_media updated ✅");
    } else {
      console.log(`[BG] ⚠️  skipping Recall update — botId=${botId ?? "null"} base="${base || "empty"}"`);
      if (!botId) console.log("[BG]   → no activeBotId yet (has webhook fired bot.in_call_recording?)");
      if (!base) console.log("[BG]   → REPLIT_URL and REPLIT_DOMAINS are both unset");
    }

    // 4. Gemini analysis (non-blocking — errors here never affect the screen update above)
    if (["analyze_screen", "analyze_and_click", "login"].includes(action)) {
      try {
        console.log("[BG] running Gemini analysis on screenshot...");
        const b64 = buf.toString("base64");
        const analysis = await analyzeScreen(b64);
        console.log(`[BG] Gemini narration: "${analysis.narration?.slice(0, 100)}"`);
        console.log(`[BG] Gemini recommended_selector: "${analysis.recommended_selector}"`);

        if (action === "analyze_and_click" && analysis.recommended_selector) {
          console.log(`[BG] auto-clicking: "${analysis.recommended_selector}"`);
          try {
            await browserClick(analysis.recommended_selector);
            const buf2 = await browserScreenshotRaw();
            setLatestScreenshot(buf2);
            if (botId && base) {
              await setOutputMedia(botId, `${base}/screen`);
              console.log("[BG] post-click Recall update ✅");
            }
            console.log(`[BG] auto-click + re-screenshot ✅ (${buf2.length} bytes)`);
          } catch (clickErr) {
            console.log(`[BG] auto-click failed (non-fatal): ${clickErr}`);
          }
        }
      } catch (geminiErr) {
        console.log(`[BG] ⚠️  Gemini failed (non-fatal, screen already updated): ${geminiErr instanceof Error ? geminiErr.message.slice(0, 120) : String(geminiErr)}`);
      }
    }

  } catch (err) {
    console.error("[BG] ❌ error:", err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) {
      console.error("[BG] stack:", err.stack.split("\n").slice(0, 5).join("\n"));
    }
  }

  const snap = getLatestScreenshot();
  console.log(`[BG] END — screenshot in memory: ${snap ? `${snap.length} bytes` : "NONE"}`);
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

// ── Routes ────────────────────────────────────────────────────────────────────

router.post("/tool-call", (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const action = (body.action as string | undefined) ?? "";
  const target = body.target as string | undefined;

  console.log(`[TOOL-CALL] ← received action="${action}" target="${target ?? ""}"`);

  const message = immediateMessage(action, target);
  res.json({ message });

  console.log(`[TOOL-CALL] → responded instantly: "${message.slice(0, 60)}"`);

  runBackground(action, target).catch((err: unknown) =>
    console.error("[TOOL-CALL] background uncaught:", String(err))
  );
});

export default router;
