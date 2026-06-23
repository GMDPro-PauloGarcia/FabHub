const xlsx = require('xlsx');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fileData } = req.body || {};
  if (!fileData) return res.status(400).json({ error: 'No file data provided' });

  try {
    const buffer = Buffer.from(fileData, 'base64');
    const workbook = xlsx.read(buffer, { type: 'buffer' });

    const bomSheetName = workbook.SheetNames.find(n => /bom/i.test(n));
    const boqSheetName = workbook.SheetNames.find(n => /boq/i.test(n));

    if (!bomSheetName) {
      return res.status(400).json({ error: 'No BOM sheet found. Make sure your Excel has a sheet named "BOM".' });
    }

    let projectName = '', projectLocation = '', quotationNo = '';
    if (boqSheetName) {
      const boqRows = xlsx.utils.sheet_to_json(workbook.Sheets[boqSheetName], { header: 'A', defval: '' });
      for (const row of boqRows.slice(0, 10)) {
        const c = String(row.C || '').trim();
        const d = String(row.D || '').trim();
        if (c === 'Project Name:') projectName = d;
        if (c === 'Project Location:') projectLocation = d;
        if (String(row.G || '').trim() === 'Quotation No.') quotationNo = String(row.H || '').trim();
      }
    }

    const bomRows = xlsx.utils.sheet_to_json(workbook.Sheets[bomSheetName], { header: 'A', defval: '' });
    const materials = parseBOM(bomRows);

    return res.status(200).json({ projectName, projectLocation, quotationNo, materials, totalItems: materials.length });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to parse file: ' + err.message });
  }
};

function parseBOM(rows) {
  const materials = [];
  let inMaterials = false;
  let currentBoqItem = '';

  for (const row of rows) {
    const a = String(row.A || '').trim();
    const b = String(row.B || '').trim();
    const c = String(row.C || '').trim();
    const d = String(row.D || '').trim();

    if (Object.values(row).some(v => String(v).includes('#REF!'))) continue;

    if (a === 'MATERIALS NEEDED') { inMaterials = false; continue; }
    if (a === 'Material' || a === 'Material ') { inMaterials = true; continue; }
    if (['Direct Unit Cost', 'Total Unit Cost', 'Total Markup', 'COST PER UNIT'].includes(a)) {
      inMaterials = false; continue;
    }
    if (['Wastage', 'Handling', 'Transportation', 'Contingencies & Miscellaneous', 'OT Allowance', 'Equipment Fund'].some(k => a.startsWith(k))) continue;
    if (a.startsWith("Contractor's")) continue;

    if (!inMaterials && a && parseFloat(b) > 0 && c) {
      currentBoqItem = a;
      continue;
    }

    if (inMaterials && a && a !== 'Misc.' && parseFloat(b) > 0 && c) {
      const qty = Math.round(parseFloat(b) * 1000) / 1000;
      const unitCost = parseFloat(d) || 0;
      materials.push({ boqItem: currentBoqItem, name: a, qty, unit: c, unitCost });
    }
  }

  return materials;
}
