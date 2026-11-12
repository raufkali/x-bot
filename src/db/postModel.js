import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { isMongoConnected } from './mongo.js';

// Schema for storing generated and approved X posts
const PostSchema = new mongoose.Schema(
  {
    topic: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    category: {
      type: String,
      default: 'GEOPOLITICS_TECH_2035',
      index: true
    },
    englishLevel: {
      type: String,
      default: 'A2'
    },
    englishText: {
      type: String,
      required: true
    },
    englishHashtags: {
      type: String,
      default: ''
    },
    romanUrduText: {
      type: String,
      default: ''
    },
    romanUrduHashtags: {
      type: String,
      default: ''
    },
    plainUrduText: {
      type: String,
      default: ''
    },
    plainUrduHashtags: {
      type: String,
      default: ''
    },
    textHash: {
      type: String,
      unique: true,
      index: true
    },
    status: {
      type: String,
      enum: ['PENDING', 'APPROVED', 'DISCARDED', 'POSTED'],
      default: 'PENDING',
      index: true
    },
    approvedLanguage: {
      type: String,
      default: null
    },
    provider: {
      type: String,
      default: 'AI_SYNTHESIZER'
    },
    approvedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

export const PostModel = mongoose.models.Post || mongoose.model('Post', PostSchema);

// In-memory fallback repository when MongoDB connection is pending or unavailable
const inMemoryPosts = new Map();
const inMemoryHashes = new Set();
const inMemoryTopics = [];

/**
 * Computes a normalized SHA-256 hash of a string for deduplication
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
 * Checks if a topic or similar text has already been used
 */
export async function isDuplicatePost(topic = '', englishText = '') {
  const hash = computeNormalizedHash(englishText || topic);

  // Check in-memory store first
  if (inMemoryHashes.has(hash)) {
    return true;
  }

  // Check MongoDB if connected
  if (isMongoConnected()) {
    try {
      const existing = await PostModel.findOne({
        $or: [
          { textHash: hash },
          { topic: new RegExp(`^${topic.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') }
        ]
      }).lean();

      if (existing) {
        inMemoryHashes.add(hash);
        return true;
      }
    } catch (err) {
      console.warn('[PostModel] Error checking duplicate in MongoDB:', err.message);
    }
  }

  return false;
}

/**
 * Retrieves recently generated topics to prevent AI from repeating themes
 */
export async function getRecentTopics(limit = 15) {
  const topics = [];

  if (isMongoConnected()) {
    try {
      const records = await PostModel.find({}, { topic: 1 })
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();
      records.forEach(r => {
        if (r.topic && !topics.includes(r.topic)) topics.push(r.topic);
      });
    } catch (err) {
      console.warn('[PostModel] Error fetching recent topics from MongoDB:', err.message);
    }
  }

  // Combine with in-memory topics
  inMemoryTopics.slice(-limit).forEach(t => {
    if (!topics.includes(t)) topics.push(t);
  });

  return topics.slice(0, limit);
}

/**
 * Saves a newly generated post to MongoDB (and in-memory cache)
 */
export async function saveGeneratedPost({
  topic,
  category = 'GEOPOLITICS_TECH_2035',
  english,
  romanUrdu = null,
  plainUrdu = null,
  provider = 'AI'
}) {
  const hash = computeNormalizedHash(english?.text || topic);

  // Cache in-memory
  inMemoryHashes.add(hash);
  inMemoryTopics.push(topic);
  const memoryDoc = {
    topic,
    category,
    englishText: english?.text || '',
    englishHashtags: english?.hashtags || '',
    romanUrduText: romanUrdu?.text || '',
    romanUrduHashtags: romanUrdu?.hashtags || '',
    plainUrduText: plainUrdu?.text || '',
    plainUrduHashtags: plainUrdu?.hashtags || '',
    textHash: hash,
    status: 'PENDING',
    provider,
    createdAt: new Date()
  };
  inMemoryPosts.set(hash, memoryDoc);

  // Persist to MongoDB if connected
  if (isMongoConnected()) {
    try {
      const doc = await PostModel.findOneAndUpdate(
        { textHash: hash },
        {
          $setOnInsert: {
            topic,
            category,
            englishLevel: 'A2',
            englishText: english?.text || '',
            englishHashtags: english?.hashtags || '',
            romanUrduText: romanUrdu?.text || '',
            romanUrduHashtags: romanUrdu?.hashtags || '',
            plainUrduText: plainUrdu?.text || '',
            plainUrduHashtags: plainUrdu?.hashtags || '',
            textHash: hash,
            status: 'PENDING',
            provider
          }
        },
        { upsert: true, new: true }
      );
      return doc;
    } catch (err) {
      console.warn('[PostModel] Failed to save post to MongoDB:', err.message);
    }
  }

  return memoryDoc;
}

/**
 * Updates post status to APPROVED
 */
export async function markPostApproved(topicOrText, language = 'English') {
  const hash = computeNormalizedHash(topicOrText);
  if (inMemoryPosts.has(hash)) {
    const p = inMemoryPosts.get(hash);
    p.status = 'APPROVED';
    p.approvedLanguage = language;
    p.approvedAt = new Date();
  }

  if (isMongoConnected()) {
    try {
      await PostModel.updateMany(
        {
          $or: [
            { textHash: hash },
            { topic: topicOrText }
          ]
        },
        {
          $set: {
            status: 'APPROVED',
            approvedLanguage: language,
            approvedAt: new Date()
          }
        }
      );
    } catch (err) {
      console.warn('[PostModel] Failed to update post status in MongoDB:', err.message);
    }
  }
}

/**
 * Updates post status to DISCARDED
 */
export async function markPostDiscarded(topicOrText) {
  const hash = computeNormalizedHash(topicOrText);
  if (inMemoryPosts.has(hash)) {
    const p = inMemoryPosts.get(hash);
    p.status = 'DISCARDED';
  }

  if (isMongoConnected()) {
    try {
      await PostModel.updateMany(
        {
          $or: [
            { textHash: hash },
            { topic: topicOrText }
          ]
        },
        { $set: { status: 'DISCARDED' } }
      );
    } catch (err) {
      console.warn('[PostModel] Failed to discard post in MongoDB:', err.message);
    }
  }
}
