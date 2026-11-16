/**
 * Simple English Validation and Rules for X_BOT
 * Ensures generated social media posts use the simplest possible English:
 * short sentences, everyday vocabulary, and clear concepts suitable for a 12-year-old
 * or a village shopkeeper.
 */

export const SIMPLE_ENGLISH_RULES = `SIMPLE ENGLISH RULES (MANDATORY):
- Write like you are explaining to a 12-year-old friend or a village shopkeeper.
- Every sentence must be 6 to 14 words long. One clear idea per sentence.
- Use only common, daily words that everyone understands on the first read.
- NEVER use difficult or academic words such as:
  sovereign, fiscal, allocation, infrastructure, leverage, paradigm, geopolitical, centralized, monopoly, trajectory, indigenous, deterrence, contiguous, subsidy, structural, institutional, decentralized, utilize, substantial, facilitate, unilateral, bureaucracy, patronage, cartel, asymmetric, augment, bilateral, procurement.
- Use plain replacements instead:
  * "government money" instead of "fiscal allocation" or "sovereign funds"
  * "controls most of" instead of "monopoly"
  * "pays for" or "helps pay for" instead of "subsidizes"
  * "big" or "massive" instead of "substantial"
  * "use" instead of "utilize" or "leverage"
  * "canal system" instead of "contiguous gravity network"
  * "red tape" or "slow offices" instead of "bureaucracy"
- Include ONLY 1 or 2 numbers per post. Never pack many numbers together.
- Test: Would a village shopkeeper understand every single word on the first read? If not, rewrite it simply.
- Tone: Clear, honest, and easy to understand.

GOOD EXAMPLE:
Pakistan has one of the biggest canal systems in the world. It waters over 45 million acres of farmland. Pakistani farmers grow top quality rice at very low costs. But Pakistan can only store 30 days of river water. India stores 120 days of river water. Good soil helps, but crops cannot grow without stored water.

BAD EXAMPLE:
Pakistan holds superior contiguous gravity canal scale, but acute water deficits threaten agricultural sustainability. India spends billions subsidizing rice farmers while New Delhi exercises sovereign control. Does power lie in ballistic missile capability or basic human development?`;

const HARD_WORD_PATTERNS = [
  'sovereign\\w*',
  'fiscal\\w*',
  'allocat\\w*',
  'infrastructur\\w*',
  'leverage\\w*',
  'paradigm\\w*',
  'geopoliti\\w*',
  'centraliz\\w*',
  'monopol\\w*',
  'trajector\\w*',
  'indigenous\\w*',
  'deterren\\w*',
  'contiguous\\w*',
  'subsid\\w*',
  'structural\\w*',
  'institution\\w*',
  'decentraliz\\w*',
  'utiliz\\w*',
  'substantial\\w*',
  'facilitat\\w*',
  'unilateral\\w*',
  'bureaucra\\w*',
  'patronage\\w*',
  'cartel\\w*',
  'asymmetric\\w*',
  'augment\\w*',
  'bilateral\\w*',
  'procurement\\w*'
];

const HARD_WORDS_REGEX = new RegExp(`\\b(${HARD_WORD_PATTERNS.join('|')})\\b`, 'i');

/**
 * Checks whether the text adheres to the simplest English standards.
 * @param {string} text - The English post text to validate
 * @returns {string|null} - Null if simple enough, otherwise an error reason string
 */
export function checkSimpleEnglish(text) {
  if (!text || typeof text !== 'string') {
    return 'Empty or invalid text';
  }

  const cleanText = text.trim();
  if (!cleanText) {
    return 'Empty text';
  }

  // 1. Check for forbidden difficult words
  const hardMatch = cleanText.match(HARD_WORDS_REGEX);
  if (hardMatch) {
    return `Contains forbidden difficult word "${hardMatch[0]}". Use simpler everyday words.`;
  }

  // 2. Split into sentences (handling punctuation [.!?] followed by whitespace or newlines)
  const sentences = cleanText
    .split(/(?<=[.!?])(?:\s+|\n+)|(?:\r?\n)+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) {
    return 'No valid sentences found';
  }

  let totalWords = 0;
  for (const sentence of sentences) {
    const sentenceWords = sentence.split(/\s+/).filter(Boolean);
    const count = sentenceWords.length;
    totalWords += count;

    // Check individual sentence upper limit (max 22 words)
    if (count > 22) {
      return `Sentence exceeds 22 words (${count} words): "${sentence}"`;
    }
  }

  // Check average sentence length (max 14 words)
  const avgSentenceLength = totalWords / sentences.length;
  if (avgSentenceLength > 14) {
    return `Average sentence length is ${avgSentenceLength.toFixed(1)} words (must be 14 or less)`;
  }

  // 3. Check for long words (10+ letters, lowercase starting so proper nouns like Bangladesh are ignored)
  const allWords = cleanText.match(/\b[A-Za-z][A-Za-z0-9'-]*\b/g) || [];
  if (allWords.length > 0) {
    const longWords = allWords.filter(w => w.length >= 10 && /^[a-z]/.test(w));
    const longWordRatio = longWords.length / allWords.length;

    if (longWordRatio > 0.06) {
      return `Too many long words: ${(longWordRatio * 100).toFixed(1)}% of words have 10+ letters (max 6% allowed: ${longWords.slice(0, 5).join(', ')})`;
    }
  }

  return null;
}
