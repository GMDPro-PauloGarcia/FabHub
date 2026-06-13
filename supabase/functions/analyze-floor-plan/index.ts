import { serve } from "https://deno.land/std@0.177.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  try {
    const { imageBase64, mimeType = "image/jpeg" } = await req.json();

    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "imageBase64 is required" }), {
        status: 400,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const CLAUDE_KEY = Deno.env.get("CLAUDE_API_KEY");
    if (!CLAUDE_KEY) {
      return new Response(JSON.stringify({ error: "CLAUDE_API_KEY not configured" }), {
        status: 500,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const prompt = `You are a quantity surveyor assistant. Analyze this architectural floor plan.

Extract and return ONLY a valid JSON object with these fields:
{
  "totalArea": <number in sqm, or null if not found>,
  "spaces": [
    { "name": "<room/space name>", "area": <number in sqm or null> }
  ],
  "projectType": "<one of: kiosk | retail | office | fnb | unknown>",
  "notes": "<brief observation about the plan, max 1 sentence>"
}

Rules:
- If dimensions are in meters, compute area (length × width).
- If dimensions are in feet, convert to meters first (1 ft = 0.3048 m).
- If no scale or dimensions are visible, estimate relative areas based on visual proportions and set totalArea to your best estimate.
- projectType: use "fnb" for restaurants/cafes/food courts, "retail" for shops/stores, "office" for workspaces, "kiosk" for small booths under 30 sqm, "unknown" if unclear.
- For multi-page PDFs, analyze the page that shows the floor plan layout.
- Return ONLY the JSON. No explanation, no markdown.`;

    const isPdf = mimeType === "application/pdf";
    const fileContent = isPdf
      ? { type: "document", source: { type: "base64", media_type: "application/pdf", data: imageBase64 } }
      : { type: "image", source: { type: "base64", media_type: mimeType, data: imageBase64 } };

    const headers: Record<string, string> = {
      "x-api-key": CLAUDE_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    };
    if (isPdf) headers["anthropic-beta"] = "pdfs-2024-09-25";

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: "claude-opus-4-8",
        max_tokens: 512,
        messages: [
          {
            role: "user",
            content: [fileContent, { type: "text", text: prompt }],
          },
        ],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return new Response(JSON.stringify({ error: `Claude API error: ${response.status}`, detail: err }), {
        status: 502,
        headers: { ...CORS, "Content-Type": "application/json" },
      });
    }

    const data = await response.json();
    const raw = data.content?.[0]?.text || "{}";

    let parsed;
    try {
      parsed = JSON.parse(raw.trim());
    } catch {
      // Try to extract JSON from surrounding text
      const match = raw.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { totalArea: null, spaces: [], projectType: "unknown", notes: "Could not parse response." };
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...CORS, "Content-Type": "application/json" },
    });
  }
});
