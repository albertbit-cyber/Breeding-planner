/** Display helpers shared by the breeding card components. Dates follow the app's dd/mm/yyyy. */
import { toYmd } from '../domain/dates';

export const DASH = '—';

export function formatDate(value) {
  const ymd = toYmd(value);
  if (!ymd) return '';
  const [y, m, d] = ymd.split('-');
  return `${d}/${m}/${y}`;
}

export function formatDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatMm(value, { estimate = false } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return DASH;
  const text = `${Math.round(Number(value) * 10) / 10} mm`;
  return estimate ? `~${text}` : text;
}

export function formatDays(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return DASH;
  return `${value} d`;
}

export function animalLabel(snake, fallbackId) {
  if (!snake) return fallbackId || DASH;
  const name = String(snake.name || '').trim();
  return name ? (snake.id ? `${name} (${snake.id})` : name) : (snake.id || fallbackId || DASH);
}

export function animalName(snake, fallbackId) {
  if (!snake) return fallbackId || DASH;
  return String(snake.name || '').trim() || snake.id || fallbackId || DASH;
}

/** Visual token classes per certainty. Always paired with a text label; never colour alone. */
export const CERTAINTY_CLASS = {
  recorded: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  suspected: 'bg-amber-50 text-amber-800 border-amber-200 border-dashed',
  estimated: 'bg-sky-50 text-sky-800 border-sky-200 border-dashed',
  planned: 'bg-neutral-50 text-neutral-600 border-neutral-300 border-dashed',
};

export const STATUS_CLASS = {
  active: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  paused: 'bg-amber-50 text-amber-800 border-amber-200',
  closed: 'bg-neutral-100 text-neutral-700 border-neutral-300',
};
