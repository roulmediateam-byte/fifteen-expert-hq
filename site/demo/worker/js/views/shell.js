// The frame around every screen: the demo banner, the top bar with the role menu,
// the navigation, the presenter panel and the footer.

import { esc, when, list } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { fmtDate, weekdayName } from '../lib/dates.js';
import { LOGO_SVG, PRODUCT_NAME } from '../brand.js';
import { store } from '../state.js';

export function banner() {
  return `<div class="demo-banner" role="note">${icon('triangle-alert')}<strong>Demo. Made-up claims. No real patient data.</strong></div>`;
}

function navItems() {
  const worker = [['#/today', 'Today', 'house'], ['#/submit', 'Submit and track', 'send'], ['#/progress', 'My progress', 'chart-line'], ['#/audit', 'Audit log', 'history']];
  const reviewer = [['#/review', 'Review', 'clipboard-check'], ['#/audit', 'Audit log', 'history']];
  if (store.role === 'reviewer') return reviewer;
  if (store.role === 'presenter') return [['#/today', 'Today', 'house'], ['#/review', 'Review', 'clipboard-check'], ['#/submit', 'Submit and track', 'send'], ['#/progress', 'My progress', 'chart-line'], ['#/audit', 'Audit log', 'history']];
  return worker;
}

export function topBar(route, brandName) {
  const active = (href) => {
    const view = href.slice(2);
    return route.view === view || (view === 'today' && route.view === 'claim') || (view === 'review' && route.view === 'review');
  };
  const mark = LOGO_SVG
    ? `<span class="brand-logo">${LOGO_SVG}</span>`
    : `<span class="brand-name">${esc(brandName)}</span>`;
  return `<header class="topbar">
    <div class="topbar-inner">
      <a class="brand" href="#/${store.role === 'reviewer' ? 'review' : 'today'}">${mark}<span class="brand-product">${esc(PRODUCT_NAME)}</span></a>
      <nav class="mainnav" aria-label="Main">
        <ul>${list(navItems(), ([href, label, ic]) => `<li><a href="${href}"${active(href) ? ' aria-current="page"' : ''}>${icon(ic)}<span>${esc(label)}</span></a></li>`)}</ul>
      </nav>
      <div class="role-menu">
        <label for="role-select">View as</label>
        <select id="role-select" data-change="role">
          <option value="worker"${store.role === 'worker' ? ' selected' : ''}>Worker: Jordan (trained claims worker, demo)</option>
          <option value="reviewer"${store.role === 'reviewer' ? ' selected' : ''}>Reviewer: Melvin (Head of Claims Operations)</option>
          <option value="presenter"${store.role === 'presenter' ? ' selected' : ''}>Presenter: guided tour</option>
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
  const today = store.ctx.today;
  return `<footer class="footer">
    <div class="footer-inner">
      <p><strong>Demo date:</strong> ${esc(weekdayName(today))}, ${esc(fmtDate(today))}, fixed so the made-up deadlines stay the same.</p>
      <p><strong>Rules:</strong> Medicare appeal levels and deadlines from CMS pages, and denial codes from the X12 lists, opened on Nov 5, 2026 (rules/appeal_rules.json). Private payer rules are made up and labelled "sample payer rule".</p>
      <p><strong>Simulated AI:</strong> every "AI" result here is template text or a fixed rule. No AI service, backend or login is used.</p>
      <div class="footer-save">
        <input type="checkbox" id="save-toggle" data-change="save"${store.save ? ' checked' : ''}>
        <label for="save-toggle">Save my progress in this browser (off by default)</label>
      </div>
    </div>
  </footer>`;
}
