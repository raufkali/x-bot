/**
 * Prompt Builder for Grok Chat
 * Generates tailored system and user prompts adhering to X_BOT multilingual specifications.
 */

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

  let prompt = `You are an expert multilingual social media content strategist, multilingual writer, and content editor.

Your task is to convert the provided topic into engaging, informative, and natural posts suitable for X (formerly Twitter).

Generate exactly ${postWord}. Each idea must communicate a distinct angle or point rather than repeating the same content with slightly different words.

For EVERY post idea, generate exactly three language versions communicating the same core message:

LANGUAGE 1 — ENGLISH
- Prioritize natural storytelling, simple A2 English, readability, and logical flow.
- Use simple, everyday, direct human words (never use complex vocabulary or academic jargon).
- Prefer short, powerful sentences that connect naturally (max 10-15 words per sentence).
- Present one central idea and develop it clearly so anyone understands on the first read.
- Avoid forced technical terms (e.g. avoid "3-nanometer silicon", "mathematically obsolete", "semiconductor shield").
- Readability > Natural Flow > Clear Meaning > Strong Insight > Vocabulary Complexity.

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
2. Make each opening interesting and captivating.
3. Keep sentences short and readable.
4. Avoid robotic or repetitive expressions.
5. Avoid generic AI-style introductions (e.g. "In this fast-paced world...", "Buckle up...", "Dive in...").
6. Do not invent facts, statistics, sources, or quotations.
7. Never present speculation as established fact.
8. Do not force a political or controversial angle.
9. Avoid unnecessary emojis (use sparingly or none).
10. Include 2–4 relevant hashtags for each version.
11. Keep the writing concise and suitable for X (within 280 characters).
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
Post text: [Insert English post text here]
Hashtags: [Insert 2-4 hashtags here, e.g. #AI #Future]

ROMAN URDU:
Post text: [Insert Roman Urdu post text here]
Hashtags: [Insert 2-4 hashtags here]

PLAIN URDU:
Post text: [Insert Plain Urdu script post text here]
Hashtags: [Insert 2-4 hashtags here]
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

  let prompt = `You are an expert multilingual social media content strategist for X (Twitter).

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
    : `- Use simple, natural English.\n- Strong hook, short sentences, human voice, no AI clichés.`
}
- Include 2–4 relevant hashtags.
- Keep within 280 characters.

OUTPUT FORMAT:
Return strictly the following format:

${language.toUpperCase()}:
Post text: [New regenerated post text]
Hashtags: [2-4 hashtags]
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

  let prompt = `You are an expert multilingual social media content strategist for X (Twitter).

Regenerate all three language versions for POST ${padded} based on the topic:
"${originalTopic}"

Tone: ${tone}
Audience: ${audience}
${feedback.trim() ? `USER FEEDBACK / IMPROVEMENT REQUEST:\n"${feedback.trim()}"\n` : ''}

Generate fresh versions in:
1. ENGLISH (Simple, natural, engaging hook)
2. ROMAN URDU (Conversational Pakistani Urdu in English alphabets)
3. PLAIN URDU (Proper Urdu script, natural Pakistani phrasing)

All three versions must communicate the same central idea.
Include 2-4 hashtags for each.
Keep under 280 characters per post.

OUTPUT FORMAT:
POST ${padded}

ENGLISH:
Post text: [New English post]
Hashtags: [2-4 hashtags]

ROMAN URDU:
Post text: [New Roman Urdu post]
Hashtags: [2-4 hashtags]

PLAIN URDU:
Post text: [New Plain Urdu post]
Hashtags: [2-4 hashtags]
`;

  return prompt;
}
