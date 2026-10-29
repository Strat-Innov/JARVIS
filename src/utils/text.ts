/** Text helpers for display and spoken output. */

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

const trimNumber = (n: string) => n.replace(/,/g, '').replace(/\.0+$/, '').replace(/(\.\d*?)0+$/, '$1');

/**
 * Rewrites display text for speech synthesis:
 * "₱14.4M–₱19.1M" → "14.4 million to 19.1 million pesos", "1-BR" → "one-bedroom", "52 sqm" → "52 square metres".
 * Emails and URLs are dropped — they are shown on screen instead.
 */
export function toSpeakable(text: string): string {
  return (
    text
      // The name is pronounced at speak time (see pronounceName); normalise its spellings here.
      .replace(/\bA\.F\.A\.I\.K\.?/g, 'AFAIK')
      // FAI says "ten-oh-one", not "one thousand and one".
      .replace(/\b1001\b/g, 'ten-oh-one')
      .replace(/\s*[—–-]?\s*\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g, '')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/\b(\d)\s?-?\s?BR\b/gi, (_m, n: string) => `${numberToWords(Number(n))}-bedroom`)
      .replace(/(?:₱|PHP|Php)\s?([\d,]+(?:\.\d+)?)\s?M\b/g, (_m, n: string) => `${trimNumber(n)} million pesos`)
      .replace(/(?:₱|PHP|Php)\s?([\d,]+(?:\.\d+)?)\s?k\b/gi, (_m, n: string) => `${trimNumber(n)} thousand pesos`)
      .replace(/(?:₱|PHP|Php)\s?([\d,]+(?:\.\d+)?)/g, (_m, n: string) => `${trimNumber(n)} pesos`)
      .replace(/ pesos\s?[–—-]\s?(?=\d)/g, ' to ')
      .replace(/(\d)\s?[–—]\s?(\d)/g, '$1 to $2')
      .replace(/\s?\/\s?(?:sq\.?\s?m|sqm)\b/gi, ' per square metre')
      .replace(/\bsq\.?\s?m\b|\bsqm\b/gi, 'square metres')
      .replace(/\bmos\b\.?/gi, 'months')
      .replace(/\bRFO\b/g, 'ready for occupancy')
      .replace(/(\d+(?:\.\d+)?)\s?%/g, '$1 percent')
      .replace(/\s&\s/g, ' and ')
      .replace(/\s[—–-]\s/g, ', ')
      .replace(/[—–]/g, ', ')
      .replace(/\s+([,.;:])/g, '$1')
      .replace(/,\s*([.;:])/g, '$1')
      .replace(/([,;:])\1+/g, '$1')
      .replace(/\s{2,}/g, ' ')
      .trim()
  );
}

export type NameStyle = 'word' | 'phonetic' | 'letters';

const NAME_SPEECH: Record<NameStyle, string> = {
  /** /əˈfeɪk/ — rhymes with "a fake". */
  word: 'uh-fake',
  /** /æ fɑː ɪk/ — the letters' sounds blended: "Ah-fah-ick". */
  phonetic: 'Ah-fah-ick',
  letters: 'A. F. A. I. K.',
};

/** Says "AFAIK" in the chosen style. */
export function pronounceName(text: string, style: NameStyle): string {
  return text.replace(/\bAFAIK\b/g, NAME_SPEECH[style]);
}

/** Shortens text for speech at a sentence boundary near `maxChars`. */
export function truncateForSpeech(text: string, maxChars = 320): { text: string; truncated: boolean } {
  if (text.length <= maxChars) return { text, truncated: false };
  const slice = text.slice(0, maxChars);
  const cut = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('; '), slice.lastIndexOf('? '));
  const end = cut > maxChars * 0.4 ? cut + 1 : slice.lastIndexOf(' ');
  return { text: `${text.slice(0, end > 0 ? end : maxChars).trim()}`, truncated: true };
}

/** Joins list lines into speakable sentences: ["A", "B."] → "A. B." */
export function linesToSentences(lines: readonly string[]): string {
  return lines
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l) => (/[.!?:;]$/.test(l) ? l : `${l}.`))
    .join(' ');
}

/** Local wall-clock time, e.g. "9:40 PM". */
export function formatClockTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
