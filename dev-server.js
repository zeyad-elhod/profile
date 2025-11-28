import express from 'express';
import path from 'path';
import { execFile } from 'child_process';

// This server prefers the native `better-sqlite3` if available.
// If not, it falls back to calling the `sqlite3` CLI (CSV output) so local dev works
// without building native modules.

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static(process.cwd()));

app.get('/api/cars', (req, res) => {
  const dbPath = path.resolve(process.cwd(), 'cars.db');
  // Try native module first
  (async function readWithNative(){
    try{
      const mod = await import('better-sqlite3');
      const Database = mod.default || mod;
      const db = new Database(dbPath, { readonly: true, fileMustExist: true });
      const rows = db.prepare('SELECT * FROM cars LIMIT 10').all();
      db.close();
      return res.json(rows);
    }catch(nativeErr){
      // Fallback to sqlite3 CLI
      execFile('sqlite3', ['-header', '-csv', dbPath, 'SELECT * FROM cars LIMIT 10;'], (err, stdout, stderr) => {
        if(err){
          console.error('SQLite3 CLI read error', err, stderr);
          return res.status(500).json({ error: 'Failed to read database', message: err.message || String(err) });
        }
        try{
          const lines = stdout.trim().split(/\r?\n/);
          if(lines.length === 0 || !lines[0]) return res.json([]);
          const headers = lines[0].split(',').map(h=>h.replace(/^"|"$/g, ''));
          const rows = lines.slice(1).map(l => {
            // simple CSV parse for this controlled output
            const cols = l.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/).map(c => c.replace(/^"|"$/g, ''));
            const obj = {};
            headers.forEach((h,i)=>{
              // try to convert numeric fields
              const val = cols[i];
              if(val === '') obj[h] = null;
              else if(!isNaN(val) && val.trim() !== '') obj[h] = Number(val);
              else obj[h] = val;
            });
            return obj;
          });
          return res.json(rows);
        }catch(parseErr){
          console.error('Failed to parse sqlite3 CLI output', parseErr);
          return res.status(500).json({ error: 'Failed to parse database output' });
        }
      });
    }
  })();
});

app.listen(PORT, () => {
  console.log(`Dev server running at http://localhost:${PORT}`);
});
