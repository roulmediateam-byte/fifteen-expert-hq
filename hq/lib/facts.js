// What a write needs to know before it changes anything: the agents and
// founders (agents/schedule.json on main, or HQ's own copy) and whether the
// repository is private. Taken from the cached status when there is one.

import { cacheGet } from './cache.js';
import { DEFAULT_SCHEDULE, STATUS_TTL_MS, AGENT_NAME_RE } from './config.js';

export async function repoFacts(github) {
  const cached = cacheGet('status', STATUS_TTL_MS * 5);
  if (cached) {
    return {
      private: Boolean(cached.repo && cached.repo.private),
      agents: cached.agents.map((agent) => agent.name),
      enabled: Object.fromEntries(cached.agents.map((agent) => [agent.name, agent.enabled])),
      founders: cached.founders,
    };
  }
  const repo = await github.get('');
  let schedule = null;
  try {
    const text = await github.file('agents/schedule.json');
    schedule = text ? JSON.parse(text) : null;
  } catch {
    schedule = null;
  }
  if (!schedule || !Array.isArray(schedule.agents) || !schedule.agents.length) schedule = DEFAULT_SCHEDULE;
  schedule = { ...schedule, agents: schedule.agents.filter((agent) => agent && AGENT_NAME_RE.test(String(agent.name))) };
  const founders = (schedule.founders && schedule.founders.length ? schedule.founders : DEFAULT_SCHEDULE.founders).map((founder) => founder.name);
  return {
    private: Boolean(repo && repo.private),
    agents: schedule.agents.map((agent) => agent.name),
    enabled: Object.fromEntries(schedule.agents.map((agent) => [agent.name, agent.enabled !== false])),
    founders,
  };
}
