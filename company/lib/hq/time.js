// Time helpers for HQ, used by the page and the functions. All schedules are
// Sydney time (agents/schedule.json), and HQ shows Sydney time.
//
// Sydney time is worked out with plain arithmetic, not with
// Intl.DateTimeFormat: the first Intl formatter costs about 16 ms of CPU,
// and Cloudflare's free plan allows 10 ms per request. hq/tests/ checks the
// arithmetic against the real time zone data for every half hour of 9 years.

import { SYDNEY, DAY_MS } from './config.js';

export const DAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HOUR = 60 * 60 * 1000;

function firstSunday(year, monthIndex) {
  const first = new Date(Date.UTC(year, monthIndex, 1)).getUTCDay();
  return Date.UTC(year, monthIndex, 1 + ((7 - first) % 7));
}

// New South Wales: standard time UTC+10; daylight saving time UTC+11 from
// 2:00 am standard time on the first Sunday of October to 3:00 am daylight
// time on the first Sunday of April (the rules since 2008).
export function sydneyOffsetMs(time) {
  const year = new Date(time + 10 * HOUR).getUTCFullYear();
  const ends = firstSunday(year, 3) + 3 * HOUR - 11 * HOUR;
  const starts = firstSunday(year, 9) + 2 * HOUR - 10 * HOUR;
  return time < ends || time >= starts ? 11 * HOUR : 10 * HOUR;
}

// Any other zone: the slow way, remembered per half hour.
const formatters = new Map();
const offsets = new Map();
export function intlOffsetMs(date, timeZone) {
  const block = Math.floor(date.getTime() / (HOUR / 2));
  const key = `${timeZone}|${block}`;
  if (offsets.has(key)) return offsets.get(key);
  if (!formatters.has(timeZone)) {
    formatters.set(timeZone, new Intl.DateTimeFormat('en-US', {
      timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }));
  }
  const probe = new Date(block * (HOUR / 2));
  const parts = {};
  for (const part of formatters.get(timeZone).formatToParts(probe)) parts[part.type] = part.value;
  const offset = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
    Number(parts.hour) % 24, Number(parts.minute), Number(parts.second)) - probe.getTime();
  if (offsets.size > 20000) offsets.clear();
  offsets.set(key, offset);
  return offset;
}

function offsetMs(date, timeZone) {
  if (timeZone === SYDNEY) return sydneyOffsetMs(date.getTime());
  return intlOffsetMs(date, timeZone);
}

function wall(date, timeZone) {
  const local = new Date(date.getTime() + offsetMs(date, timeZone));
  return {
    year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate(),
    hour: local.getUTCHours(), minute: local.getUTCMinutes(), second: local.getUTCSeconds(),
    weekdayIndex: local.getUTCDay(),
  };
}

export function toDate(value) {
  if (value instanceof Date) return value;
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function zonedParts(value, timeZone = SYDNEY) {
  const parts = wall(toDate(value), timeZone);
  return { ...parts, weekday: DAY_NAMES[(parts.weekdayIndex + 6) % 7] };
}

// A wall-clock time in a time zone, as a Date (works across daylight saving).
export function zonedToDate(year, month, day, hour, minute, timeZone = SYDNEY) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const first = offsetMs(new Date(guess), timeZone);
  let utc = guess - first;
  const second = offsetMs(new Date(utc), timeZone);
  if (second !== first) utc = guess - second;
  return new Date(utc);
}

export function runsOn(days, weekday) {
  if (days === undefined || days === null || days === 'daily') return true;
  if (days === 'weekdays') return DAY_NAMES.indexOf(weekday) < 5;
  if (Array.isArray(days)) return days.map((name) => String(name).toLowerCase().slice(0, 3)).includes(weekday);
  return false;
}

// Scheduled run times from start to end (Dates), as build.py's slots().
export function slots(schedule, start, end, timeZone = SYDNEY) {
  if (!schedule || !schedule.time || !/^\d{1,2}:\d{2}$/.test(String(schedule.time))) return [];
  const [hour, minute] = String(schedule.time).split(':').map(Number);
  const first = wall(new Date(start.getTime() - DAY_MS), timeZone);
  const last = wall(new Date(end.getTime() + DAY_MS), timeZone);
  let cursor = Date.UTC(first.year, first.month - 1, first.day);
  const stop = Date.UTC(last.year, last.month - 1, last.day);
  const found = [];
  while (cursor <= stop) {
    const day = new Date(cursor);
    const weekday = DAY_NAMES[(day.getUTCDay() + 6) % 7];
    if (runsOn(schedule.days ?? 'daily', weekday)) {
      const moment = zonedToDate(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), hour, minute, timeZone);
      if (moment >= start && moment <= end) found.push(moment);
    }
    cursor += DAY_MS;
  }
  return found;
}

export function nextRun(schedule, now) {
  return slots(schedule, now, new Date(now.getTime() + 8 * DAY_MS))[0] || null;
}

export function lastDueRun(schedule, now, graceMs) {
  const past = slots(schedule, new Date(now.getTime() - 8 * DAY_MS), new Date(now.getTime() - graceMs));
  return past.length ? past[past.length - 1] : null;
}

function clock(parts) {
  const hour = parts.hour % 12 || 12;
  return `${hour}:${String(parts.minute).padStart(2, '0')} ${parts.hour < 12 ? 'am' : 'pm'}`;
}

function dayText(parts, withYear) {
  return `${WEEKDAYS[parts.weekdayIndex]} ${parts.day} ${MONTHS[parts.month - 1]}${withYear ? ` ${parts.year}` : ''}`;
}

// "Thu 5 Nov, 10:00 am" in Sydney, or "Thu 5 Nov 2026, 10:00 am" with the year.
export function sydneyTime(value, { withYear = false } = {}) {
  const date = toDate(value);
  if (!date) return '';
  const sydney = wall(date, SYDNEY);
  return `${dayText(sydney, withYear)}, ${clock(sydney)}`;
}

// "Thu 5 Nov 2026" in Sydney.
export function sydneyDay(value) {
  const date = toDate(value);
  return date ? dayText(wall(date, SYDNEY), true) : '';
}

// "2026-11-05", the date in Sydney.
export function sydneyIsoDate(value) {
  const parts = wall(toDate(value) || new Date(), SYDNEY);
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`;
}

// "45 minutes", "5 hours", "3 days".
export function age(fromValue, now = new Date()) {
  const from = toDate(fromValue);
  if (!from) return '';
  const minutes = Math.max(0, Math.floor((now.getTime() - from.getTime()) / 60000));
  if (minutes < 60) return minutes === 1 ? '1 minute' : `${minutes} minutes`;
  const hours = Math.floor(minutes / 60);
  if (hours < 48) return hours === 1 ? '1 hour' : `${hours} hours`;
  return `${Math.floor(hours / 24)} days`;
}

export function hoursSince(value, now) {
  const date = toDate(value);
  return date ? Math.floor((now.getTime() - date.getTime()) / 3600000) : 0;
}
