// The status words the Company view shows, one per state. The states are
// HQ's own (COLOUR in lib/hq/build.js, the same rules as Mission control),
// plus "planned" for a role that is not switched on yet. Every state has a
// word, an icon and a tone, because status is never shown by colour alone.
// Used by the page (app.js) and by the server (view.js); no DOM here.

export const STATUS = {
  working: { word: 'Working', icon: 'play', tone: 'green', meaning: 'Running now: its start heartbeat is under 60 minutes old.' },
  done: { word: 'Done', icon: 'check', tone: 'green', meaning: 'Its last run finished its work.' },
  idle: { word: 'Idle', icon: 'dash', tone: 'green', meaning: 'Its last run found nothing to do, or stopped for a PAUSE file that is gone now.' },
  'waiting on human': { word: 'Waiting on human', icon: 'hourglass', tone: 'yellow', meaning: 'It opened a pull request that no founder has reviewed yet.' },
  failed: { word: 'Failed', icon: 'cross', tone: 'red', meaning: 'Its last run broke.' },
  blocked: { word: 'Blocked', icon: 'slash', tone: 'red', meaning: 'A founder must act before it can go on.' },
  overdue: { word: 'Overdue', icon: 'clock', tone: 'red', meaning: 'A scheduled run is more than 90 minutes late, or a new pull request has no review yet.' },
  'stuck?': { word: 'Stuck?', icon: 'question', tone: 'red', meaning: 'It said it was working more than 60 minutes ago and has not finished.' },
  paused: { word: 'Paused', icon: 'pause', tone: 'grey', meaning: 'A PAUSE file on main stops it: PAUSE stops every role, PAUSE-<name> one role.' },
  off: { word: 'Off', icon: 'power', tone: 'grey', meaning: 'Switched off in agents/schedule.json.' },
  'no runs yet': { word: 'No runs yet', icon: 'ring', tone: 'grey', meaning: 'Switched on, but it has not run and no run is due yet.' },
  planned: { word: 'Planned', icon: 'calendar', tone: 'planned', meaning: 'Not switched on yet. It starts when its trigger arrives, shown under it.' },
};

export const KINDS = {
  agent: { word: 'AI agent' },
  product: { word: 'Product AI' },
  people: { word: 'People' },
};

export function statusOf(state) {
  return STATUS[state] || STATUS.off;
}
