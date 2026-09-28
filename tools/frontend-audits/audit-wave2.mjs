// Wave 2 audit — deeper module probes against the dev API.  Hits action
// endpoints (create / list / search) directly so we can detect 4xx / 5xx
// without driving a slow browser through every flow.  Output:
//   qa-shots/audit-wave-2/findings.json
import fs from 'node:fs';
import path from 'node:path';

const BASE = 'http://127.0.0.1:8090';
const API = `${BASE}/api/v1`;
const SHOTS = path.resolve('qa-shots/audit-wave-2');
fs.mkdirSync(SHOTS, { recursive: true });

const findings = { startedAt: new Date().toISOString(), probes: [] };

async function login() {
  const r = await fetch(`${API}/users/auth/login/`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'v19-e2e@openestimate.com', password: 'OpenEstimate2024!' }),
  });
  if (!r.ok) throw new Error('login failed: ' + r.status);
  return (await r.json()).access_token;
}

async function probe(token, label, method, route, body) {
  const start = Date.now();
  let status = 0;
  let preview = '';
  let ok = false;
  try {
    const r = await fetch(API + route, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    status = r.status;
    ok = r.ok;
    const text = await r.text();
    preview = text.slice(0, 220);
  } catch (e) {
    preview = String(e?.message || e);
  }
  const ms = Date.now() - start;
  const tag = ok ? 'OK ' : 'ERR';
  console.log(`${tag} ${status} ${method.padEnd(5)} ${route.padEnd(50)} ${ms}ms`);
  findings.probes.push({ label, method, route, status, ok, ms, preview });
  return { status, preview, ok };
}

(async () => {
  const token = await login();

  // Resolve a project + boq for scoped probes
  const projectsR = await fetch(`${API}/projects/`, { headers: { Authorization: `Bearer ${token}` } });
  const projects = projectsR.ok ? await projectsR.json() : [];
  const project = projects[0];
  if (!project) {
    console.log('no project — bailing');
    return;
  }
  const projectId = project.id;
  console.log(`using project: ${project.name} (${projectId})`);

  // BOQ
  const boqsR = await fetch(`${API}/boq/?project_id=${projectId}`, { headers: { Authorization: `Bearer ${token}` } });
  const boqs = boqsR.ok ? await boqsR.json() : [];
  const boqId = boqs[0]?.id;

  // ─── Reads ───────────────────────────────────────────────────────────
  await probe(token, 'projects.list', 'GET', '/projects/');
  await probe(token, 'projects.dashboard.cards', 'GET', '/projects/dashboard/cards/');
  await probe(token, 'projects.summary', 'GET', `/projects/${projectId}/summary`);
  await probe(token, 'projects.activity', 'GET', `/projects/${projectId}/activity?limit=5`);
  await probe(token, 'boq.list', 'GET', `/boq/?project_id=${projectId}`);
  if (boqId) {
    await probe(token, 'boq.get', 'GET', `/boq/${boqId}`);
    await probe(token, 'boq.positions', 'GET', `/boq/${boqId}/positions/?limit=10`);
    await probe(token, 'boq.totals', 'GET', `/boq/${boqId}/totals`);
  }
  await probe(token, 'costs.regions', 'GET', '/costs/regions/');
  await probe(token, 'costs.regions.stats', 'GET', '/costs/regions/stats/');
  await probe(token, 'costs.search', 'GET', '/costs/search/?q=concrete&limit=5');
  await probe(token, 'costs.categories', 'GET', '/costs/categories?region=fr_paris');
  await probe(token, 'assemblies.list', 'GET', '/assemblies/');
  await probe(token, 'documents.list', 'GET', `/documents/?project_id=${projectId}`);
  await probe(token, 'documents.summary', 'GET', `/documents/summary?project_id=${projectId}`);
  await probe(token, 'photos.list', 'GET', `/documents/photos?project_id=${projectId}`);
  await probe(token, 'tasks.list', 'GET', `/tasks/?project_id=${projectId}`);
  await probe(token, 'rfi.list', 'GET', `/rfi/?project_id=${projectId}`);
  await probe(token, 'meetings.list', 'GET', `/meetings/?project_id=${projectId}`);
  await probe(token, 'punchlist.list', 'GET', `/punchlist/?project_id=${projectId}`);
  await probe(token, 'fieldreports.list', 'GET', `/fieldreports/?project_id=${projectId}`);
  await probe(token, 'changeorders.list', 'GET', `/changeorders/?project_id=${projectId}`);
  await probe(token, 'safety.list', 'GET', `/safety/?project_id=${projectId}`);
  await probe(token, 'inspections.list', 'GET', `/inspections/?project_id=${projectId}`);
  await probe(token, 'submittals.list', 'GET', `/submittals/?project_id=${projectId}`);
  await probe(token, 'transmittals.list', 'GET', `/transmittals/?project_id=${projectId}`);
  await probe(token, 'correspondence.list', 'GET', `/correspondence/?project_id=${projectId}`);
  await probe(token, 'risk.list', 'GET', `/risk/?project_id=${projectId}`);
  await probe(token, 'ncr.list', 'GET', `/ncr/?project_id=${projectId}`);
  await probe(token, 'reports.list', 'GET', `/reports/?project_id=${projectId}`);
  await probe(token, 'tendering.list', 'GET', `/tendering/?project_id=${projectId}`);
  await probe(token, 'procurement.list', 'GET', `/procurement/?project_id=${projectId}`);
  await probe(token, 'finance.list', 'GET', `/finance/?project_id=${projectId}`);
  await probe(token, 'schedule.list', 'GET', `/schedule/?project_id=${projectId}`);
  await probe(token, 'contacts.list', 'GET', `/contacts/?project_id=${projectId}`);
  await probe(token, 'cde.list', 'GET', `/cde/?project_id=${projectId}`);
  await probe(token, 'markups.list', 'GET', `/markups/?project_id=${projectId}`);
  await probe(token, 'validation.list', 'GET', `/validation/?project_id=${projectId}`);
  await probe(token, 'compliance.list', 'GET', `/compliance/?project_id=${projectId}`);
  await probe(token, 'requirements.list', 'GET', `/requirements/?project_id=${projectId}`);
  await probe(token, 'bim.elements', 'GET', `/bim/elements?project_id=${projectId}&limit=5`);
  await probe(token, 'takeoff.documents', 'GET', `/takeoff/documents?project_id=${projectId}`);
  await probe(token, 'dwg.documents', 'GET', `/dwg-takeoff/documents?project_id=${projectId}`);
  await probe(token, 'project_intelligence.summary', 'GET', `/project-intelligence/summary?project_id=${projectId}`);
  await probe(token, 'modules.list', 'GET', '/admin/modules/');
  await probe(token, 'users.list', 'GET', '/users/');
  await probe(token, 'settings.config', 'GET', '/admin/config/');
  await probe(token, 'health', 'GET', '/system/health');
  await probe(token, 'version', 'GET', '/system/version');

  findings.endedAt = new Date().toISOString();
  fs.writeFileSync(path.join(SHOTS, 'findings.json'), JSON.stringify(findings, null, 2));

  const failures = findings.probes.filter((p) => !p.ok);
  console.log(`\n${findings.probes.length} probes, ${failures.length} failures`);
  for (const f of failures) {
    console.log(`  ${f.method} ${f.route} → ${f.status}\n    ${f.preview.replace(/\n/g, ' ')}`);
  }
})().catch((e) => {
  console.error('FATAL:', e);
  process.exit(1);
});
