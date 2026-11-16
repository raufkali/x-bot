/**
 * Persistent History Store & Intelligent Anti-Duplication Engine
 * Tracks comprehensive content-level metadata:
 * - Genre ID, Subtopic, Main Subject, Specific Event/Issue
 * - Central Argument, Analytical Angle, Important Statistics, Keywords
 * - Normalized text & SHA-256 fingerprint
 * - Status (PENDING, APPROVED, POSTED, DISCARDED, REJECTED_DUPLICATE)
 *
 * Enforces 6-stage intelligent duplicate rejection:
 * 1. Exact text duplication (SHA-256 normalized hash)
 * 2. Near-identical wording (Jaccard word & n-gram similarity)
 * 3. Similar central arguments (Argument-level semantic & token overlap)
 * 4. Repeated subject and analytical angle
 * 5. Reused statistics and numerical comparisons
 * 6. Repeated topics & exhausted subtopics
 *
 * Supports concurrency locks to prevent race conditions during simultaneous generations.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const HISTORY_FILE = path.join(DATA_DIR, 'post_history.json');

// Standard stop words for English text analysis
const STOP_WORDS = new Set([
  'a', 'about', 'above', 'after', 'again', 'against', 'all', 'am', 'an', 'and', 'any', 'are', 'aren',
  'arent', 'as', 'at', 'be', 'because', 'been', 'before', 'being', 'below', 'between', 'both', 'but',
  'by', 'can', 'cannot', 'could', 'couldn', 'did', 'didn', 'do', 'does', 'doesn', 'doing', 'don',
  'down', 'during', 'each', 'few', 'for', 'from', 'further', 'had', 'hadn', 'has', 'hasn', 'have',
  'haven', 'having', 'he', 'her', 'here', 'hers', 'herself', 'him', 'himself', 'his', 'how', 'i',
  'if', 'in', 'into', 'is', 'isn', 'it', 'its', 'itself', 'let', 'me', 'more', 'most', 'mustn', 'my',
  'myself', 'no', 'nor', 'not', 'of', 'off', 'on', 'once', 'only', 'or', 'other', 'ought', 'our',
  'ours', 'ourselves', 'out', 'over', 'own', 'same', 'shan', 'she', 'should', 'shouldn', 'so', 'some',
  'such', 'than', 'that', 'the', 'their', 'theirs', 'them', 'themselves', 'then', 'there', 'these',
  'they', 'this', 'those', 'through', 'to', 'too', 'under', 'until', 'up', 'very', 'was', 'wasn',
  'we', 'were', 'weren', 'what', 'when', 'where', 'which', 'while', 'who', 'whom', 'why', 'with',
  'would', 'wouldn', 'you', 'your', 'yours', 'yourself', 'yourselves'
]);

/**
 * Normalizes text by lowercasing, removing punctuation, and collapsing whitespace
 */
export function normalizeText(text = '') {
  return String(text)
    .toLowerCase()
    .replace(/[^\w\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes text and computes SHA-256 hash
 */
export function computeNormalizedHash(text = '') {
  const normalized = normalizeText(text);
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Extracts key numerical statistics with contextual magnitude (e.g. "83b", "9b", "40%", "25m")
 */
export function extractNumbers(text = '') {
  const matches = String(text).match(/\b(?:\$|€|£)?\d+(?:\.\d+)?(?:\s*(?:billion|million|trillion|arab|karor|crore|percent|%|km|k|m|b|bn|dollars?))?\b/gi);
  if (!matches) return [];

  const normalized = matches.map(m => {
    let clean = m.toLowerCase().replace(/[\$,\s]/g, '');
    clean = clean.replace(/billion|arab|bn/g, 'b');
    clean = clean.replace(/million|karor|crore/g, 'm');
    clean = clean.replace(/trillion/g, 't');
    clean = clean.replace(/percent/g, '%');
    clean = clean.replace(/dollars?/g, '');
    return clean;
  });

  return Array.from(new Set(normalized));
}

/**
 * Extracts significant non-stop keywords with light stemming
 */
export function extractKeywords(text = '', maxWords = 25) {
  const words = normalizeText(text)
    .split(/\s+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));

  const freq = new Map();
  for (const w of words) {
    const stemmed = w.replace(/(?:ing|tion|ment|ed|es|s)$/g, '');
    const key = stemmed.length >= 3 ? stemmed : w;
    freq.set(key, (freq.get(key) || 0) + 1);
  }

  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxWords)
    .map(([w]) => w);
}

/**
 * Computes Jaccard word set similarity between two texts (0.0 to 1.0)
 */
export function calculateJaccardSimilarity(textA = '', textB = '') {
  const wordsA = new Set(
    normalizeText(textA)
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );
  const wordsB = new Set(
    normalizeText(textB)
      .split(/\s+/)
      .filter(w => w.length > 2 && !STOP_WORDS.has(w))
  );

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersectionCount = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) intersectionCount++;
  }

  const unionCount = wordsA.size + wordsB.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

/**
 * Computes Cosine similarity over term frequency vectors
 */
export function calculateCosineSimilarity(textA = '', textB = '') {
  const getTerms = (t) => normalizeText(t).split(/\s+/).filter(w => w.length > 2 && !STOP_WORDS.has(w));
  const termsA = getTerms(textA);
  const termsB = getTerms(textB);

  if (termsA.length === 0 || termsB.length === 0) return 0;

  const freqA = new Map();
  const freqB = new Map();
  const allVocab = new Set();

  for (const t of termsA) { freqA.set(t, (freqA.get(t) || 0) + 1); allVocab.add(t); }
  for (const t of termsB) { freqB.set(t, (freqB.get(t) || 0) + 1); allVocab.add(t); }

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const t of allVocab) {
    const valA = freqA.get(t) || 0;
    const valB = freqB.get(t) || 0;
    dotProduct += valA * valB;
    magA += valA * valA;
    magB += valB * valB;
  }

  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Computes semantic similarity between two central arguments
 */
export function calculateArgumentSimilarity(argA = '', argB = '') {
  if (!argA || !argB) return 0;
  const jaccard = calculateJaccardSimilarity(argA, argB);
  const cosine = calculateCosineSimilarity(argA, argB);
  return Math.max(jaccard, cosine);
}

/**
 * Derives comprehensive metadata for a candidate post
 */
export function extractPostMetadata({
  topic = '',
  subtopic = '',
  genreId = 'PAK_VS_IND',
  category = '',
  text = '',
  mainSubject = '',
  specificEventOrIssue = '',
  centralArgument = '',
  analyticalAngle = '',
  importantStatistics = [],
  keywords = []
}) {
  const cleanText = String(text || '').trim();
  const cleanTopic = String(topic || '').trim();
  const normText = normalizeText(cleanText || cleanTopic);
  const hash = computeNormalizedHash(cleanText || cleanTopic);

  // Extract statistics
  const stats = Array.isArray(importantStatistics) && importantStatistics.length > 0
    ? importantStatistics
    : extractNumbers(cleanText);

  // Extract keywords
  const kw = Array.isArray(keywords) && keywords.length > 0
    ? keywords
    : extractKeywords(cleanText);

  // Extract sentences for intelligent fallback derivation
  const sentences = cleanText
    .split(/(?<=[.!?])\s+|\n\n+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  // Derive mainSubject if not supplied
  let derivedSubject = mainSubject;
  if (!derivedSubject) {
    if (subtopic) {
      derivedSubject = subtopic;
    } else if (cleanTopic.includes(':')) {
      derivedSubject = cleanTopic.split(':')[0].trim();
    } else {
      derivedSubject = cleanTopic || (sentences[0] ? sentences[0].slice(0, 60) : 'General Analytical Insight');
    }
  }

  // Derive centralArgument if not supplied
  let derivedArgument = centralArgument;
  if (!derivedArgument) {
    const argumentSentence = sentences.find(s =>
      s.includes('?') ||
      /\b(?:spends|while|whereas|cost|costs|billion|million|contrast|instead|undermine|compromise|outweigh|prioritize|neglect)\b/i.test(s)
    );
    derivedArgument = argumentSentence || sentences[sentences.length - 1] || cleanText.slice(0, 140);
  }

  // Derive analyticalAngle if not supplied
  let derivedAngle = analyticalAngle;
  if (!derivedAngle) {
    if (cleanTopic.includes(':')) {
      derivedAngle = cleanTopic.split(':').slice(1).join(':').trim();
    } else {
      derivedAngle = `${derivedSubject} vs Human Security Priorities`;
    }
  }

  return {
    genreId: genreId || category || 'PAK_VS_IND',
    subtopic: subtopic || cleanTopic,
    mainSubject: derivedSubject,
    specificEventOrIssue: specificEventOrIssue || derivedSubject,
    centralArgument: derivedArgument,
    analyticalAngle: derivedAngle,
    importantStatistics: stats,
    keywords: kw,
    normalizedText: normText,
    hash
  };
}

class HistoryStore {
  constructor() {
    this.posts = [];
    this.hashes = new Set();
    this.topics = new Set();
    this.subtopics = new Set();
    this.inFlightLocks = new Set(); // Concurrency locks
    this.load();
  }

  load() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(HISTORY_FILE)) {
        const raw = fs.readFileSync(HISTORY_FILE, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.posts)) {
          this.posts = data.posts.map(p => {
            const enriched = extractPostMetadata({
              topic: p.topic,
              subtopic: p.subtopic || p.topic,
              genreId: p.genreId || p.category,
              category: p.category,
              text: p.englishText || p.text,
              mainSubject: p.mainSubject,
              specificEventOrIssue: p.specificEventOrIssue,
              centralArgument: p.centralArgument,
              analyticalAngle: p.analyticalAngle,
              importantStatistics: p.importantStatistics || p.numbers,
              keywords: p.keywords
            });

            return {
              ...p,
              ...enriched,
              hash: p.hash || enriched.hash,
              numbers: enriched.importantStatistics,
              englishText: p.englishText || p.text || ''
            };
          });

          this.rebuildIndexes();
        }
      } else {
        this.save();
      }
    } catch (err) {
      console.warn('[HistoryStore] Could not load post history, initializing empty:', err.message);
    }
  }

  rebuildIndexes() {
    this.hashes.clear();
    this.topics.clear();
    this.subtopics.clear();

    for (const p of this.posts) {
      if (p.hash) this.hashes.add(p.hash);
      if (p.topic) this.topics.add(normalizeText(p.topic));
      if (p.subtopic) this.subtopics.add(normalizeText(p.subtopic));
    }
  }

  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      const payload = {
        totalPosts: this.posts.length,
        updatedAt: new Date().toISOString(),
        posts: this.posts
      };

      fs.writeFileSync(HISTORY_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.warn('[HistoryStore] Error saving post history:', err.message);
    }
  }

  /**
   * Concurrency Lock: Reserves candidate hash and subtopic to prevent simultaneous generation clashes
   */
  acquireLock(lockKey) {
    const key = String(lockKey || '').trim().toLowerCase();
    if (!key) return true;
    if (this.inFlightLocks.has(key)) {
      return false;
    }
    this.inFlightLocks.add(key);
    return true;
  }

  releaseLock(lockKey) {
    const key = String(lockKey || '').trim().toLowerCase();
    if (key) {
      this.inFlightLocks.delete(key);
    }
  }

  /**
   * Comprehensive 6-stage duplicate check:
   * 1. Exact text duplication (normalized hash)
   * 2. Near-identical wording (Jaccard > 0.60 or Cosine > 0.68)
   * 3. Similar central arguments (Argument similarity > 0.45 or core claim overlap)
   * 4. Repeated subject and analytical angle (Subject match > 0.50 AND angle match > 0.45)
   * 5. Reused statistics and comparisons (2+ key statistics match AND similarity > 0.30)
   * 6. Repeated topics & exhausted subtopics (Subtopic match with argument overlap)
   */
  isDuplicateOrSimilar(candidateText = '', candidateTopic = '', extraMetadata = {}) {
    const meta = extractPostMetadata({
      topic: candidateTopic,
      text: candidateText,
      ...extraMetadata
    });

    const newHash = meta.hash;
    const cleanTopicNorm = normalizeText(candidateTopic);
    const cleanSubtopicNorm = normalizeText(meta.subtopic);
    const cleanText = String(candidateText).trim();

    // 1. Exact text duplication (SHA-256 normalized hash)
    if (this.hashes.has(newHash)) {
      return {
        isDuplicate: true,
        reason: 'EXACT_HASH_MATCH',
        rule: 1
      };
    }

    // 2-6. Check against all historical posts
    for (const post of this.posts) {
      // 1b. Exact normalized text check
      if (post.normalizedText && post.normalizedText === meta.normalizedText) {
        return {
          isDuplicate: true,
          reason: 'EXACT_TEXT_MATCH',
          matchedPost: post.topic,
          rule: 1
        };
      }

      // Check 2: Near-identical wording (Jaccard > 0.60 or Cosine > 0.68)
      const textJaccard = calculateJaccardSimilarity(cleanText, post.englishText);
      const textCosine = calculateCosineSimilarity(cleanText, post.englishText);
      if (textJaccard > 0.60 || textCosine > 0.68) {
        return {
          isDuplicate: true,
          reason: `HIGH_TEXT_SIMILARITY (${Math.round(Math.max(textJaccard, textCosine) * 100)}% match with "${post.topic}")`,
          matchedPost: post.topic,
          rule: 2
        };
      }

      // Check 3: Similar central arguments
      if (meta.centralArgument && post.centralArgument) {
        const argSim = calculateArgumentSimilarity(meta.centralArgument, post.centralArgument);
        const relatedContext = (meta.mainSubject && post.mainSubject && calculateArgumentSimilarity(meta.mainSubject, post.mainSubject) > 0.35) ||
                               (meta.subtopic && post.subtopic && calculateArgumentSimilarity(meta.subtopic, post.subtopic) > 0.35) ||
                               textJaccard > 0.30;
        if (argSim >= 0.65 || (argSim > 0.45 && relatedContext)) {
          return {
            isDuplicate: true,
            reason: `SIMILAR_CENTRAL_ARGUMENT (${Math.round(argSim * 100)}% argument overlap with "${post.topic}")`,
            matchedPost: post.topic,
            matchedArgument: post.centralArgument,
            rule: 3
          };
        }
      }

      // Check 4: Repeated subject and analytical angle
      if (meta.mainSubject && post.mainSubject) {
        const subjectSim = calculateArgumentSimilarity(meta.mainSubject, post.mainSubject);
        const angleSim = (meta.analyticalAngle && post.analyticalAngle)
          ? calculateArgumentSimilarity(meta.analyticalAngle, post.analyticalAngle)
          : 0;

        if (subjectSim > 0.50 && angleSim > 0.45) {
          return {
            isDuplicate: true,
            reason: `REPEATED_SUBJECT_AND_ANGLE ("${meta.mainSubject}" / "${meta.analyticalAngle}" matches "${post.topic}")`,
            matchedPost: post.topic,
            rule: 4
          };
        }
      }

      // Check 5: Reused statistics and comparisons
      if (Array.isArray(meta.importantStatistics) && meta.importantStatistics.length >= 2 &&
          Array.isArray(post.importantStatistics) && post.importantStatistics.length >= 2) {
        const sharedStats = meta.importantStatistics.filter(s => post.importantStatistics.includes(s));
        if (sharedStats.length >= 2 && (textJaccard > 0.30 || textCosine > 0.35)) {
          return {
            isDuplicate: true,
            reason: `REUSED_STATISTICS_AND_COMPARISON (${sharedStats.join(', ')} overlapping with "${post.topic}")`,
            matchedPost: post.topic,
            rule: 5
          };
        }
      }

      // Check 6: Repeated subtopic with overlapping claim
      const postSubtopicNorm = normalizeText(post.subtopic || post.topic);
      if (cleanSubtopicNorm && cleanSubtopicNorm.length > 5 && cleanSubtopicNorm === postSubtopicNorm) {
        // If subtopic is identical, require distinct analytical angle and low argument overlap (< 0.30)
        const subtopicArgOverlap = (meta.centralArgument && post.centralArgument)
          ? calculateArgumentSimilarity(meta.centralArgument, post.centralArgument)
          : textJaccard;

        if (subtopicArgOverlap > 0.30) {
          return {
            isDuplicate: true,
            reason: `EXHAUSTED_SUBTOPIC_OR_ARGUMENT (Subtopic "${post.subtopic}" already explored with similar claim)`,
            matchedPost: post.topic,
            rule: 6
          };
        }
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Records a generated post with full metadata
   */
  recordPost({
    topic = '',
    subtopic = '',
    genreId = 'PAK_VS_IND',
    category = '',
    englishText = '',
    romanUrduText = '',
    plainUrduText = '',
    mainSubject = '',
    specificEventOrIssue = '',
    centralArgument = '',
    analyticalAngle = '',
    importantStatistics = [],
    keywords = [],
    provider = 'AI',
    status = 'PENDING'
  }) {
    const text = (englishText || topic).trim();
    const cleanTopic = topic.trim();
    const meta = extractPostMetadata({
      topic: cleanTopic,
      subtopic,
      genreId: genreId || category,
      text,
      mainSubject,
      specificEventOrIssue,
      centralArgument,
      analyticalAngle,
      importantStatistics,
      keywords
    });

    const hash = meta.hash;
    this.hashes.add(hash);
    if (cleanTopic) this.topics.add(normalizeText(cleanTopic));
    if (meta.subtopic) this.subtopics.add(normalizeText(meta.subtopic));

    const existingIdx = this.posts.findIndex(p => p.hash === hash || (cleanTopic && p.topic === cleanTopic));

    const record = {
      hash,
      topic: cleanTopic,
      subtopic: meta.subtopic,
      genreId: meta.genreId,
      category: meta.genreId,
      mainSubject: meta.mainSubject,
      specificEventOrIssue: meta.specificEventOrIssue,
      centralArgument: meta.centralArgument,
      analyticalAngle: meta.analyticalAngle,
      importantStatistics: meta.importantStatistics,
      keywords: meta.keywords,
      normalizedText: meta.normalizedText,
      englishText: text,
      romanUrduText: romanUrduText || '',
      plainUrduText: plainUrduText || '',
      numbers: meta.importantStatistics,
      provider,
      status,
      timestamp: new Date().toISOString()
    };

    if (existingIdx >= 0) {
      this.posts[existingIdx] = { ...this.posts[existingIdx], ...record };
    } else {
      this.posts.push(record);
    }

    this.save();
    return record;
  }

  /**
   * Updates translation in-place without creating duplicate entries
   */
  updatePostTranslation(topicOrHash, { romanUrduText = null, plainUrduText = null }) {
    const clean = String(topicOrHash).trim();
    const hash = computeNormalizedHash(clean);
    const post = this.posts.find(p => p.hash === clean || p.hash === hash || p.topic === clean);

    if (post) {
      if (romanUrduText !== null) post.romanUrduText = romanUrduText;
      if (plainUrduText !== null) post.plainUrduText = plainUrduText;
      this.save();
      return post;
    }
    return null;
  }

  /**
   * Marks a post status (e.g. APPROVED, DISCARDED, POSTED)
   */
  updateStatus(topicOrHash, newStatus) {
    const clean = String(topicOrHash).trim();
    const hash = computeNormalizedHash(clean);
    const post = this.posts.find(p => p.hash === clean || p.hash === hash || p.topic === clean);

    if (post) {
      post.status = newStatus;
      this.save();
      return post;
    }
    return null;
  }

  /**
   * Synchronizes documents from MongoDB into HistoryStore
   */
  syncFromMongo(mongoPosts = []) {
    if (!Array.isArray(mongoPosts) || mongoPosts.length === 0) return 0;
    let addedCount = 0;

    for (const doc of mongoPosts) {
      const hash = doc.textHash || computeNormalizedHash(doc.englishText || doc.topic);
      const exists = this.posts.some(p => p.hash === hash);

      if (!exists) {
        const enriched = extractPostMetadata({
          topic: doc.topic,
          subtopic: doc.subtopic || doc.topic,
          genreId: doc.genreId || doc.category,
          text: doc.englishText,
          mainSubject: doc.mainSubject,
          specificEventOrIssue: doc.specificEventOrIssue,
          centralArgument: doc.centralArgument,
          analyticalAngle: doc.analyticalAngle,
          importantStatistics: doc.importantStatistics,
          keywords: doc.keywords
        });

        this.posts.push({
          hash,
          topic: doc.topic,
          subtopic: enriched.subtopic,
          genreId: enriched.genreId,
          category: enriched.genreId,
          mainSubject: enriched.mainSubject,
          specificEventOrIssue: enriched.specificEventOrIssue,
          centralArgument: enriched.centralArgument,
          analyticalAngle: enriched.analyticalAngle,
          importantStatistics: enriched.importantStatistics,
          keywords: enriched.keywords,
          normalizedText: enriched.normalizedText,
          englishText: doc.englishText || '',
          romanUrduText: doc.romanUrduText || '',
          plainUrduText: doc.plainUrduText || '',
          numbers: enriched.importantStatistics,
          provider: doc.provider || 'MongoDB Sync',
          status: doc.status || 'PENDING',
          timestamp: doc.createdAt ? new Date(doc.createdAt).toISOString() : new Date().toISOString()
        });
        addedCount++;
      }
    }

    if (addedCount > 0) {
      this.rebuildIndexes();
      this.save();
    }
    return addedCount;
  }

  hasSeenTopic(topic = '') {
    if (!topic) return false;
    return this.topics.has(normalizeText(topic));
  }

  recordSeenTopic(topic = '') {
    if (!topic) return;
    this.topics.add(normalizeText(topic));
  }

  markDiscarded(topic = '') {
    if (!topic) return;
    const cleanTopic = normalizeText(topic);
    this.topics.add(cleanTopic);
    const existing = this.posts.find(p => p.topic && normalizeText(p.topic) === cleanTopic);
    if (existing) {
      existing.status = 'DISCARDED';
      this.save();
    }
  }

  /**
   * Permanently marks a post as USED so that its topic, subtopic, argument,
   * and text will NEVER be reused or regenerated.
   */
  markUsed(topic = '', extra = {}) {
    if (!topic && !extra.englishText) return;
    const cleanTopic = topic ? normalizeText(topic) : '';
    if (cleanTopic) this.topics.add(cleanTopic);
    if (extra.subtopic) this.subtopics.add(normalizeText(extra.subtopic));

    const existing = this.posts.find(p => 
      (cleanTopic && p.topic && normalizeText(p.topic) === cleanTopic) || 
      (extra.englishText && p.englishText === extra.englishText)
    );

    if (existing) {
      existing.status = 'USED';
      existing.usedPermanently = true;
      existing.markedUsedAt = new Date().toISOString();
      if (extra.centralArgument) existing.centralArgument = extra.centralArgument;
      if (extra.subtopic) existing.subtopic = extra.subtopic;
      if (extra.genreId) existing.genreId = extra.genreId;
    } else {
      this.recordPost({
        topic: topic || extra.subtopic || 'Manually Marked Post',
        subtopic: extra.subtopic || topic,
        genreId: extra.genreId || 'PAK_VS_IND',
        category: extra.genreId || 'PAK_VS_IND',
        englishText: extra.englishText || '',
        centralArgument: extra.centralArgument || '',
        mainSubject: extra.subtopic || topic,
        status: 'USED',
        usedPermanently: true
      });
    }
    this.save();
  }

  getAllUsedTopics() {
    return Array.from(this.topics);
  }

  getAllUsedSubtopics(genreId = '') {
    return this.posts
      .filter(p => !genreId || p.genreId === genreId || p.category === genreId)
      .map(p => p.subtopic || p.topic)
      .filter(Boolean);
  }

  getRecentAvoidList(limit = 35) {
    return this.posts
      .slice(-limit)
      .map(p => {
        const statsStr = Array.isArray(p.importantStatistics) && p.importantStatistics.length > 0
          ? ` | Stats: [${p.importantStatistics.join(', ')}]`
          : '';
        const argStr = p.centralArgument ? ` | Core Argument: "${p.centralArgument.slice(0, 90)}..."` : '';
        const subtopicStr = p.subtopic ? ` (Subtopic: ${p.subtopic})` : '';
        return `Topic: "${p.topic}"${subtopicStr}${argStr}${statsStr}`;
      });
  }

  reset() {
    this.posts = [];
    this.hashes.clear();
    this.topics.clear();
    this.subtopics.clear();
    this.inFlightLocks.clear();
    this.save();
  }
}

export const historyStore = new HistoryStore();
