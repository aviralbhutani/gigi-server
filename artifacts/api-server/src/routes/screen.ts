import { Router, type IRouter, type Request, type Response } from "express";
import { getLatestScreenshot } from "../lib/state";
import { getPublicUrl } from "../lib/recall";

const router: IRouter = Router();

/**
 * GET /screen
 * HTML page served to Recall as output_media.
 * Embeds a <img> that polls /screenshot.jpg every 1.5s.
 * The image URL is absolute (uses REPLIT_URL / REPLIT_DOMAINS) so Recall
 * can fetch it from outside the container.
 */
router.get("/screen", (_req: Request, res: Response) => {
  const base = getPublicUrl();
  const imgUrl = base ? `${base}/screenshot.jpg` : "/screenshot.jpg";
  const snap = getLatestScreenshot();

  console.log(`[SCREEN] GET /screen — imgUrl="${imgUrl}" snapshot=${snap ? `${snap.length}B` : "NONE"}`);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>GiGi Live View</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #000; width: 100vw; height: 100vh; overflow: hidden; }
    img { width: 100%; height: 100%; object-fit: contain; display: block; }
  </style>
</head>
<body>
  <img id="frame" src="${imgUrl}?t=0" alt="live view">
  <script>
    const img = document.getElementById('frame');
    const base = '${imgUrl}';
    let t = 1;
    setInterval(() => {
      const next = new Image();
      next.onload = () => { img.src = next.src; };
      next.src = base + '?t=' + (t++);
    }, 1500);
  </script>
</body>
</html>`;

  res.set("Content-Type", "text/html");
  res.set("Cache-Control", "no-store");
  res.send(html);
});

/**
 * GET /screenshot.jpg
 * Returns the latest screenshot as raw JPEG bytes from memory.
 * No disk involved — the buffer is set by runBackground() in toolCall.ts.
 */
router.get("/screenshot.jpg", (req: Request, res: Response) => {
  const buf = getLatestScreenshot();
  console.log(`[SCREEN] GET /screenshot.jpg — buffer=${buf ? `${buf.length}B` : "NONE"} userAgent="${req.headers["user-agent"]?.slice(0, 60) ?? ""}"`);

  if (!buf) {
    console.log("[SCREEN] ⚠️  no screenshot in memory yet — returning 404");
    res.status(404).send("No screenshot available yet — trigger a browser action first");
    return;
  }

  res.set("Content-Type", "image/jpeg");
  res.set("Cache-Control", "no-store, no-cache, must-revalidate");
  res.set("Pragma", "no-cache");
  res.send(buf);
});

/**
 * GET /debug/screenshot
 * Returns current in-memory screenshot as base64 JSON for debugging.
 * Call this to verify a screenshot was captured after a browser action.
 */
router.get("/debug/screenshot", (_req: Request, res: Response) => {
  const buf = getLatestScreenshot();
  const base = getPublicUrl();

  console.log(`[DEBUG] GET /debug/screenshot — buffer=${buf ? `${buf.length}B` : "NONE"}`);

  if (!buf) {
    res.json({
      hasScreenshot: false,
      bytes: 0,
      message: "No screenshot in memory. Fire a /tool-call with action=login or screenshot first.",
      publicUrl: base || null,
      screenshotUrl: base ? `${base}/screenshot.jpg` : null,
    });
    return;
  }

  res.json({
    hasScreenshot: true,
    bytes: buf.length,
    kb: Math.round(buf.length / 1024),
    publicUrl: base || null,
    screenshotUrl: base ? `${base}/screenshot.jpg` : null,
    base64Preview: buf.toString("base64").slice(0, 100) + "...",
    base64Full: buf.toString("base64"),
  });
});

export default router;
