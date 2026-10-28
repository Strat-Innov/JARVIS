/** Time, number and designation helpers used for display and spoken output. */

const MINUTE_MS = 60_000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

const ONES = [
  'zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen',
  'seventeen', 'eighteen', 'nineteen',
];
const TENS = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

/** Converts an integer 0–999 into English words ("forty-three"). Larger values fall back to digits. */
export function numberToWords(value: number): string {
  const n = Math.trunc(value);
  if (n < 0 || n > 999) return String(n);
  if (n < 20) return ONES[n] ?? String(n);
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)] ?? '';
    const ones = n % 10;
    return ones === 0 ? tens : `${tens}-${ONES[ones]}`;
  }
  const hundreds = `${ONES[Math.floor(n / 100)]} hundred`;
  const rest = n % 100;
  return rest === 0 ? hundreds : `${hundreds} and ${numberToWords(rest)}`;
}

const WORD_VALUES: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40,
  fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Parses English number words below 100 ("forty three", "forty-three"). Returns null if not a number. */
export function wordsToNumber(text: string): number | null {
  const parts = text.trim().toLowerCase().split(/[\s-]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 2) return null;
  const values = parts.map((p) => WORD_VALUES[p]);
  if (values.some((v) => v === undefined)) return null;
  const [first, second] = values as number[];
  if (second === undefined) return first ?? null;
  if (first !== undefined && first >= 20 && first % 10 === 0 && second < 10) return first + second;
  return null;
}

const ROMAN: Record<string, number> = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };

/** Parses a Roman numeral ("XLIII" → 43). Returns null for invalid numerals. */
export function romanToNumber(text: string): number | null {
  const s = text.trim().toLowerCase();
  if (!/^[ivxlcdm]+$/.test(s)) return null;
  let total = 0;
  for (let i = 0; i < s.length; i += 1) {
    const current = ROMAN[s[i] as string] ?? 0;
    const next = ROMAN[s[i + 1] as string] ?? 0;
    total += current < next ? -current : current;
  }
  // Reject non-canonical numerals such as "IIII" or "VX".
  return numberToRoman(total) === s.toUpperCase() ? total : null;
}

export function numberToRoman(value: number): string {
  const table: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'],
    [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let n = Math.trunc(value);
  let out = '';
  for (const [v, sym] of table) {
    while (n >= v) {
      out += sym;
      n -= v;
    }
  }
  return out;
}

/** Parses a mark number written as digits, Roman numerals or words. */
export function parseMarkNumber(text: string): number | null {
  const s = text.trim();
  if (/^\d{1,3}$/.test(s)) return Number(s);
  return romanToNumber(s) ?? wordsToNumber(s);
}

/** Extracts the mark number from a designation such as "Mark XLIII", "MK-43" or "Mark 43". */
export function markNumberFromDesignation(designation: string): number | null {
  const match = /\b(?:mark|mk)[\s.-]*([a-z0-9]+)\b/i.exec(designation);
  return match?.[1] ? parseMarkNumber(match[1]) : null;
}

/**
 * Rewrites text for speech synthesis: "Mark XLIII" → "Mark forty-three", "72%" → "72 percent".
 * Display text keeps the canonical Roman numerals.
 */
export function toSpeakable(text: string): string {
  return text
    .replace(/\b(Mark|MK)[\s.-]*([IVXLCDM]+|\d{1,3})\b/g, (whole, _prefix: string, numeral: string) => {
      const n = parseMarkNumber(numeral);
      return n === null ? whole : `Mark ${numberToWords(n)}`;
    })
    .replace(/(\d+(?:\.\d+)?)\s?%/g, '$1 percent')
    .replace(/J\.A\.R\.V\.I\.S\./g, 'Jarvis');
}

/** Milliseconds until repair completion, or null when no completion time is configured or it is invalid. */
export function getRepairRemainingMs(completesAt: string | null, now: number): number | null {
  if (!completesAt) return null;
  const target = Date.parse(completesAt);
  if (Number.isNaN(target)) return null;
  return target - now;
}

export interface DurationParts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function splitDuration(ms: number): DurationParts {
  const total = Math.max(0, Math.floor(ms / 1000));
  return {
    days: Math.floor(total / 86_400),
    hours: Math.floor((total % 86_400) / 3600),
    minutes: Math.floor((total % 3600) / 60),
    seconds: total % 60,
  };
}

/** "02:40:00", or "1d 02:40:00" when longer than a day. */
export function formatCountdown(ms: number): string {
  const { days, hours, minutes, seconds } = splitDuration(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  const clock = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  return days > 0 ? `${days}d ${clock}` : clock;
}

function unit(n: number, word: string): string {
  return `${numberToWords(n)} ${word}${n === 1 ? '' : 's'}`;
}

/**
 * Natural-language duration for speech, rounded up to the next whole minute
 * so a freshly configured "2h 40m" reads as "two hours and forty minutes".
 */
export function formatDurationSpoken(ms: number): string {
  if (ms <= 0) return 'no time at all';
  if (ms < MINUTE_MS) return 'less than a minute';
  const totalMinutes = Math.ceil(ms / MINUTE_MS);
  const days = Math.floor(totalMinutes / (DAY_MS / MINUTE_MS));
  const hours = Math.floor((totalMinutes % (DAY_MS / MINUTE_MS)) / 60);
  const minutes = totalMinutes % 60;
  const parts: string[] = [];
  if (days > 0) parts.push(unit(days, 'day'));
  if (hours > 0) parts.push(unit(hours, 'hour'));
  if (minutes > 0) parts.push(unit(minutes, 'minute'));
  if (parts.length === 1) return parts[0] as string;
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}

/** Local wall-clock time, e.g. "9:40 PM". */
export function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** Converts an ISO timestamp to the value format of <input type="datetime-local">. */
export function isoToLocalInput(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** Converts a datetime-local input value to ISO, or null when empty/invalid. */
export function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export const durations = { MINUTE_MS, HOUR_MS, DAY_MS };
