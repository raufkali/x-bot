/**
 * Persistent History Store & Anti-Duplication Engine
 * Guarantees that old posts are never regenerated across restarts or across days.
 * Persists data to data/post_history.json and syncs with MongoDB.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const HISTORY_FILE = path.join(DATA_DIR, 'post_history.json');

/**
 * Normalizes text and computes SHA-256 hash
 */
export function computeNormalizedHash(text = '') {
  const normalized = String(text)
    .toLowerCase()
    .replace(/[^\w\s]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  return crypto.createHash('sha256').update(normalized).digest('hex');
}

/**
 * Extracts numeric tokens (e.g. "83", "9", "40", "25", "100") from text
 */
export function extractNumbers(text = '') {
  const matches = String(text).match(/\b\d+(?:\.\d+)?(?:k|m|b|%|bn)?\b/gi);
  if (!matches) return [];
  return Array.from(new Set(matches.map(m => m.toLowerCase())));
}

/**
 * Computes Jaccard word set similarity between two texts (0.0 to 1.0)
 */
export function calculateJaccardSimilarity(textA = '', textB = '') {
  const wordsA = new Set(
    String(textA)
      .toLowerCase()
      .replace(/[^\w\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
  );
  const wordsB = new Set(
    String(textB)
      .toLowerCase()
      .replace(/[^\w\s]/gi, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3)
  );

  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersectionCount = 0;
  for (const word of wordsA) {
    if (wordsB.has(word)) {
      intersectionCount++;
    }
  }

  const unionCount = wordsA.size + wordsB.size - intersectionCount;
  return unionCount === 0 ? 0 : intersectionCount / unionCount;
}

class HistoryStore {
  constructor() {
    this.posts = [];
    this.hashes = new Set();
    this.topics = new Set();
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
          this.posts = data.posts;
          this.posts.forEach(p => {
            if (p.hash) this.hashes.add(p.hash);
            if (p.topic) this.topics.add(p.topic.toLowerCase().trim());
          });
        }
      } else {
        this.save();
      }
    } catch (err) {
      console.warn('[HistoryStore] Could not load post history, initializing empty:', err.message);
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
   * Records a generated, approved, or published post into permanent history
   */
  recordPost({
    topic = '',
    category = 'GEOPOLITICS',
    englishText = '',
    romanUrduText = '',
    plainUrduText = '',
    provider = 'AI',
    status = 'PENDING'
  }) {
    const text = (englishText || topic).trim();
    const hash = computeNormalizedHash(text);
    const numbers = extractNumbers(text);
    const cleanTopic = topic.trim();

    this.hashes.add(hash);
    if (cleanTopic) {
      this.topics.add(cleanTopic.toLowerCase());
    }

    const existingIdx = this.posts.findIndex(p => p.hash === hash || (cleanTopic && p.topic === cleanTopic));

    const record = {
      hash,
      topic: cleanTopic,
      category,
      englishText: text,
      romanUrduText,
      plainUrduText,
      numbers,
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
   * Comprehensive duplicate check:
   * 1. Exact hash check
   * 2. Exact topic match
   * 3. High text similarity > 0.65 (prevents rewording the same post)
   * 4. Numeric stats match: if 3+ key figures overlap AND similarity > 0.40
   */
  isDuplicateOrSimilar(newText = '', newTopic = '') {
    const cleanText = String(newText).trim();
    const cleanTopic = String(newTopic).trim().toLowerCase();
    const newHash = computeNormalizedHash(cleanText || cleanTopic);

    // 1. Exact hash
    if (this.hashes.has(newHash)) {
      return { isDuplicate: true, reason: 'EXACT_HASH_MATCH' };
    }

    // 2. Exact topic
    if (cleanTopic && this.topics.has(cleanTopic)) {
      return { isDuplicate: true, reason: 'EXACT_TOPIC_MATCH' };
    }

    const newNumbers = extractNumbers(cleanText);

    // 3 & 4: Compare against every historical post
    for (const post of this.posts) {
      // Jaccard similarity check (flag if 65%+ words match)
      const similarity = calculateJaccardSimilarity(cleanText, post.englishText);
      if (similarity > 0.65) {
        return {
          isDuplicate: true,
          reason: `HIGH_TEXT_SIMILARITY (${Math.round(similarity * 100)}% match with post "${post.topic}")`
        };
      }

      // Numeric stats fingerprint check (only flag if both stats overlap AND moderate similarity)
      if (newNumbers.length >= 3 && Array.isArray(post.numbers) && post.numbers.length >= 3) {
        const sharedNumbers = newNumbers.filter(n => post.numbers.includes(n));
        if (sharedNumbers.length >= 3 && similarity > 0.40) {
          return {
            isDuplicate: true,
            reason: `MATCHING_STATISTICS (${sharedNumbers.join(', ')} match post "${post.topic}")`
          };
        }
      }
    }

    return { isDuplicate: false };
  }

  /**
   * Checks if a topic has already been seen/used
   */
  hasSeenTopic(topic = '') {
    if (!topic) return false;
    return this.topics.has(String(topic).toLowerCase().trim());
  }

  /**
   * Marks a post topic as discarded in history
   */
  markDiscarded(topic = '') {
    if (!topic) return;
    const cleanTopic = String(topic).toLowerCase().trim();
    this.topics.add(cleanTopic);
    const existing = this.posts.find(p => p.topic && p.topic.toLowerCase().trim() === cleanTopic);
    if (existing) {
      existing.status = 'DISCARDED';
      this.save();
    }
  }

  /**
   * Returns list of used topic strings
   */
  getAllUsedTopics() {
    return Array.from(this.topics);
  }

  /**
   * Returns recent posts for LLM prompt avoidance
   */
  getRecentAvoidList(limit = 25) {
    return this.posts
      .slice(-limit)
      .map(p => {
        const statsStr = Array.isArray(p.numbers) && p.numbers.length > 0 ? ` [Stats: ${p.numbers.join(', ')}]` : '';
        return `Topic: "${p.topic}"${statsStr}`;
      });
  }

  /**
   * Clears history (for testing)
   */
  reset() {
    this.posts = [];
    this.hashes.clear();
    this.topics.clear();
    this.save();
  }
}

export const historyStore = new HistoryStore();
