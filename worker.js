// Cloudflare Worker: my-groq-proxy
// Secret ka naam: GROQ_API_KEY (Settings > Variables and Secrets me hona chahiye)
const ALLOWED = ['https://roitx.qd.je', 'https://roitx.dpdns.org']; // apni domains yahan jodein

const MODELS = new Set([
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'meta-llama/llama-4-scout-17b-16e-instruct',     // bill scan (image)
  'meta-llama/llama-4-maverick-17b-128e-instruct'  // bill scan backup (image)
]);

export default {
  async fetch(req, env) {
    const origin = req.headers.get('Origin') || '';
    const ok = ALLOWED.includes(origin) || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    const cors = {
      'Access-Control-Allow-Origin': ok ? origin : ALLOWED[0],
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Vary': 'Origin'
    };
    const reply = (obj, status = 200) =>
      new Response(JSON.stringify(obj), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    // Browser se "Visit" dabane par yahi dikhega: matlab worker sahi deploy hua hai
    if (req.method === 'GET') return reply({ ok: true, message: 'my-groq-proxy chal raha hai (POST se use karein)' });
    if (req.method !== 'POST') return reply({ error: 'POST only' }, 405);

    if (!env.GROQ_API_KEY) return reply({ error: 'GROQ_API_KEY secret set nahi hai' }, 500);

    let body;
    try { body = await req.json(); } catch (e) { return reply({ error: 'Invalid JSON' }, 400); }
    if (!MODELS.has(body.model)) return reply({ error: 'Model allowed nahi hai: ' + body.model }, 400);
    if (!Array.isArray(body.messages) || !body.messages.length) return reply({ error: 'messages chahiye' }, 400);

    const payload = {
      model: body.model,
      messages: body.messages, // image_url wala content array bhi jaisa hai waisa pass hota hai
      temperature: typeof body.temperature === 'number' ? body.temperature : 0.1
    };

    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + env.GROQ_API_KEY },
        body: JSON.stringify(payload)
      });
      return new Response(await r.text(), { status: r.status, headers: { ...cors, 'Content-Type': 'application/json' } });
    } catch (e) {
      return reply({ error: 'Groq se connect nahi hua: ' + e.message }, 502);
    }
  }
};
