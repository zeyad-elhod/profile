import Database from 'better-sqlite3';
import path from 'path';

export default async function handler(req, res) {
  try {
    const dbPath = path.resolve(process.cwd(), 'cars.db');
    // open readonly, ensure file exists
    const db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const stmt = db.prepare('SELECT * FROM cars LIMIT 10');
    const rows = stmt.all();
    db.close();
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json(rows);
  } catch (err) {
    console.error('Error reading cars.db', err && err.message ? err.message : err);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: 'Failed to read database' });
  }
}
