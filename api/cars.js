import initSqlJs from 'sql.js';
import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  try {
    const locateFile = (file) => path.join(process.cwd(), 'node_modules', 'sql.js', 'dist', file);
    const SQL = await initSqlJs({ locateFile });

    // Prefer ./data/cars.db, fallback to ./cars.db for local compatibility
    const primaryPath = path.resolve(process.cwd(), 'data', 'cars.db');
    const fallbackPath = path.resolve(process.cwd(), 'cars.db');
    let dbPath = primaryPath;
    if (!fs.existsSync(dbPath)) {
      if (fs.existsSync(fallbackPath)) dbPath = fallbackPath;
      else {
        res.setHeader('Content-Type', 'application/json');
        return res.status(500).json({ error: 'Database file not found. Expected at ./data/cars.db' });
      }
    }

    const fileBuffer = fs.readFileSync(dbPath);
    const u8 = new Uint8Array(fileBuffer);

    const db = new SQL.Database(u8);
    const results = db.exec('SELECT * FROM cars LIMIT 10;');

    const rows = [];
    if (results.length > 0) {
      const { columns, values } = results[0];
      for (const valueRow of values) {
        const obj = {};
        columns.forEach((col, i) => {
          obj[col] = valueRow[i];
        });
        rows.push(obj);
      }
    }

    db.close();
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(rows);
  } catch (err) {
    console.error('sql.js DB read error:', err && err.message ? err.message : err);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: 'Failed to read database', message: err && err.message ? err.message : String(err) });
  }
}
