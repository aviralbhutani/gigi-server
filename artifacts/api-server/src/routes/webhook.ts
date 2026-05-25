import { Router, type IRouter, type Request, type Response } from "express";
import { setActiveBotId } from "../lib/state";
import { closeBrowser } from "../lib/browser";

const router: IRouter = Router();

const CALL_ACTIVE_EVENTS = new Set([
  "bot.joining_call",
  "bot.in_waiting_room",
  "bot.in_call_not_recording",
  "bot.in_call_recording",
]);

const CALL_ENDED_EVENTS = new Set([
  "bot.call_ended",
  "bot.done",
]);

router.post("/webhook", async (req: Request, res: Response) => {
  const body = req.body as {
    event?: string;
    data?: { bot?: { id?: string } };
  };

  const event = body?.event ?? "";
  const botId = body?.data?.bot?.id ?? null;

  console.log(`[WEBHOOK] event=${event} botId=${botId ?? "none"}`);

  if (botId && CALL_ACTIVE_EVENTS.has(event)) {
    setActiveBotId(botId);
  }

  if (CALL_ENDED_EVENTS.has(event)) {
    console.log("[WEBHOOK] call ended — clearing activeBotId and closing browser");
    setActiveBotId(null);
    closeBrowser().catch((e: unknown) => console.log("[WEBHOOK] closeBrowser error (non-fatal):", String(e)));
  }

  res.json({ received: true });
});

export default router;
