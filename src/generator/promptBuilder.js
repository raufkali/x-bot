/**
 * Prompt Builder for Grok Chat
 * Generates tailored system and user prompts adhering to X_BOT multilingual specifications.
 */

import { SIMPLE_ENGLISH_RULES } from '../utils/simpleEnglish.js';

/**
 * Builds the primary multilingual post generation prompt.
 *
 * @param {object} params
 * @param {string} params.topic
 * @param {string} [params.additionalInstructions]
 * @param {string} [params.tone]
 * @param {string} [params.audience]
 * @param {number} [params.numberOfPosts=1]
 * @returns {string} The formatted prompt to send to Grok
 */
export function buildGenerationPrompt({
  topic,
  additionalInstructions = '',
  tone = 'Informative',
  audience = 'General Public',
  numberOfPosts = 1
}) {
  const count = Number(numberOfPosts) || 1;
  const postWord = count === 1 ? '1 DISTINCT post idea' : `${count} DISTINCT post ideas`;

  let prompt = `${SIMPLE_ENGLISH_RULES}

You are an expert multilingual social media content writer and editor for X (formerly Twitter).

Your task is to convert the provided topic into engaging, informative, and natural posts written in the simplest everyday English.

Generate exactly ${postWord}. Each idea must communicate a distinct angle or point rather than repeating the same content with slightly different words.

For EVERY post idea, generate exactly three language versions communicating the same core message:

LANGUAGE 1 — ENGLISH
- Use very simple A1-A2 English like regular people talk and write every day.
- Use only common, daily words. Never use complicated, fancy, or academic words.
- Keep sentences short, natural, and direct.
- Present one simple thought at a time so anyone understands on the first read.
- Include only 1 or 2 numbers per post.

LANGUAGE 2 — ROMAN URDU
- Write Urdu using English alphabets.
- Use natural Pakistani conversational Urdu (familiar everyday expressions).
- Do not translate English word by word.
- Keep the language simple, natural, and readable.
- Avoid unnatural combinations of English and Urdu.

LANGUAGE 3 — PLAIN URDU
- Write proper Urdu script (اردو).
- Use natural, grammatically correct Pakistani Urdu.
- Avoid unnecessary English words when appropriate Urdu alternatives exist.
- Maintain the original message and meaning.

CONTENT RULES:
1. All three versions of an idea must communicate the same central idea.
2. Make each opening interesting and clear.
3. Keep sentences short and readable (strictly 6 to 14 words per sentence).
4. Avoid robotic or repetitive expressions.
5. Avoid generic AI-style introductions (e.g. "In this fast-paced world...", "Buckle up...", "Dive in...").
6. Do not invent facts, statistics, sources, or quotations. Use only well-known, verified numbers.
7. Never present speculation as established fact.
8. Do not force a political or controversial angle.
9. ZERO emojis. Do not use any emojis.
10. ZERO hashtags. Do not use any hashtags. Always output "Hashtags: NONE".
11. STRICT LENGTH REQUIREMENT: 400 to 600 characters, never above 600.
12. Preserve the original topic and intention.

INPUT DETAILS:
- TOPIC / IDEA:
${topic.trim()}

- TONE: ${tone}
- TARGET AUDIENCE: ${audience}
${additionalInstructions.trim() ? `- ADDITIONAL INSTRUCTIONS:\n${additionalInstructions.trim()}\n` : ''}

OUTPUT FORMAT:
Return the results in the following strict, clearly separated structure without conversational fluff or introductory chatter:
`;

  for (let i = 1; i <= count; i++) {
    const padded = String(i).padStart(2, '0');
    prompt += `
POST ${padded}

ENGLISH:
Post text: [Insert English post text here: 400-600 characters, sentences of 6-14 words, everyday words]
Hashtags: NONE

ROMAN URDU:
Post text: [Insert Roman Urdu post text here: 400-600 characters]
Hashtags: NONE

PLAIN URDU:
Post text: [Insert Plain Urdu script post text here: 400-600 characters]
Hashtags: NONE
`;
  }

  prompt += `\nReturn only the requested content following the exact format above.`;

  return prompt;
}

/**
 * Builds a prompt to regenerate an individual language version of a post.
 *
 * @param {object} params
 * @param {string} params.originalTopic
 * @param {string} params.language - 'English' | 'Roman Urdu' | 'Plain Urdu'
 * @param {number} params.postNumber
 * @param {object} params.currentIdea - The current 3-language version object
 * @param {string} [params.feedback] - User feedback (e.g., "Make it shorter and use simpler words")
 * @param {string} [params.tone]
 * @param {string} [params.audience]
 * @returns {string}
 */
export function buildSingleLanguageRegenPrompt({
  originalTopic,
  language,
  postNumber = 1,
  currentIdea,
  feedback = '',
  tone = 'Informative',
  audience = 'General Public'
}) {
  const padded = String(postNumber).padStart(2, '0');

  let prompt = `${SIMPLE_ENGLISH_RULES}

You are an expert multilingual social media content strategist for X (Twitter).

We have an existing post idea derived from this topic:
"${originalTopic}"

Tone: ${tone}
Audience: ${audience}

Here is the current post idea:
POST ${padded}
English: ${currentIdea?.english?.text || 'N/A'}
Roman Urdu: ${currentIdea?.romanUrdu?.text || 'N/A'}
Plain Urdu: ${currentIdea?.plainUrdu?.text || 'N/A'}

YOUR TASK:
Regenerate ONLY the ${language.toUpperCase()} version for this post.
Keep the same core message as the other language versions so they remain aligned.

${feedback.trim() ? `USER FEEDBACK / IMPROVEMENT REQUEST:\n"${feedback.trim()}"\n` : ''}

RULES FOR ${language.toUpperCase()}:
${
  language.toLowerCase().includes('roman')
    ? `- Write Urdu using English alphabets in natural Pakistani conversational phrasing.\n- Do not translate word-by-word.\n- Keep vocabulary easy, engaging, and readable.`
    : language.toLowerCase().includes('plain') || language.toLowerCase().includes('urdu')
    ? `- Write proper Urdu script (اردو).\n- Use grammatically correct, natural Pakistani Urdu.\n- Maintain high readability and avoid unnecessary English words.`
    : `- Use simple everyday A1-A2 English like regular writing.\n- Short sentences, everyday words, no complicated words.\n- 1 or 2 numbers only.`
}
- ZERO hashtags. Always output "Hashtags: NONE".
- ZERO emojis.
- STRICT LENGTH REQUIREMENT: 400 to 600 characters, never above 600.

OUTPUT FORMAT:
Return strictly the following format:

${language.toUpperCase()}:
Post text: [New regenerated post text: 400-600 characters]
Hashtags: NONE
`;

  return prompt;
}

/**
 * Builds a prompt to regenerate all language versions of an existing post idea with feedback.
 *
 * @param {object} params
 * @param {string} params.originalTopic
 * @param {number} params.postNumber
 * @param {object} [params.currentIdea]
 * @param {string} [params.feedback]
 * @param {string} [params.tone]
 * @param {string} [params.audience]
 * @returns {string}
 */
export function buildAllLanguagesRegenPrompt({
  originalTopic,
  postNumber = 1,
  currentIdea,
  feedback = '',
  tone = 'Informative',
  audience = 'General Public'
}) {
  const padded = String(postNumber).padStart(2, '0');

  let prompt = `${SIMPLE_ENGLISH_RULES}

You are an expert multilingual social media content strategist for X (Twitter).

Regenerate all three language versions for POST ${padded} based on the topic:
"${originalTopic}"

Tone: ${tone}
Audience: ${audience}
${feedback.trim() ? `USER FEEDBACK / IMPROVEMENT REQUEST:\n"${feedback.trim()}"\n` : ''}

Generate fresh versions in:
1. ENGLISH (Simple everyday A1-A2 English, short sentences, no complicated words, 1 or 2 numbers only)
2. ROMAN URDU (Conversational Pakistani Urdu in English alphabets)
3. PLAIN URDU (Proper Urdu script, natural Pakistani phrasing)

All three versions must communicate the same central idea.
ZERO hashtags. Always output "Hashtags: NONE".
ZERO emojis.
STRICT LENGTH REQUIREMENT: 400 to 600 characters, never above 600.

OUTPUT FORMAT:
POST ${padded}

ENGLISH:
Post text: [New English post: 400-600 characters]
Hashtags: NONE

ROMAN URDU:
Post text: [New Roman Urdu post: 400-600 characters]
Hashtags: NONE

PLAIN URDU:
Post text: [New Plain Urdu post: 400-600 characters]
Hashtags: NONE
`;

  return prompt;
}
