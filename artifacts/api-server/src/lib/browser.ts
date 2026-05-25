import { chromium, type Browser, type Page } from "playwright-core";
import { execSync } from "child_process";

let browser: Browser | null = null;
let page: Page | null = null;
let raelLoggedIn = false;

function getChromiumPath(): string {
  const envPath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (envPath) return envPath;

  const candidates = [
    "/run/current-system/sw/bin/chromium",
    "/nix/var/nix/profiles/default/bin/chromium",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/usr/bin/google-chrome",
  ];
  for (const c of candidates) {
    try {
      execSync(`test -x "${c}"`, { stdio: "ignore" });
      return c;
    } catch {
      continue;
    }
  }
  try {
    const found = execSync(
      "which chromium 2>/dev/null || which chromium-browser 2>/dev/null || which google-chrome 2>/dev/null",
      { encoding: "utf8" }
    ).trim();
    if (found) return found;
  } catch { /* ignore */ }

  throw new Error("Chromium binary not found. Set PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH.");
}

export async function ensureBrowser(): Promise<Page> {
  if (browser && page && !page.isClosed()) return page;

  if (browser) {
    try { await browser.close(); } catch { /* ignore */ }
    raelLoggedIn = false;
  }

  const executablePath = getChromiumPath();
  console.log("[BROWSER] launching chromium from", executablePath);

  browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
      "--no-first-run",
      "--no-zygote",
      "--single-process",
    ],
  });

  page = await browser.newPage();
  await page.setViewportSize({ width: 1280, height: 800 });
  console.log("[BROWSER] launched ✅");
  return page;
}

export async function closeBrowser(): Promise<void> {
  if (browser) {
    console.log("[BROWSER] closing...");
    try { await browser.close(); } catch { /* ignore */ }
    browser = null;
    page = null;
    raelLoggedIn = false;
    console.log("[BROWSER] closed ✅");
  }
}

export async function browserGoto(url: string): Promise<void> {
  const p = await ensureBrowser();
  await p.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
}

export async function browserScrollDown(): Promise<void> {
  const p = await ensureBrowser();
  await p.evaluate(() => (globalThis as unknown as { scrollBy(x: number, y: number): void }).scrollBy(0, 500));
}

export async function browserScrollUp(): Promise<void> {
  const p = await ensureBrowser();
  await p.evaluate(() => (globalThis as unknown as { scrollBy(x: number, y: number): void }).scrollBy(0, -500));
}

export async function browserClick(target: string): Promise<void> {
  const p = await ensureBrowser();
  try {
    await p.getByText(target, { exact: false }).first().click({ timeout: 5000 });
    console.log(`[BROWSER] clicked by text: "${target}"`);
  } catch {
    console.log(`[BROWSER] text click failed, trying selector: "${target}"`);
    await p.click(target, { timeout: 8000 });
  }
  await p.waitForTimeout(2000);
}

export async function browserScreenshot(): Promise<string> {
  const p = await ensureBrowser();
  const buf = await p.screenshot({ type: "jpeg", quality: 85 });
  return buf.toString("base64");
}

export async function browserScreenshotRaw(): Promise<Buffer> {
  const p = await ensureBrowser();
  return p.screenshot({ type: "jpeg", quality: 85 }) as Promise<Buffer>;
}

export async function browserLoginRael(): Promise<void> {
  const email = process.env.RAEL_EMAIL ?? "";
  const password = process.env.RAEL_PASSWORD ?? "";
  if (!email || !password) throw new Error("RAEL_EMAIL or RAEL_PASSWORD not set");

  if (raelLoggedIn) {
    console.log("[BROWSER] already logged into Rael, skipping");
    return;
  }

  const p = await ensureBrowser();
  console.log("[BROWSER] navigating to rael.facility19.com...");
  await p.goto("https://rael.facility19.com", { waitUntil: "domcontentloaded", timeout: 30000 });
  await p.waitForTimeout(1000);

  const signInBtn = await p.$('a:has-text("Sign in"), button:has-text("Sign in"), a[href*="sign"], a[href*="login"]');
  if (signInBtn) {
    console.log("[BROWSER] clicking Sign in...");
    await Promise.all([
      p.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 15000 }).catch(() => {}),
      signInBtn.click(),
    ]);
    await p.waitForTimeout(1500);
  }

  await p.waitForSelector('input[placeholder*="email" i], input[type="email"], input[name="email"]', { timeout: 15000 });

  const emailInput =
    (await p.$('input[placeholder*="email" i]')) ??
    (await p.$('input[type="email"]')) ??
    (await p.$('input[name="email"]'));
  if (!emailInput) throw new Error("Could not find email field");
  await emailInput.fill(email);

  const passwordInput = await p.$('input[type="password"], input[placeholder*="password" i]');
  if (!passwordInput) throw new Error("Could not find password field");
  await passwordInput.fill(password);

  const submitBtn =
    (await p.$('button:has-text("Sign in")')) ??
    (await p.$('button[type="submit"]')) ??
    (await p.$('input[type="submit"]')) ??
    (await p.$('button:has-text("Log in")')) ??
    (await p.$('button:has-text("Login")'));
  if (!submitBtn) throw new Error("Could not find submit button");

  console.log("[BROWSER] submitting credentials...");
  await Promise.all([
    p.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 20000 }).catch(() => {}),
    submitBtn.click(),
  ]);
  await p.waitForTimeout(2500);

  raelLoggedIn = true;
  console.log("[BROWSER] Rael login ✅ current URL:", p.url());
}
