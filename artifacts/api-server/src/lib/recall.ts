const RECALL_API_KEY = process.env.RECALL_API_KEY ?? "";
const RECALL_BASE = process.env.RECALL_BASE ?? "https://us-west-2.recall.ai/api/v1";

export function getPublicUrl(): string {
  const explicit = (process.env.REPLIT_URL ?? "").replace(/\/$/, "");
  if (explicit) return explicit;
  const domains = process.env.REPLIT_DOMAINS ?? "";
  const host = domains.split(",")[0].trim();
  return host ? `https://${host}` : "";
}

export async function setOutputMedia(botId: string, url: string): Promise<void> {
  console.log(`[RECALL] output_media → ${botId} → ${url}`);
  const r = await fetch(`${RECALL_BASE}/bot/${botId}/output_media/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${RECALL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ camera: { kind: "webpage", config: { url } } }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Recall ${r.status}: ${text.slice(0, 200)}`);
  console.log(`[RECALL] ✅ status=${r.status}`);
}

export async function createBot(meetingUrl: string, botName: string, initialUrl: string): Promise<Record<string, unknown>> {
  const payload = {
    meeting_url: meetingUrl,
    bot_name: botName,
    output_media: {
      camera: { kind: "webpage", config: { url: initialUrl } },
    },
    variant: {
      google_meet: "web_4_core",
      zoom: "web_4_core",
      microsoft_teams: "web_4_core",
    },
  };

  const r = await fetch(`${RECALL_BASE}/bot/`, {
    method: "POST",
    headers: {
      Authorization: `Token ${RECALL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await r.json() as Record<string, unknown>;
  if (!r.ok) throw new Error(`Recall create bot ${r.status}: ${JSON.stringify(data)}`);
  return data;
}

export async function removeBot(botId: string): Promise<void> {
  const r = await fetch(`${RECALL_BASE}/bot/${botId}/leave_call/`, {
    method: "POST",
    headers: { Authorization: `Token ${RECALL_API_KEY}` },
  });
  if (r.status !== 204 && !r.ok) {
    const text = await r.text();
    throw new Error(`Recall remove bot ${r.status}: ${text.slice(0, 200)}`);
  }
}
