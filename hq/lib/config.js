// Settings shared by the HQ page and the HQ functions. No secrets here:
// secrets live in Cloudflare (hq/SETUP.md). This file is public, like the
// rest of the repository.

export const DEFAULT_REPO = 'roulmediateam-byte/fifteen-expert-hq';
export const DEFAULT_BRANCH = 'main';
export const GITHUB_API = 'https://api.github.com';

export const PLAYBOOK_URL = 'https://claude.ai/artifact/XTtj6UgGR8K8z3Lc4JPVFW';
export const ROUTINES_URL = 'https://claude.ai/code/routines';
export const USAGE_URL = 'https://claude.ai/settings/usage';

export const SYDNEY = 'Australia/Sydney';
export const SINGAPORE = 'Asia/Singapore';

export const MAX_FIELD = 2000; // characters in any one form field
export const MAX_TITLE = 120; // characters in a GitHub Issue title made by HQ
export const STATUS_TTL_MS = 60 * 1000; // /api/status is cached for 60 seconds
export const FOLDERS_TTL_MS = 10 * 60 * 1000; // folder READMEs change rarely
export const GITHUB_BUDGET = 44; // Cloudflare's free plan allows 50 outside calls per request

export const AREAS = [
  'Company and strategy',
  'YC',
  'Brand and design',
  'Product and engineering',
  'Sales',
  'Legal and finance',
  'Ops',
  'Other projects',
];
export const STATUSES = ['active', 'draft', 'planned', 'archived'];

export const TRUSTED = new Set(['OWNER', 'MEMBER', 'COLLABORATOR']); // the only authors HQ believes
export const INFRA_LABELS = new Set(['status-board', 'mission-control']); // Issues that are not work
export const PRIORITIES = ['high', 'normal'];
export const PAUSE_ALL = 'PAUSE';
export const PAUSE_PREFIX = 'PAUSE-';

// Rules shared with ops/dashboard/build.py (Mission control). Keep them the same.
export const STUCK_AFTER_MS = 60 * 60 * 1000;
export const OVERDUE_AFTER_MS = 90 * 60 * 1000;
export const OLD_PULL_REQUEST_MS = 48 * 60 * 60 * 1000;
export const TIMELINE_MS = 3 * 24 * 60 * 60 * 1000;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export const DAY_MS = 24 * 60 * 60 * 1000;

// Run now: the scheduled task API trigger, from the Claude Code docs
// (https://code.claude.com/docs/en/routines.md, read 4 Nov 2026).
export const FIRE_BETA = 'experimental-cc-routine-2026-04-01';
export const FIRE_VERSION = '2023-06-01';
export const FIRE_URL_RE = /^https:\/\/api\.anthropic\.com\/v1\/claude_code\/routines\/trig_[A-Za-z0-9]+\/fire$/;

// A copy of agents/schedule.json, used only while that file is not on main
// yet. hq/tests/status.test.js fails if the two drift apart.
export const DEFAULT_SCHEDULE = {
  timezone: 'Australia/Sydney',
  founders: [
    { name: 'Adam', label: 'human:adam' },
    { name: 'Melvin', label: 'human:melvin' },
    { name: 'Marvin', label: 'human:marvin' },
  ],
  agents: [
    { name: 'chief-of-staff', label: 'agent:chief-of-staff', owner: 'Adam', brief: 'agents/chief-of-staff.md', status_issue: 4, enabled: true,
      schedule: { days: 'daily', time: '06:30' },
      allowed_folders: ['ops/digest/', 'ops/links.md', 'ops/decisions.md', 'yc/', 'brand/', 'design/', 'research/', 'sales/', 'finance/', 'legal/'], excluded_folders: [] },
    { name: 'design', label: 'agent:design', owner: 'Adam', brief: 'agents/design.md', status_issue: 5, enabled: true,
      schedule: { days: 'daily', time: '01:00' }, allowed_folders: ['site/', 'design/', 'brand/'], excluded_folders: ['site/demo/'] },
    { name: 'engineer', label: 'agent:engineer', owner: 'Marvin', brief: 'agents/engineer.md', status_issue: 6, enabled: true,
      schedule: { days: 'daily', time: '02:00' }, allowed_folders: ['prototype/', 'site/demo/'], excluded_folders: [] },
    { name: 'reviewer', label: 'agent:reviewer', owner: 'Marvin', brief: 'agents/reviewer.md', status_issue: 7, enabled: true,
      schedule: { days: 'daily', time: '05:00', on_pull_request: true }, allowed_folders: [], excluded_folders: [] },
    { name: 'research', label: 'agent:research', owner: 'Adam', brief: 'agents/research.md', status_issue: 8, enabled: true,
      schedule: { days: ['mon'], time: '03:00' }, allowed_folders: ['research/'], excluded_folders: [] },
    { name: 'sales', label: 'agent:sales', owner: 'Melvin', brief: 'agents/sales.md', status_issue: 9, enabled: false,
      enabled_note: 'off until phase 5', schedule: { days: 'weekdays', time: '04:00' }, allowed_folders: ['sales/'], excluded_folders: [] },
  ],
};

// Secret names for Run now: ROUTINE_<NAME>_URL and ROUTINE_<NAME>_TOKEN,
// where <NAME> is the agent name in capitals with _ for -, for example
// ROUTINE_CHIEF_OF_STAFF_URL.
export function routineSecretNames(agent) {
  const slug = String(agent).toUpperCase().replace(/[^A-Z0-9]+/g, '_');
  return { url: `ROUTINE_${slug}_URL`, token: `ROUTINE_${slug}_TOKEN` };
}

export const AGENT_NAME_RE = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function repoName(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/.test(text) ? text : DEFAULT_REPO;
}

export function branchName(value) {
  const text = String(value || '').trim();
  return /^[A-Za-z0-9._/-]+$/.test(text) ? text : DEFAULT_BRANCH;
}
