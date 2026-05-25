let activeBotId: string | null = null;
let latestScreenshot: Buffer | null = null;

export function setActiveBotId(id: string | null): void {
  console.log(`[STATE] activeBotId = ${id ?? "null"}`);
  activeBotId = id;
}

export function getActiveBotId(): string | null {
  return activeBotId;
}

export function setLatestScreenshot(buf: Buffer): void {
  latestScreenshot = buf;
}

export function getLatestScreenshot(): Buffer | null {
  return latestScreenshot;
}
