import { createServer } from 'node:http';
import { access, appendFile, mkdir, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { constants } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const LEADS_PATH = join(DATA_DIR, 'leads.jsonl');
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const SITE_URL = process.env.SITE_URL || 'https://jerednel.github.io/answerproof/';

const REQUIRED_FIELDS = ['name', 'email', 'domain', 'category'];

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': 'no-store',
    ...headers
  });
  res.end(body);
}

function sendJson(res, status, data) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store'
  });
  res.end(JSON.stringify(data, null, 2));
}

function escapeHtml(value) {
  return String(value || '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 64_000) throw new Error('Request too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

function parseForm(body) {
  const params = new URLSearchParams(body);
  return Object.fromEntries(Array.from(params.entries()).map(([key, value]) => [key, value.trim()]));
}

function validateLead(lead) {
  const missing = REQUIRED_FIELDS.filter((field) => !lead[field]);
  if (missing.length) return `Missing required fields: ${missing.join(', ')}`;
  if (!lead.email.includes('@')) return 'Work email must look like an email address';
  if (lead.domain.length > 160 || lead.category.length > 160) return 'Domain and category must be under 160 characters';
  return '';
}

function page({ error = '', values = {} } = {}) {
  const field = (name) => escapeHtml(values[name] || '');
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Answerproof Diagnostic Request</title>
  <style>
    :root { color-scheme: dark; --bg:#0d1117; --panel:#151922; --border:#30363d; --text:#e6edf3; --muted:#8b949e; --green:#8be9a8; --blue:#8fd3ff; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top left, rgba(143,211,255,.12), transparent 32%), var(--bg); color: var(--text); line-height: 1.6; }
    main { width: min(980px, calc(100% - 32px)); margin: 0 auto; padding: 56px 0; }
    .hero { display: grid; gap: 16px; margin-bottom: 28px; }
    .kicker { color: var(--green); font: 700 .82rem ui-monospace, SFMono-Regular, Menlo, monospace; text-transform: uppercase; letter-spacing: .06em; }
    h1 { max-width: 12ch; margin: 0; font-size: clamp(2.5rem, 7vw, 4.8rem); line-height: .98; letter-spacing: 0; }
    p { max-width: 68ch; color: var(--muted); font-size: 1.08rem; }
    .grid { display: grid; grid-template-columns: .9fr 1.1fr; gap: 18px; align-items: start; }
    .panel, form { border: 1px solid var(--border); background: rgba(255,255,255,.025); border-radius: 8px; padding: 24px; }
    ul { margin: 16px 0 0; padding-left: 22px; color: var(--muted); }
    label { display: grid; gap: 7px; color: var(--muted); font-size: .94rem; }
    form { display: grid; gap: 14px; }
    input, textarea { width: 100%; border: 1px solid var(--border); border-radius: 8px; background: rgba(8,16,25,.76); color: var(--text); min-height: 44px; padding: 10px 12px; font: inherit; }
    textarea { min-height: 130px; resize: vertical; }
    button, a.button { min-height: 46px; display: inline-flex; align-items: center; justify-content: center; border: 0; border-radius: 8px; background: var(--green); color: #081019; font-weight: 800; text-decoration: none; padding: 11px 16px; cursor: pointer; }
    .error { border: 1px solid rgba(255, 190, 137, .5); background: rgba(255, 190, 137, .1); color: #ffdfc2; border-radius: 8px; padding: 12px 14px; }
    .fine { font-size: .9rem; color: var(--muted); margin: 0; }
    @media (max-width: 760px) { .grid { grid-template-columns: 1fr; } main { padding-top: 36px; } }
  </style>
</head>
<body>
  <main>
    <section class="hero">
      <div class="kicker">Answerproof Diagnostic</div>
      <h1>Request the $1,500 AI-search audit.</h1>
      <p>Send the minimum context needed to scope the diagnostic. I will reply with confirmation, invoice/payment instructions, and the prompt set I will test.</p>
    </section>
    <section class="grid">
      <aside class="panel">
        <strong>What this covers</strong>
        <ul>
          <li>10 buyer questions.</li>
          <li>Up to 3 competitor domains.</li>
          <li>AI answer and citation review.</li>
          <li>Source trail and competitor gaps.</li>
          <li>30-day implementation plan.</li>
        </ul>
        <p class="fine">Typical turnaround: 3 business days after scope/payment.</p>
      </aside>
      <form method="post" action="/request">
        ${error ? `<div class="error">${escapeHtml(error)}</div>` : ''}
        <label>Name <input name="name" autocomplete="name" value="${field('name')}" required></label>
        <label>Work email <input name="email" type="email" autocomplete="email" value="${field('email')}" required></label>
        <label>Company domain <input name="domain" placeholder="example.com" value="${field('domain')}" required></label>
        <label>Category <input name="category" placeholder="AI compliance platform" value="${field('category')}" required></label>
        <label>Competitors <input name="competitors" placeholder="competitor-a.com, competitor-b.com" value="${field('competitors')}"></label>
        <label>Buyer questions or sales context <textarea name="context" placeholder="What do buyers ask before they compare vendors?">${field('context')}</textarea></label>
        <button type="submit">Request diagnostic</button>
        <p class="fine">No newsletter. No dashboard upsell. Just scope, invoice, and the audit if there is a real gap to test.</p>
      </form>
    </section>
  </main>
</body>
</html>`;
}

function thanks(lead) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Answerproof Request Received</title>
  <style>
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, sans-serif; background: #0d1117; color: #e6edf3; line-height: 1.6; }
    main { width: min(780px, calc(100% - 32px)); margin: 0 auto; padding: 72px 0; }
    a { color: #8fd3ff; }
    .panel { border: 1px solid #30363d; background: rgba(255,255,255,.025); border-radius: 8px; padding: 24px; }
  </style>
</head>
<body>
  <main>
    <div class="panel">
      <h1>Request received.</h1>
      <p>I have the diagnostic request for <strong>${escapeHtml(lead.domain)}</strong>. I will reply with scope confirmation and invoice/payment instructions.</p>
      <p><a href="${escapeHtml(SITE_URL)}">Back to Answerproof</a></p>
    </div>
  </main>
</body>
</html>`;
}

async function saveLead(lead) {
  await mkdir(DATA_DIR, { recursive: true });
  await appendFile(LEADS_PATH, `${JSON.stringify(lead)}\n`, 'utf8');
}

async function storageStatus() {
  await mkdir(DATA_DIR, { recursive: true });
  await access(DATA_DIR, constants.W_OK);
  return {
    data_dir: DATA_DIR,
    writable: true,
    leads_file_exists: existsSync(LEADS_PATH)
  };
}

async function adminExport(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const token = url.searchParams.get('token') || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!ADMIN_TOKEN || token !== ADMIN_TOKEN) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return;
  }

  if (!existsSync(LEADS_PATH)) {
    sendJson(res, 200, { leads: [] });
    return;
  }

  const lines = (await readFile(LEADS_PATH, 'utf8')).split(/\r?\n/).filter(Boolean);
  sendJson(res, 200, { leads: lines.map((line) => JSON.parse(line)) });
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');

    if (req.method === 'GET' && url.pathname === '/health') {
      try {
        sendJson(res, 200, { ok: true, storage: await storageStatus() });
      } catch (error) {
        sendJson(res, 500, { ok: false, storage: { data_dir: DATA_DIR, writable: false }, error: error.message });
      }
      return;
    }

    if (req.method === 'GET' && url.pathname === '/admin/leads') {
      await adminExport(req, res);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/') {
      send(res, 200, page());
      return;
    }

    if (req.method === 'POST' && url.pathname === '/request') {
      const lead = {
        id: randomUUID(),
        created_at: new Date().toISOString(),
        ...parseForm(await readBody(req))
      };
      const error = validateLead(lead);
      if (error) {
        send(res, 400, page({ error, values: lead }));
        return;
      }
      await saveLead(lead);
      send(res, 200, thanks(lead));
      return;
    }

    send(res, 404, 'Not found');
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`Answerproof intake listening on ${PORT}`);
});

process.on('uncaughtException', (error) => {
  console.error('uncaughtException', error);
  process.exit(1);
});

process.on('unhandledRejection', (error) => {
  console.error('unhandledRejection', error);
  process.exit(1);
});
