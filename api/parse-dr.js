// OCR a delivery-receipt / goods-received-note photo or PDF into structured
// line items, using the Anthropic Messages API (vision / document blocks).
// Mirrors api/boq.js for CORS, key handling and JSON extraction.
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured in Vercel environment variables.' });

  const { fileData, mimeType } = req.body || {};
  if (!fileData) return res.status(400).json({ error: 'No file provided.' });

  const isPdf = (mimeType || '').includes('pdf');
  const mediaType = mimeType || (isPdf ? 'application/pdf' : 'image/jpeg');

  const instruction = `You are reading a supplier's Delivery Receipt (DR) / Goods Received Note for GMD Productions Inc. (Philippines).
Extract the header fields and every line item.

Respond ONLY with a valid JSON object, no explanation or markdown:
{
  "drNo": "delivery receipt / DR / invoice number, or empty string",
  "date": "YYYY-MM-DD or empty string",
  "supplier": "supplier / vendor company name, or empty string",
  "poNumber": "purchase order number if shown, or empty string",
  "items": [
    { "name": "item description", "qty": 0, "unitCost": 0 }
  ]
}
Rules:
- qty and unitCost are plain numbers (no commas, no currency symbols). Use 0 if a unit cost is not shown.
- Include every line item you can read; keep item names concise but specific.
- Do not invent values that are not present.`;

  const fileBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: fileData } }
    : { type: 'image', source: { type: 'base64', media_type: mediaType, data: fileData } };

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
        max_tokens: 2048,
        messages: [{ role: 'user', content: [fileBlock, { type: 'text', text: instruction }] }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: `Claude API error: ${response.status} — ${err}` });
    }

    const claude = await response.json();
    const raw = claude.content?.[0]?.text || '';
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return res.status(502).json({ error: 'Claude returned non-JSON response.', raw });

    const parsed = JSON.parse(jsonMatch[0]);
    parsed.items = (parsed.items || []).map(it => ({
      name: String(it.name || it.desc || '').trim(),
      qty: Number(it.qty) || 0,
      unitCost: Number(it.unitCost) || Number(it.price) || 0,
    })).filter(it => it.name);

    return res.status(200).json({
      drNo: parsed.drNo || '',
      date: parsed.date || '',
      supplier: parsed.supplier || '',
      poNumber: parsed.poNumber || '',
      items: parsed.items,
    });
  } catch (e) {
    return res.status(500).json({ error: 'Failed to parse delivery receipt: ' + e.message });
  }
};
