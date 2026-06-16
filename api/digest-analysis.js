export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured.' });

  const d = req.body || {};

  const prompt = `You are GMD Productions Inc.'s internal AI Finance Analyst. Every day at 4PM you review the company's live financial data and write a concise, frank daily digest for the finance team.

Here is today's data snapshot:

DATE: ${d.date}

COLLECTIONS / AR
- Total Billed: ₱${d.totalBilled}
- Total Collected: ₱${d.totalCollected}
- Collection Rate: ${d.collectionRate}%
- Outstanding AR: ₱${d.outstanding}
- DSO: ${d.dso} days
- Overdue Invoices: ${d.overdueCount} invoices totaling ₱${d.overdueAmt}
  (1–30 days: ${d.age30}, 31–60 days: ${d.age60}, 60+ days: ${d.age90p})

DAILY CASH POSITION
- Opening Balance: ₱${d.cpTotalBeg}
- Closing Balance: ₱${d.cpTotalEnd}
- Collections Today: ₱${d.cpCollections}
- Net Movement: ₱${d.cpNetMove}
- Bank Balances: ${d.bankSummary}
${d.noCashPos ? '⚠️ No cash position entry was logged today.' : ''}

BILLING / PAYABLES
- Total Unpaid Payables: ₱${d.totalPayables}
- Overdue Payables: ${d.overduePayables} items totaling ₱${d.overduePayablesAmt}
- Unbilled Awarded Projects: ${d.unbilledCount}
- Contract Backlog (awarded, not yet billed): ₱${d.backlog}

PROFITABILITY
- Gross Margin: ${d.grossMargin}%
- Gross Profit: ₱${d.grossProfit}
- Total Expenses (YTD): ₱${d.totalExpenses}
- This Month Revenue: ₱${d.thisMonthRev}
- Revenue vs Last Month: ${d.revTrend > 0 ? '+' : ''}${d.revTrend}%
- Win Rate: ${d.winRate}%
- Average Deal Size: ₱${d.avgDeal}

Write a short daily financial digest (5–8 sentences) covering:
1. Overall financial health in one sentence
2. The most important thing finance needs to act on TODAY (collections, cash, payables)
3. Any warning signs or trends that need attention
4. One forward-looking note or recommendation

Write in a direct, professional tone — like a CFO briefing their team. No bullet points. No headers. Just clear, analytical prose. Do not repeat all the numbers back — highlight the meaningful patterns and risks. Keep it under 120 words.`;

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
        max_tokens: 300,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(502).json({ error: `Claude API error: ${response.status} — ${err}` });
    }

    const claude = await response.json();
    const analysis = claude.content?.[0]?.text?.trim() || '';
    return res.status(200).json({ analysis });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}
