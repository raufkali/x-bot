/**
 * Validation and Character Counting Utilities for Social Media Content
 *
 * NOTE: Data-Driven Analytical Posts.
 * Strict target length: 400–500 characters. Maximum limit: 500 chars.
 */

const X_CHAR_LIMIT = 500;

/**
 * Validates the user's topic
 * @param {string} topic 
 * @returns {{ valid: boolean, error?: string }}
 */
export function validateTopic(topic) {
  if (!topic || typeof topic !== 'string') {
    return { valid: false, error: 'Topic cannot be empty.' };
  }
  const trimmed = topic.trim();
  if (trimmed.length < 5) {
    return { valid: false, error: 'Topic is too short. Please provide at least 5 characters.' };
  }
  return { valid: true };
}

/**
 * Calculate standard string length and Twitter weighted length.
 * Twitter weighted length counts:
 * - Standard Latin & Arabic/Urdu scripts: 1 unit per code point.
 * - CJK and certain emojis: 2 units.
 * - URLs: Fixed length (typically 23 chars on X).
 * 
 * @param {string} text 
 * @returns {{ charCount: number, weightedCount: number, isOverLimit: boolean, remaining: number }}
 */
export function calculateXCharacterCount(text = '') {
  if (!text) {
    return { charCount: 0, weightedCount: 0, isOverLimit: false, remaining: X_CHAR_LIMIT };
  }

  // Normalization
  const normalized = text.normalize('NFC');
  const codePoints = Array.from(normalized);
  const charCount = codePoints.length;

  let weightedCount = 0;
  for (const char of codePoints) {
    const code = char.codePointAt(0);
    // CJK and certain wide ranges count as 2 in X (Twitter)
    if (
      (code >= 0x4E00 && code <= 0x9FFF) || // CJK Unified Ideographs
      (code >= 0x3400 && code <= 0x4DBF) || // CJK Extension A
      (code >= 0x20000 && code <= 0x2A6DF) || // CJK Extension B
      (code >= 0xF900 && code <= 0xFAFF) || // CJK Compatibility Ideographs
      (code >= 0x2F800 && code <= 0x2FA1F) ||
      (code >= 0xFF01 && code <= 0xFF60) || // Fullwidth Forms
      (code >= 0xFFE0 && code <= 0xFFE6)
    ) {
      weightedCount += 2;
    } else {
      weightedCount += 1;
    }
  }

  const isOverLimit = weightedCount > X_CHAR_LIMIT;
  const remaining = X_CHAR_LIMIT - weightedCount;

  return {
    charCount,
    weightedCount,
    isOverLimit,
    remaining
  };
}

/**
 * Validates post idea object structure
 * @param {object} idea 
 * @returns {boolean}
 */
export function validatePostIdea(idea) {
  if (!idea) return false;
  return Boolean(
    idea.english && idea.english.text &&
    idea.romanUrdu && idea.romanUrdu.text &&
    idea.plainUrdu && idea.plainUrdu.text
  );
}
