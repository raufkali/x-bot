import mongoose from 'mongoose';
import crypto from 'node:crypto';
import { isMongoConnected } from './mongo.js';
import {
  historyStore,
  computeNormalizedHash as historyComputeHash,
  extractPostMetadata
} from './historyStore.js';

// Enhanced Schema for storing generated and approved X posts with full analytical metadata
const PostSchema = new mongoose.Schema(
  {
    topic: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    genreId: {
      type: String,
      default: 'PAK_VS_IND',
      index: true
    },
    category: {
      type: String,
      default: 'PAK_VS_IND',
      index: true
    },
    subtopic: {
      type: String,
      index: true
    },
    mainSubject: {
      type: String,
      index: true
    },
    specificEventOrIssue: {
      type: String
    },
    centralArgument: {
      type: String
    },
    analyticalAngle: {
      type: String
    },
    importantStatistics: {
      type: [String],
      default: []
    },
    keywords: {
      type: [String],
      default: []
    },
    normalizedText: {
      type: String,
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
      enum: ['PENDING', 'DRAFT', 'APPROVED', 'DISCARDED', 'POSTED', 'REJECTED_DUPLICATE'],
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
    },
    publishedAt: {
      type: Date,
      default: null
    },
    tweetId: {
      type: String,
      default: null
    },
    tweetUrl: {
      type: String,
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
  return historyComputeHash(text);
}

/**
 * Checks if a topic, text, or argument has already been used or conflicts with history
 */
export async function isDuplicatePost(topic = '', englishText = '', extraMetadata = {}) {
  // 1. First run comprehensive 6-stage check through HistoryStore (covers JSON store + memory)
  const storeCheck = historyStore.isDuplicateOrSimilar(englishText, topic, extraMetadata);
  if (storeCheck.isDuplicate) {
    return true;
  }

  const hash = computeNormalizedHash(englishText || topic);

  // 2. Check in-memory hash store
  if (inMemoryHashes.has(hash)) {
    return true;
  }

  // 3. Check MongoDB across ALL historical records if connected
  if (isMongoConnected()) {
    try {
      const cleanTopic = String(topic).trim();
      const escapedTopic = cleanTopic.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

      const existing = await PostModel.findOne({
        $or: [
          { textHash: hash },
          { topic: new RegExp(`^${escapedTopic}$`, 'i') },
          extraMetadata.subtopic ? { subtopic: extraMetadata.subtopic } : null,
          extraMetadata.normalizedText ? { normalizedText: extraMetadata.normalizedText } : null
        ].filter(Boolean)
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
export async function getRecentTopics(limit = 25) {
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
 * Saves a newly generated post to MongoDB (and historyStore + in-memory cache)
 */
export async function saveGeneratedPost({
  topic,
  genreId = 'PAK_VS_IND',
  category = 'PAK_VS_IND',
  subtopic = '',
  mainSubject = '',
  specificEventOrIssue = '',
  centralArgument = '',
  analyticalAngle = '',
  importantStatistics = [],
  keywords = [],
  english,
  romanUrdu = null,
  plainUrdu = null,
  provider = 'AI',
  status = 'PENDING'
}) {
  const englishText = english?.text || '';
  const hash = computeNormalizedHash(englishText || topic);

  const meta = extractPostMetadata({
    topic,
    subtopic,
    genreId: genreId || category,
    category,
    text: englishText,
    mainSubject,
    specificEventOrIssue,
    centralArgument,
    analyticalAngle,
    importantStatistics,
    keywords
  });

  // Record in HistoryStore
  historyStore.recordPost({
    topic,
    subtopic: meta.subtopic,
    genreId: meta.genreId,
    category: meta.genreId,
    englishText,
    romanUrduText: romanUrdu?.text || '',
    plainUrduText: plainUrdu?.text || '',
    mainSubject: meta.mainSubject,
    specificEventOrIssue: meta.specificEventOrIssue,
    centralArgument: meta.centralArgument,
    analyticalAngle: meta.analyticalAngle,
    importantStatistics: meta.importantStatistics,
    keywords: meta.keywords,
    provider,
    status
  });

  // Cache in-memory
  inMemoryHashes.add(hash);
  if (!inMemoryTopics.includes(topic)) inMemoryTopics.push(topic);

  const memoryDoc = {
    topic,
    genreId: meta.genreId,
    category: meta.genreId,
    subtopic: meta.subtopic,
    mainSubject: meta.mainSubject,
    specificEventOrIssue: meta.specificEventOrIssue,
    centralArgument: meta.centralArgument,
    analyticalAngle: meta.analyticalAngle,
    importantStatistics: meta.importantStatistics,
    keywords: meta.keywords,
    normalizedText: meta.normalizedText,
    englishLevel: 'A2',
    englishText,
    englishHashtags: english?.hashtags || '',
    romanUrduText: romanUrdu?.text || '',
    romanUrduHashtags: romanUrdu?.hashtags || '',
    plainUrduText: plainUrdu?.text || '',
    plainUrduHashtags: plainUrdu?.hashtags || '',
    textHash: hash,
    status,
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
            genreId: meta.genreId,
            category: meta.genreId,
            subtopic: meta.subtopic,
            mainSubject: meta.mainSubject,
            specificEventOrIssue: meta.specificEventOrIssue,
            centralArgument: meta.centralArgument,
            analyticalAngle: meta.analyticalAngle,
            importantStatistics: meta.importantStatistics,
            keywords: meta.keywords,
            normalizedText: meta.normalizedText,
            englishLevel: 'A2',
            englishText,
            englishHashtags: english?.hashtags || '',
            romanUrduText: romanUrdu?.text || '',
            romanUrduHashtags: romanUrdu?.hashtags || '',
            plainUrduText: plainUrdu?.text || '',
            plainUrduHashtags: plainUrdu?.hashtags || '',
            textHash: hash,
            status,
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
 * Updates post translation in MongoDB and memory in-place (never registers a new duplicate)
 */
export async function updatePostTranslation(topicOrText, language, translationText, hashtags = '') {
  const hash = computeNormalizedHash(topicOrText);
  const cleanLang = String(language).toLowerCase();

  const updateFields = {};
  if (cleanLang.includes('roman')) {
    updateFields.romanUrduText = translationText;
    updateFields.romanUrduHashtags = hashtags;
    historyStore.updatePostTranslation(hash, { romanUrduText: translationText });
  } else if (cleanLang.includes('urdu')) {
    updateFields.plainUrduText = translationText;
    updateFields.plainUrduHashtags = hashtags;
    historyStore.updatePostTranslation(hash, { plainUrduText: translationText });
  }

  if (inMemoryPosts.has(hash)) {
    const p = inMemoryPosts.get(hash);
    Object.assign(p, updateFields);
  }

  if (isMongoConnected()) {
    try {
      await PostModel.updateMany(
        {
          $or: [{ textHash: hash }, { topic: topicOrText }]
        },
        { $set: updateFields }
      );
    } catch (err) {
      console.warn('[PostModel] Failed to update post translation in MongoDB:', err.message);
    }
  }
}

/**
 * Updates post status to APPROVED
 */
export async function markPostApproved(topicOrText, language = 'English') {
  const hash = computeNormalizedHash(topicOrText);
  historyStore.updateStatus(hash, 'APPROVED');

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
  historyStore.updateStatus(hash, 'DISCARDED');

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

/**
 * Permanently marks a post as USED in MongoDB and HistoryStore so it will NEVER be reused.
 */
export async function markPostUsed(topicOrText, extraData = {}) {
  const hash = computeNormalizedHash(extraData.text || topicOrText);
  historyStore.markUsed(topicOrText, {
    ...extraData,
    englishText: extraData.text || ''
  });

  if (inMemoryPosts.has(hash)) {
    const p = inMemoryPosts.get(hash);
    p.status = 'USED';
    p.usedPermanently = true;
    p.markedUsedAt = new Date();
  }

  if (isMongoConnected()) {
    try {
      const query = {
        $or: [
          { textHash: hash },
          { topic: String(topicOrText).trim() }
        ]
      };

      const result = await PostModel.updateMany(
        query,
        {
          $set: {
            status: 'USED',
            usedPermanently: true,
            markedUsedAt: new Date(),
            ...(extraData.centralArgument ? { centralArgument: extraData.centralArgument } : {}),
            ...(extraData.subtopic ? { subtopic: extraData.subtopic } : {})
          }
        }
      );

      // If document not yet saved to Mongo, persist it permanently as USED
      if (result.matchedCount === 0 && extraData.text) {
        await saveGeneratedPost({
          topic: String(topicOrText).trim(),
          subtopic: extraData.subtopic || topicOrText,
          centralArgument: extraData.centralArgument || '',
          english: { text: extraData.text, fullPost: extraData.text },
          status: 'USED',
          usedPermanently: true
        });
      }
    } catch (err) {
      console.warn('[PostModel] Failed to mark post as used in MongoDB:', err.message);
    }
  }
}

/**
 * Updates post status to POSTED with live tweet details and permanently marks it as published
 */
export async function markPostPublished(topicOrText, language = 'English', tweetId = null, tweetUrl = null) {
  const hash = computeNormalizedHash(topicOrText);
  historyStore.updateStatus(hash, 'POSTED');

  if (inMemoryPosts.has(hash)) {
    const p = inMemoryPosts.get(hash);
    p.status = 'POSTED';
    p.approvedLanguage = language;
    p.approvedAt = p.approvedAt || new Date();
    p.publishedAt = new Date();
    p.tweetId = tweetId;
    p.tweetUrl = tweetUrl;
  }

  inMemoryHashes.add(hash);
  if (!inMemoryTopics.includes(topicOrText)) {
    inMemoryTopics.push(topicOrText);
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
            status: 'POSTED',
            approvedLanguage: language,
            approvedAt: new Date(),
            publishedAt: new Date(),
            tweetId: tweetId,
            tweetUrl: tweetUrl
          }
        }
      );
    } catch (err) {
      console.warn('[PostModel] Failed to mark post as POSTED in MongoDB:', err.message);
    }
  }
}

/**
 * Synchronizes ALL historical records from MongoDB into memory and HistoryStore
 */
export async function syncMongoHistory() {
  if (!isMongoConnected()) return 0;
  try {
    const allPosts = await PostModel.find({}).lean();
    allPosts.forEach(p => {
      const hash = p.textHash || computeNormalizedHash(p.englishText || p.topic);
      inMemoryHashes.add(hash);
      if (p.topic && !inMemoryTopics.includes(p.topic)) inMemoryTopics.push(p.topic);
    });

    const synced = historyStore.syncFromMongo(allPosts);
    if (synced > 0) {
      console.log(`[MongoDB Sync] Synchronized ${synced} historical posts into HistoryStore.`);
    }
    return synced;
  } catch (err) {
    console.warn('[PostModel] Failed to sync Mongo history:', err.message);
    return 0;
  }
}

/**
 * Retrieves ALL topics that have been posted or approved or generated across all time
 */
export async function getAllUsedTopics(limit = 0) {
  const topics = [];

  if (isMongoConnected()) {
    try {
      const query = PostModel.find({}, { topic: 1, subtopic: 1, status: 1 }).sort({ createdAt: -1 });
      if (limit > 0) query.limit(limit);
      const records = await query.lean();
      records.forEach(r => {
        if (r.topic && !topics.includes(r.topic)) topics.push(r.topic);
        if (r.subtopic && !topics.includes(r.subtopic)) topics.push(r.subtopic);
      });
    } catch (err) {
      console.warn('[PostModel] Error fetching used topics from MongoDB:', err.message);
    }
  }

  inMemoryTopics.forEach(t => {
    if (!topics.includes(t)) topics.push(t);
  });

  return topics;
}
