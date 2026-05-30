import { readFileSync } from 'node:fs';

const DEFAULT_BASE_URL = 'https://web-production-6fb4e.up.railway.app';

function readEnvFile(path) {
  try {
    return Object.fromEntries(
      readFileSync(path, 'utf8')
        .split(/\r?\n/)
        .filter((line) => line.trim() && !line.trim().startsWith('#'))
        .map((line) => {
          const index = line.indexOf('=');
          return [line.slice(0, index), line.slice(index + 1)];
        })
    );
  } catch {
    return {};
  }
}

const localEnv = readEnvFile('.env.local');
const token = process.env.ADMIN_TOKEN || localEnv.ADMIN_TOKEN;
const baseUrl = process.env.ANSWERPROOF_INTAKE_URL || DEFAULT_BASE_URL;

if (!token) {
  console.error('Missing ADMIN_TOKEN. Set it in .env.local or the environment.');
  process.exit(1);
}

const response = await fetch(`${baseUrl}/admin/leads?token=${encodeURIComponent(token)}`);
if (!response.ok) {
  console.error(`Lead fetch failed: ${response.status} ${response.statusText}`);
  process.exit(1);
}

const payload = await response.json();
const leads = (payload.leads || []).filter((lead) => lead.domain !== 'test-answerproof.example');

if (!leads.length) {
  console.log('No real Answerproof leads yet.');
  process.exit(0);
}

for (const lead of leads) {
  console.log([
    lead.created_at,
    lead.name,
    `<${lead.email}>`,
    lead.domain,
    `category="${lead.category}"`,
    lead.competitors ? `competitors="${lead.competitors}"` : ''
  ].filter(Boolean).join(' | '));
}
