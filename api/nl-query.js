import { ChatGroq } from '@langchain/groq';
import { StructuredOutputParser } from '@langchain/core/output_parsers';
import { z } from 'zod';

const parser = StructuredOutputParser.fromZodSchema(
  z.object({
    sql: z.string().describe('Safe SQL query starting with SELECT or WITH'),
    safe: z.boolean().describe('True only if the SQL is read-only and safe to execute'),
    reason: z.string().describe('Short explanation of why the SQL is safe/unsafe'),
  }),
);

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Content-Type', 'application/json');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    let body;
    if (req.body && typeof req.body === 'object') {
      body = req.body;
    } else {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString('utf8');
      body = raw ? JSON.parse(raw) : {};
    }

    const question = body && body.question ? String(body.question) : '';
    if (!question) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ error: 'No question provided' });
    }

    if (!process.env.GROQ_API_KEY) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ error: 'Missing GROQ_API_KEY' });
    }

    const formatInstructions = parser.getFormatInstructions();
    const model = new ChatGroq({
      apiKey: process.env.GROQ_API_KEY,
      model: 'llama-3.3-70b-versatile',
      temperature: 0,
    });

    const response = await model.invoke([
      {
        role: 'system',
        content:
          'You are a strict SQL generator for a used cars SQLite database. Table: cars(columns: id, brand, model, year, mileage_km, price_eur, accident_history, fuel_type, transmission). Produce read-only SQL only.',
      },
      {
        role: 'system',
        content:
          'Rules: only SELECT or WITH; never write/DDL (no INSERT/UPDATE/DELETE/CREATE/ALTER/DROP/TRUNCATE/REPLACE/MERGE); avoid semicolons that chain statements; keep it minimal and safe.',
      },
      {
        role: 'system',
        content: `Output JSON with keys {sql, safe, reason}. Use these instructions: ${formatInstructions}`,
      },
      { role: 'user', content: question },
    ]);

    const rawContent = Array.isArray(response.content)
      ? response.content.map((c) => (typeof c === 'string' ? c : c?.text || '')).join(' ').trim()
      : String(response.content || '').trim();

    const parsed = (() => {
      try {
        return parser.parse(rawContent);
      } catch (err) {
        try {
          return typeof rawContent === 'string' ? JSON.parse(rawContent) : null;
        } catch (_) {
          return null;
        }
      }
    })();

    let sql = parsed?.sql ? String(parsed.sql).trim() : '';
    const safe = parsed && typeof parsed.safe !== 'undefined' ? Boolean(parsed.safe) : true;
    const reason = parsed?.reason || 'No reason provided';

    if (!sql && rawContent) {
      // Fallback: if model returned raw SQL string
      sql = rawContent.trim();
    }

    if (!sql) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ error: 'No SQL returned by model' });
    }

    const sqlUpper = sql.toUpperCase().trim();
    const startsOk = sqlUpper.startsWith('SELECT') || sqlUpper.startsWith('WITH');
    const forbidden = ['DELETE', 'UPDATE', 'INSERT', 'DROP', 'ALTER', 'TRUNCATE', 'CREATE', 'REPLACE', 'MERGE'];
    const hasForbidden = forbidden.some((kw) => new RegExp(`\\b${kw}\\b`, 'i').test(sql));

    if (!safe || !startsOk || hasForbidden) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(400).json({ error: 'Unsafe SQL blocked', sql, reason });
    }

    const queryUrl = `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host}/api/query`;
    const queryResponse = await fetch(queryUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql }),
    });

    const queryData = await queryResponse.json();

    if (!queryResponse.ok) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(queryResponse.status).json({
        error: queryData.error || 'Query failed',
        sql,
      });
    }

    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({ sql, rows: queryData, reason });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: msg });
  }
}
