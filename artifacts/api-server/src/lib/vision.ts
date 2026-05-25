import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ScreenAnalysis {
  page_summary: string;
  clickable_elements: string[];
  recommended_next_click: string;
  recommended_selector: string;
  narration: string;
}

const VISION_PROMPT = `You are helping an AI sales agent named GiGi navigate a web app during a live demo.
Look at this screenshot and return ONLY raw JSON — no markdown, no backticks:
{
  "page_summary": "one sentence describing what page/screen this is",
  "clickable_elements": ["list of visible buttons, tabs, and links"],
  "recommended_next_click": "the most impressive thing to click for a sales demo",
  "recommended_selector": "the exact visible text label of the element to click (short, no parentheses)",
  "narration": "what GiGi should say out loud about what is on screen right now"
}`;

export async function analyzeScreen(screenshotBase64: string): Promise<ScreenAnalysis> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY not set");

  console.log("[VISION] sending screenshot to gemini-flash-latest...");

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

  const result = await model.generateContent([
    { inlineData: { mimeType: "image/jpeg", data: screenshotBase64 } },
    VISION_PROMPT,
  ]);

  const rawText = result.response.text();
  console.log("[VISION] raw response:", rawText.slice(0, 300));

  const cleaned = rawText
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  let parsed: ScreenAnalysis;
  try {
    parsed = JSON.parse(cleaned) as ScreenAnalysis;
  } catch {
    throw new Error(`Gemini returned non-JSON: ${rawText.slice(0, 200)}`);
  }

  console.log("[VISION] ✅ analysis complete");
  return parsed;
}
