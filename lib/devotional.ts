/* Daily devotional: a rotating set of passages keyed to the day of the year,
   so the "passage of the day" is stable for everyone on a given date. */

export const DEVOTIONAL_PASSAGES: string[] = [
  'Psalm 23',
  'John 3:16-17',
  'Romans 8:28-39',
  'Matthew 11:28-30',
  'Philippians 4:4-9',
  'Isaiah 40:28-31',
  'Psalm 46',
  '1 Corinthians 13:1-13',
  'Proverbs 3:5-6',
  'Lamentations 3:22-26',
  'Matthew 5:1-12',
  'Psalm 91',
  'John 14:1-7',
  'Galatians 5:22-26',
  'Hebrews 11:1-6',
  'Psalm 121',
  'James 1:2-8',
  'Ephesians 2:8-10',
  'Matthew 6:25-34',
  '2 Corinthians 4:16-18',
  'Psalm 139:1-18',
  'Colossians 3:12-17',
  'Joshua 1:9',
  '1 Peter 5:6-11',
  'Revelation 21:1-5',
  'Psalm 51:1-12',
  'Luke 15:11-32',
  'Romans 12:1-2',
  'Micah 6:8',
  'John 15:1-11',
  'Psalm 103',
];

function dayOfYear(date: Date): number {
  const start = Date.UTC(date.getUTCFullYear(), 0, 0);
  const current = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.floor((current - start) / 86_400_000);
}

export function getDailyPassage(date: Date = new Date()): string {
  return DEVOTIONAL_PASSAGES[dayOfYear(date) % DEVOTIONAL_PASSAGES.length];
}

export function todayKey(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function buildDevotionalPrompt(passage: string): string {
  return `Please share a short daily devotional centered on ${passage}. Read the passage with me, reflect on what it reveals about God's heart, and close with a brief prayer.`;
}
