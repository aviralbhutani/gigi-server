import { Router, type IRouter, type Request, type Response } from "express";
import { createBot, removeBot, getPublicUrl } from "../lib/recall";

const router: IRouter = Router();

const WHITEBOARD_URL = "https://welaunch.click/?agent=gigi-avi";

router.post("/send-bot", async (req: Request, res: Response) => {
  const { meeting_url, bot_name } = req.body as {
    meeting_url?: string;
    bot_name?: string;
  };

  if (!meeting_url) {
    res.status(400).json({ error: "meeting_url is required" });
    return;
  }
  if (!process.env.RECALL_API_KEY) {
    res.status(500).json({ error: "RECALL_API_KEY not configured" });
    return;
  }

  const name = bot_name ?? "GiGi-Avi";
  req.log.info({ meeting_url, bot_name: name }, "Sending bot");

  try {
    const data = await createBot(meeting_url, name, WHITEBOARD_URL);
    console.log(`[SEND-BOT] created botId=${data.id as string}`);
    req.log.info({ botId: data.id }, "Bot sent");
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err: msg }, "Failed to send bot");
    res.status(500).json({ error: msg });
  }
});

router.post("/remove-bot", async (req: Request, res: Response) => {
  const { bot_id } = req.body as { bot_id?: string };

  if (!bot_id) {
    res.status(400).json({ error: "bot_id is required" });
    return;
  }
  if (!process.env.RECALL_API_KEY) {
    res.status(500).json({ error: "RECALL_API_KEY not configured" });
    return;
  }

  req.log.info({ bot_id }, "Removing bot");

  try {
    await removeBot(bot_id);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    req.log.error({ err: msg }, "Failed to remove bot");
    res.status(500).json({ error: msg });
  }
});

export { getPublicUrl };
export default router;
