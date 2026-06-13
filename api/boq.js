export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured in Vercel environment variables.' });

  const { client, ceType, area, finishLevel, scopeNotes, location } = req.body || {};
  if (!scopeNotes && !area) return res.status(400).json({ error: 'Provide at least scope notes or area.' });

  const prompt = `You are a senior Quantity Surveyor for GMD Productions Inc., a fit-out and fabrication company in the Philippines.

Generate a realistic Bill of Quantities (BOQ) for the following project:

Client: ${client || 'N/A'}
Project Type: ${ceType || 'Fabrication / Fit-out'}
Location: ${location || 'Metro Manila'}
Area / Size: ${area ? area + ' sqm' : 'Not specified'}
Finish Level: ${finishLevel || 'Mid-range'}
Scope / Description:
${scopeNotes || 'General fit-out works'}

Rules:
- Use Philippine Peso (₱) for all unit costs
- Use realistic 2025 Philippine market rates for materials and labor
- Organize items into these categories ONLY: Materials, Labor, Subcon, Overhead
- Each item must have: category, item (clear description), unit (pc/sheet/m/m²/lot/set/etc.), qty (number), unitCost (number, no commas), total (qty × unitCost)
- Include 15–30 line items covering the full scope — materials, fabrication labor, installation, permits if applicable
- For signage/fabrication: include substrate, surface finish (vinyl/paint/acrylic), LED components, steel frame, labor
- For fit-out: include partitions, ceiling, flooring, electrical rough-in, painting, millwork
- Be specific with item names (e.g. "Aluminum composite panel 4mm Alucobond" not just "ACP")
- Quantities must be realistic for the given area

Respond ONLY with a valid JSON object in this exact format, no explanation:
{
  "items": [
    { "category": "Materials", "item": "...", "unit": "...", "qty": 0, "unitCost": 0, "total": 0 }
  ],
  "notes": "Brief QS note about assumptions made (1-2 sentences)"
}`;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 4096,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: `Claude API error: ${response.status} — ${err}` });
    }

    const claude = await response.json();
    const raw = claude.content?.[0]?.text || '';

    // Extract JSON from response (strip any markdown fences if present)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: 'Claude returned non-JSON response.', raw });

    const parsed = JSON.parse(jsonMatch[0]);
    // Recalculate totals server-side so they're always accurate
    parsed.items = (parsed.items || []).map(it => ({
      ...it,
      qty: Number(it.qty) || 0,
      unitCost: Number(it.unitCost) || 0,
      total: (Number(it.qty) || 0) * (Number(it.unitCost) || 0),
    }));

    return res.status(200).json(parsed);
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
