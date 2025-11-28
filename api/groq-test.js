export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      res.setHeader('Content-Type', 'application/json');
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // use the Vercel env variable you actually set
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ error: 'Missing GROQ_API_KEY' });
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'user', content: "Say 'Groq on Vercel works' only." },
        ],
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      res.setHeader('Content-Type', 'application/json');
      return res.status(500).json({ error: `Groq API error: ${text}` });
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message?.content || '';
    res.setHeader('Content-Type', 'application/json');
    return res.status(200).json({ message });
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    res.setHeader('Content-Type', 'application/json');
    return res.status(500).json({ error: msg });
  }
}