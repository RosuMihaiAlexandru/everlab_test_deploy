// backend/api/upload.js (Fixed and optimized)
const express = require('express');
const multer = require('multer');
const hl7 = require('hl7');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

const upload = multer({ storage: multer.memoryStorage() });

let diagnosticMetrics = [];

// Load CSV data
async function loadCSVData() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(path.join(__dirname, '../data/diagnostic_metrics.csv'))
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        diagnosticMetrics = results;
        console.log('✅ diagnostic_metrics.csv loaded with', diagnosticMetrics.length, 'entries');
        resolve();
      })
      .on('error', (error) => reject(error));
  });
}

// HL7 Parsing logic
function parseHL7Content(content) {
  const parsed = hl7.parseString(content);
  const results = [];

  parsed.forEach(segment => {
    const segmentName = Array.isArray(segment[0]) ? segment[0][0] : segment[0];

    if (segmentName?.trim() === 'OBX') {
      const codeField = segment[3];
      const code = (Array.isArray(codeField) ? codeField[0] : codeField || '').toString().trim();
      const value = parseFloat(segment[5]);

      let units = '';
      const raw = segment[6];
      try {
        if (typeof raw === 'string') {
          units = raw.split('^')[0]?.trim() || '';
        } else if (Array.isArray(raw)) {
          const inner = raw[0] || '';
          units = typeof inner === 'string' ? inner.split('^')[0]?.trim() : String(inner);
        } else if (typeof raw === 'number') {
          units = raw.toString();
        } else {
          units = '';
        }
      } catch {
        units = '';
      }

      if (code && !isNaN(value) && units) {
        results.push({ code, value, units });
      }
    }
  });

  return results;
}

// Identify abnormal results
function findAbnormalResults(parsedResults) {
  return parsedResults.map(result => {
    const matches = diagnosticMetrics.filter(metric => {
      const codes = metric.oru_sonic_codes.split(';').map(c => c.trim());
      const units = metric.oru_sonic_units.split(';').map(u => u.trim());
      return codes.includes(result.code) && units.includes(result.units);
    });

    if (matches.length > 0) {
      const { everlab_lower, everlab_higher } = matches[0];
      const isAbnormal = result.value < parseFloat(everlab_lower) || result.value > parseFloat(everlab_higher);
      return { ...result, isAbnormal, range: `${everlab_lower} - ${everlab_higher}` };
    }

    return null;
  }).filter(result => result !== null);
}

// Ensure CSV is loaded once when API is initialized
let csvLoaded = false;

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    if (!csvLoaded) {
      await loadCSVData();
      csvLoaded = true;
    }

    const content = req.file.buffer.toString('utf8');
    const parsed = parseHL7Content(content);
    const results = findAbnormalResults(parsed);

    res.status(200).json({ results });
  } catch (err) {
    console.error('❌ Error during processing:', err);
    res.status(500).json({ error: 'Failed to parse ORU file' });
  }
});

module.exports = app;
