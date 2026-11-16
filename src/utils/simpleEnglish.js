/**
 * Simple English Rules for X_BOT
 * Enforces simple A1-A2 English: everyday conversational vocabulary,
 * short sentences, and clear concepts with zero complicated words.
 */

export const SIMPLE_ENGLISH_RULES = `SIMPLE ENGLISH RULES (MANDATORY):
- Write in simple everyday A1-A2 English, just like chatting with a friend.
- Use only common, daily words. Never use complicated, fancy, or academic words.
- Keep sentences short, natural, and direct. One simple thought per sentence.
- Sound human and casual, like how regular people write in daily messages.
- Include only 1 or 2 simple numbers so it is easy to read.
- If a 10-year-old child would not know a word, use a simpler word.

EXAMPLE TONE:
Pakistan and India spend billions of dollars on military jets. But many village clinics still lack basic medicine. Children need clean water, good food, and local schools. When countries spend on weapons first, regular working families suffer. Can a country truly be strong if its people are hungry?`;

/**
 * Validates simple English.
 * Rejection criteria removed per user request: we do not block or reject on mechanical word counts.
 * Returns null so generation flows smoothly without rejections.
 * @param {string} text - The English post text
 * @returns {null} - Always returns null (no rejection)
 */
export function checkSimpleEnglish(text) {
  // Rejection criteria removed: use simple A1-A2 English via prompt guidance without hard rejection blocks.
  return null;
}
