// The frame around every screen: the demo banner, the top bar with the "View as" menu,
// the navigation, the flash message and the footer.

import { esc, list } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate, weekdayName } from '../lib/dates.js';
import { LOGO_SVG, PRODUCT_NAME } from '../brand.js';
import { store, todos } from '../state.js';

export function banner() {
  return `<div class="demo-banner" role="note">${icon('triangle-alert')}<strong>Demo. Made-up claims. No real patient data.</strong></div>`;
}

const NAV = [
  ['home', 'Home', 'house'],
  ['send', 'Send denials', 'upload'],
  ['appeals', 'Appeals', 'list-checks'],
  ['requests', 'Needs you', 'clipboard-list'],
  ['money', 'Money', 'banknote'],
  ['reports', 'Reports', 'chart-column'],
  ['practice', 'Practice', 'building-2'],
];

export function topBar(route) {
  const active = (key) => route.view === key || (key === 'appeals' && route.view === 'appeal');
  const waiting = todos().length;
  const mark = LOGO_SVG
    ? `<span class="brand-logo">${LOGO_SVG}</span>`
    : `<span class="brand-name">${esc(store.brandName)}</span>`;
  const practices = Object.values(store.data.practices);
  const value = store.role === 'presenter' ? 'presenter' : `practice:${store.practice}`;
  return `<header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="#/home">${mark}<span class="brand-product">${esc(PRODUCT_NAME)}</span></a>
      <nav class="mainnav" aria-label="Main">
        <ul>${list(NAV, ([key, label, ic]) => `<li><a href="#/${key}"${active(key) ? ' aria-current="page"' : ''}>${icon(ic)}<span>${esc(label)}</span>${key === 'requests' && waiting ? `<span class="nav-count">${waiting}<span class="sr-only"> waiting</span></span>` : ''}</a></li>`)}</ul>
      </nav>
      <div class="role-menu">
        <label for="role-select">View as</label>
        <select id="role-select" data-change="role">
          ${list(practices, (p) => `<option value="practice:${esc(p.code)}"${value === `practice:${p.code}` ? ' selected' : ''}>${esc(`${p.you}, ${p.name}`)}</option>`)}
          <option value="presenter"${value === 'presenter' ? ' selected' : ''}>Presenter: guided tour</option>
        </select>
      </div>
    </div>
  </header>`;
}

export function flashHtml() {
  const f = store.ui.flash;
  return `<div class="flash-region" role="status" aria-live="polite">${f ? `<div class="flash flash-${esc(f.kind)}">${icon(f.kind === 'error' ? 'circle-alert' : f.kind === 'success' ? 'circle-check' : 'info')}<p>${esc(f.text)}</p><button type="button" class="btn btn-quiet btn-small" data-action="dismiss-flash">${icon('x')}<span>Dismiss</span></button></div>` : ''}</div>`;
}

export function footer() {
  const today = store.today;
  return `<footer class="footer">
    <div class="footer-inner">
      <p><strong>Demo date:</strong> ${esc(weekdayName(today))}, ${esc(fmtDate(today))}, fixed so the made-up deadlines stay the same.</p>
      <p><strong>Deadlines:</strong> Medicare appeal deadlines come from CMS pages opened on ${esc(fmtDate(store.data.meta.rules_opened))}, the same rules as the worker console demo. Private insurer rules are made up and labelled "sample payer rule".</p>
      <p><strong>Simulated:</strong> every "AI" result, file, signature and message here is simulated. No AI service, backend or login is used, and nothing leaves this page.</p>
      <p><strong>Fee:</strong> 20% of what the insurer pays on a win, and nothing on a loss, is our estimate. General information, not legal advice.</p>
      <div class="footer-save">
        <input type="checkbox" id="save-toggle" data-change="save"${store.save ? ' checked' : ''}>
        <label for="save-toggle">Save my progress in this browser (off by default)</label>
      </div>
    </div>
  </footer>`;
}
