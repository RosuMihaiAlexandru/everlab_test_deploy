// backend/index.js (hardened version for unit parsing)
const express = require('express');
const multer = require('multer');
const hl7 = require('hl7');
const cors = require('cors');
const fs = require('fs');
const csv = require('csv-parser');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/test', (req, res) => {
  res.send('Server is working');
});

const upload = multer({ storage: multer.memoryStorage() });

let diagnosticMetrics = [];
let csvLoaded = false;

async function loadCSVData() {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(path.join(__dirname, 'data/diagnostic_metrics.csv'))
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => {
        diagnosticMetrics = results;
        console.log('✅ diagnostic_metrics.csv loaded with', diagnosticMetrics.length, 'entries');
        resolve();
      });
  });
}

function parseHL7Content(content) {
  const parsed = hl7.parseString(content);
  const results = [];
  console.log('✅ HL7 content parsed, segments count:', parsed.length);

  parsed.forEach(segment => {
    const segmentName = Array.isArray(segment[0]) ? segment[0][0] : segment[0];
    console.log('🔍 Processing segment:', segment);

    if (segmentName?.trim() === 'OBX') {
      console.log('🔍 OBX segment found:', segment);
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
      } catch (err) {
        console.error('⚠️ Error parsing units:', raw, err);
        units = '';
      }

      if (code && !isNaN(value) && units) {
        results.push({ code, value, units });
      } else {
        console.warn('⚠️ Incomplete OBX data:', { code, value, units });
      }
    }
  });

  return results;
}

function findAbnormalResults(parsedResults) {
  return parsedResults.map(result => {
    const matches = diagnosticMetrics.filter(metric => {
      const codes = metric.oru_sonic_codes.split(';').map(c => c.trim());
      const units = metric.oru_sonic_units.split(';').map(u => u.trim());
      const match = codes.includes(result.code) && units.includes(result.units);
      return match;
    });

    if (matches.length > 0) {
      const { everlab_lower, everlab_higher } = matches[0];
      const isAbnormal = result.value < parseFloat(everlab_lower) || result.value > parseFloat(everlab_higher);
      return { ...result, isAbnormal, range: `${everlab_lower} - ${everlab_higher}` };
    }

    return null;
  }).filter(result => result !== null);
}

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

    res.json({ results });
  } catch (err) {
    console.error('❌ Error during file processing:', err);
    res.status(500).json({ error: 'Failed to parse ORU file' });
  }
});

// Export the handler for Vercel
module.exports = app;
