import { isDuplicatePost, computeNormalizedHash, saveGeneratedPost, getRecentTopics } from '../src/db/postModel.js';

console.log('====================================================');
console.log('       TESTING MONGODB & DEDUPLICATION LOGIC        ');
console.log('====================================================\n');

// 1. Hash computation test
const textA = 'By 2035, power will shift to new countries!';
const textB = 'by 2035 power will shift to new countries';
const hashA = computeNormalizedHash(textA);
const hashB = computeNormalizedHash(textB);

if (hashA === hashB) {
  console.log('✓ TEST 1 PASSED: Normalized SHA-256 hash deduplication works identical across case/punctuation.');
} else {
  console.error('✕ TEST 1 FAILED');
  process.exit(1);
}

// 2. Duplicate detection test
const topic = 'How Microchips Rule the World Economy';
await saveGeneratedPost({
  topic,
  category: 'STRATEGIC_RESOURCES',
  english: { text: 'Microchips run the world economy in 2035.', hashtags: '#Chips #Tech' }
});

const isDup = await isDuplicatePost(topic, 'Microchips run the world economy in 2035.');
if (isDup) {
  console.log('✓ TEST 2 PASSED: isDuplicatePost correctly caught duplicated post!');
} else {
  console.error('✕ TEST 2 FAILED');
  process.exit(1);
}

// 3. Recent topics retrieval test
const recent = await getRecentTopics(5);
if (recent.includes(topic)) {
  console.log(`✓ TEST 3 PASSED: getRecentTopics returned recently saved topics: [${recent.join(', ')}]`);
} else {
  console.error('✕ TEST 3 FAILED');
  process.exit(1);
}

console.log('\n====================================================');
console.log('       ALL DEDUPLICATION TESTS PASSED (100%)       ');
console.log('====================================================');
process.exit(0);
