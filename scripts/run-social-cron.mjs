import { appendFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export async function invokeCron({ job, baseUrl, secret, bypassSecret, fetchImpl = fetch }) {
  if (!['delivery', 'generation', 'instagram-health'].includes(job)) throw new Error('Unsupported cron job.');
  if (!baseUrl || !secret) throw new Error('Configure CMS_BASE_URL and CRON_SECRET in GitHub.');
  const url = new URL(baseUrl);
  if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('CMS_BASE_URL must be an HTTPS origin without a path or credentials.');
  }
  url.pathname = `/api/cron/${job}`;
  const headers = { Authorization: `Bearer ${secret}`, Accept: 'application/json' };
  if (bypassSecret) headers['x-vercel-protection-bypass'] = bypassSecret;
  let response;
  try {
    response = await fetchImpl(url, { headers, redirect: 'error', signal: AbortSignal.timeout(180_000) });
  } catch {
    throw new Error('CMS request failed or timed out. Check CMS logs before rerunning; it may have already processed posts.');
  }
  if (!response.ok) throw new Error(`CMS returned HTTP ${response.status}. Check CMS cron logs.`);
  let body;
  try { body = await response.json(); } catch { throw new Error("CMS returned invalid JSON."); }
  if (body?.ok !== true || !body.summary) throw new Error('CMS reported a failed or invalid run. Check CMS cron logs.');
  return body.summary;
}

async function main() {
  const job = process.env.CRON_JOB;
  const summary = await invokeCron({ job, baseUrl: process.env.CMS_BASE_URL, secret: process.env.CRON_SECRET,
    bypassSecret: process.env.VERCEL_AUTOMATION_BYPASS_SECRET });
  console.log(JSON.stringify({ job, ...summary }));
  if (summary.bypassed) console.log('::warning::Delivery is disabled in the CMS.');
  if (summary.skipped) console.log(`::warning::${summary.skipped} campaign(s) skipped; check CMS logs.`);
  if (summary.retrying) console.log(`::warning::${summary.retrying} delivery attempt(s) await CMS-managed retries.`);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY,
    `### CMS cron: ${job}\n\n\`\`\`json\n${JSON.stringify(summary, null, 2)}\n\`\`\`\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
