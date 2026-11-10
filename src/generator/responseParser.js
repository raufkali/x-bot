/**
 * Response Parser for Grok Chat outputs
 * Handles variations in AI formatting, extracts English, Roman Urdu, Plain Urdu, hashtags,
 * and performs character count calculation.
 */

import { calculateXCharacterCount } from '../utils/validation.js';

/**
 * Clean up markdown markers or extra quotes
 * @param {string} str 
 * @returns {string}
 */
function cleanText(str = '') {
  return str
    .replace(/^\s*["'`]+|["'`]+\s*$/g, '')
    .replace(/^Post text:\s*/i, '')
    .trim();
}

/**
 * Extracts hashtags from a section or text
 * @param {string} text 
 * @param {string} explicitHashtagsLine 
 * @returns {{ cleanBody: string, hashtags: string }}
 */
function extractHashtagsAndBody(text = '', explicitHashtagsLine = '') {
  let hashtags = explicitHashtagsLine ? explicitHashtagsLine.replace(/^Hashtags:\s*/i, '').trim() : '';
  let body = text.trim();

  // If explicit hashtags line exists
  if (hashtags) {
    // If body still ends with hashtags line, remove it
    body = body.replace(/Hashtags:\s*.*$/is, '').trim();
  } else {
    // Check if the body ends with hashtags (#tag1 #tag2)
    const hashtagMatch = body.match(/((?:#[\p{L}\p{N}_]+\s*)+)$/u);
    if (hashtagMatch) {
      hashtags = hashtagMatch[1].trim();
      body = body.substring(0, hashtagMatch.index).trim();
    }
  }

  // Ensure hashtags string is formatted nicely
  if (hashtags && !hashtags.startsWith('#')) {
    hashtags = hashtags
      .split(/\s+/)
      .map(tag => (tag.startsWith('#') ? tag : `#${tag}`))
      .join(' ');
  }

  return { cleanBody: cleanText(body), hashtags };
}

/**
 * Parses a single language block
 * @param {string} blockText 
 * @returns {{ text: string, hashtags: string, fullPost: string, charCount: number, weightedCount: number, isOverLimit: boolean }}
 */
export function parseLanguageSection(blockText = '') {
  const lines = blockText.split('\n').map(l => l.trim()).filter(Boolean);
  let explicitHashtags = '';
  const bodyLines = [];

  for (const line of lines) {
    if (/^hashtags:\s*/i.test(line)) {
      explicitHashtags = line;
    } else if (/^character count:\s*/i.test(line)) {
      // Ignore AI's self-reported count since we calculate real accurate X counts
      continue;
    } else {
      bodyLines.push(line);
    }
  }

  const rawBody = bodyLines.join('\n');
  const { cleanBody, hashtags } = extractHashtagsAndBody(rawBody, explicitHashtags);

  const fullPost = hashtags ? `${cleanBody}\n\n${hashtags}` : cleanBody;
  const counts = calculateXCharacterCount(fullPost);

  return {
    text: cleanBody,
    hashtags,
    fullPost,
    charCount: counts.charCount,
    weightedCount: counts.weightedCount,
    isOverLimit: counts.isOverLimit
  };
}

/**
 * Splits raw Grok text into individual post idea blocks
 * @param {string} rawText 
 * @param {number} expectedCount 
 * @returns {Array<{ postNumber: number, rawBlock: string }>}
 */
function splitIntoPostBlocks(rawText = '', expectedCount = 1) {
  // Try matching headers like "POST 01", "POST 1", "POST IDEA 1", "IDEA 1"
  const postHeaderRegex = /(?:^|\n)(?:===+\s*)?(?:POST|IDEA|POST IDEA)\s*#?\s*(\d+)[:\s—\-]*/gi;

  const matches = [...rawText.matchAll(postHeaderRegex)];

  if (matches.length > 0) {
    const blocks = [];
    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const postNumber = parseInt(currentMatch[1], 10);
      const startIndex = currentMatch.index + currentMatch[0].length;
      const endIndex = i + 1 < matches.length ? matches[i + 1].index : rawText.length;
      const rawBlock = rawText.slice(startIndex, endIndex).trim();

      blocks.push({
        postNumber: isNaN(postNumber) ? i + 1 : postNumber,
        rawBlock
      });
    }
    return blocks;
  }

  // If no "POST \d" header was matched, treat the whole response as single post (Post 1)
  return [
    {
      postNumber: 1,
      rawBlock: rawText.trim()
    }
  ];
}

/**
 * Parses full Grok response into structured post ideas
 * @param {string} rawText 
 * @param {number} [expectedCount=1] 
 * @returns {{ success: boolean, ideas: Array<object>, errors: string[] }}
 */
export function parseGrokResponse(rawText = '', expectedCount = 1) {
  if (!rawText || typeof rawText !== 'string' || !rawText.trim()) {
    return {
      success: false,
      ideas: [],
      errors: ['Empty response received from Grok Chat.']
    };
  }

  const postBlocks = splitIntoPostBlocks(rawText, expectedCount);
  const ideas = [];
  const errors = [];

  for (const block of postBlocks) {
    const text = block.rawBlock;

    // Regex to locate the three sections
    // Section headers:
    // ENGLISH: / [1] ENGLISH / LANGUAGE 1 — ENGLISH / POST 1 — ENGLISH
    // ROMAN URDU: / [2] ROMAN URDU / LANGUAGE 2 — ROMAN URDU / POST 1 — ROMAN URDU
    // PLAIN URDU: / [3] PLAIN URDU / URDU: / LANGUAGE 3 — PLAIN URDU
    const englishIndex = text.search(/(?:^|\n)(?:\[1\]\s*)?(?:LANGUAGE\s*1\s*[:\—\-]\s*)?(?:POST\s*\d+\s*[:\—\-]\s*)?ENGLISH\s*[:\—\-]/i);
    const romanUrduIndex = text.search(/(?:^|\n)(?:\[2\]\s*)?(?:LANGUAGE\s*2\s*[:\—\-]\s*)?(?:POST\s*\d+\s*[:\—\-]\s*)?ROMAN\s*URDU\s*[:\—\-]/i);
    const plainUrduIndex = text.search(/(?:^|\n)(?:\[3\]\s*)?(?:LANGUAGE\s*3\s*[:\—\-]\s*)?(?:POST\s*\d+\s*[:\—\-]\s*)?(?:PLAIN\s*URDU|URDU)\s*[:\—\-]/i);

    let englishRaw = '';
    let romanUrduRaw = '';
    let plainUrduRaw = '';

    if (englishIndex !== -1 && romanUrduIndex !== -1 && plainUrduIndex !== -1) {
      // Find order of appearances
      const indices = [
        { type: 'english', index: englishIndex },
        { type: 'romanUrdu', index: romanUrduIndex },
        { type: 'plainUrdu', index: plainUrduIndex }
      ].sort((a, b) => a.index - b.index);

      for (let j = 0; j < indices.length; j++) {
        const cur = indices[j];
        const next = indices[j + 1];
        const sectionChunk = next
          ? text.slice(cur.index, next.index)
          : text.slice(cur.index);

        // Strip the header itself
        const cleanedChunk = sectionChunk.replace(
          /^(?:\[?\d+\]?\s*)?(?:LANGUAGE\s*\d+\s*[:\—\-]\s*)?(?:POST\s*\d+\s*[:\—\-]\s*)?(?:ENGLISH|ROMAN\s*URDU|PLAIN\s*URDU|URDU)\s*[:\—\-]?\s*/i,
          ''
        ).trim();

        if (cur.type === 'english') englishRaw = cleanedChunk;
        else if (cur.type === 'romanUrdu') romanUrduRaw = cleanedChunk;
        else if (cur.type === 'plainUrdu') plainUrduRaw = cleanedChunk;
      }
    } else {
      // Fallback heuristics: check if Urdu script is present
      const urduScriptRegex = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
      const lines = text.split('\n');
      const urduLines = [];
      const nonUrduLines = [];

      for (const line of lines) {
        if (urduScriptRegex.test(line)) {
          urduLines.push(line);
        } else {
          nonUrduLines.push(line);
        }
      }

      if (urduLines.length > 0) {
        plainUrduRaw = urduLines.join('\n');
      }

      // If we couldn't match strict headers, record what was missing
      const missing = [];
      if (englishIndex === -1) missing.push('English');
      if (romanUrduIndex === -1) missing.push('Roman Urdu');
      if (plainUrduIndex === -1 && !plainUrduRaw) missing.push('Plain Urdu');

      if (missing.length > 0) {
        errors.push(`Post ${block.postNumber}: Could not clearly isolate sections for ${missing.join(', ')}.`);
      }
    }

    const english = parseLanguageSection(englishRaw);
    const romanUrdu = parseLanguageSection(romanUrduRaw);
    const plainUrdu = parseLanguageSection(plainUrduRaw);

    ideas.push({
      postNumber: block.postNumber,
      english,
      romanUrdu,
      plainUrdu,
      approvedVersion: null // null | 'english' | 'romanUrdu' | 'plainUrdu'
    });
  }

  const success = ideas.length > 0 && ideas.some(i => i.english.text || i.plainUrdu.text);

  return {
    success,
    ideas,
    errors
  };
}

/**
 * Parses the response from an individual language regeneration request
 * @param {string} rawText 
 * @param {string} language 
 * @returns {{ success: boolean, parsed: object, error?: string }}
 */
export function parseSingleLanguageRegen(rawText = '', language = 'English') {
  if (!rawText || !rawText.trim()) {
    return { success: false, parsed: null, error: 'Empty regeneration response received.' };
  }

  // Strip possible language header: e.g. "ENGLISH:\n"
  const cleaned = rawText.replace(
    /^(?:POST\s*\d+\s*[:\—\-]\s*)?(?:ENGLISH|ROMAN\s*URDU|PLAIN\s*URDU|URDU)\s*[:\—\-]?\s*/i,
    ''
  ).trim();

  const parsed = parseLanguageSection(cleaned);

  if (!parsed.text) {
    return { success: false, parsed: null, error: `Could not parse regenerated ${language} text.` };
  }

  return { success: true, parsed };
}
