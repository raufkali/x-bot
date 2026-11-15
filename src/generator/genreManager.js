/**
 * Genre Manager for X_BOT
 * Manages default and custom content genres and the active Primary Genre setting.
 * Persists data to data/genres.json.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.resolve(__dirname, '../../data');
const GENRES_FILE = path.join(DATA_DIR, 'genres.json');

export const DEFAULT_GENRES = [
  {
    id: 'PAK_VS_IND',
    name: 'Pak vs Ind',
    description: 'India vs Pakistan: Military spending, weapons & fighter jets vs clean water, schools, healthcare & poverty',
    keywords: [
      'India vs Pakistan',
      'Defence budget vs public welfare',
      'Nuclear deterrence vs poverty',
      'Fighter jets vs public hospitals',
      'Submarines vs clean drinking water',
      'Missiles vs child malnutrition',
      'Weapons vs school education'
    ]
  },
  {
    id: 'GEOPOLITICS',
    name: 'Geopolitics & Global Power',
    description: 'China vs USA, Russia and Ukraine, Middle East, international trade and sanctions',
    keywords: [
      'India vs Pakistan',
      'China vs USA',
      'Iran and oil trade',
      'Russia and Ukraine',
      'Middle East conflicts',
      'US military bases',
      'International trade and sanctions',
      'Global power competition'
    ]
  },
  {
    id: 'PAKISTAN_POLITICS',
    name: 'Pakistan Politics & Economy',
    description: 'Government spending, IMF loans, debt servicing, defence vs welfare budgets',
    keywords: [
      'Government spending',
      'IMF loans and economic pressure',
      'Defence budgets vs public welfare',
      'Education and healthcare spending',
      'Political families and power',
      'Civilian and military relations',
      'Democracy and accountability'
    ]
  },
  {
    id: 'SOCIAL_ETHNIC_ISSUES',
    name: 'Social & Regional Issues',
    description: 'Punjab, Sindh, Balochistan and KPK, unequal development, resources',
    keywords: [
      'Punjab, Sindh, Balochistan and KPK',
      'Unequal development',
      'Resource distribution',
      'Ethnic representation and voice',
      'National unity vs policy fairness'
    ]
  },
  {
    id: 'AI_HUMAN_SOCIETY',
    name: 'AI & Human Society',
    description: 'AI replacing jobs, digital surveillance, data centres electricity and water',
    keywords: [
      'AI replacing human work',
      'Human dependence on AI',
      'Digital surveillance and government control',
      'Autonomous military weapons',
      'Data centres electricity and water consumption'
    ]
  },
  {
    id: 'CLIMATE_GLOBAL_POWER',
    name: 'Climate & Global Power',
    description: 'Pakistan floods, global emissions, rich vs poor climate injustice',
    keywords: [
      'Pakistan floods and climate damage',
      'Global pollution and emissions',
      'Rich countries vs poor countries',
      'Climate funding promises vs reality',
      'Water shortages and rivers'
    ]
  },
  {
    id: 'SATIRICAL_COMMENTARY',
    name: 'Double-Meaning & Satirical Commentary',
    description: 'Sugar vs guns, political promises vs reality, ironies of everyday power',
    keywords: [
      'Sugar vs guns',
      'Political promises vs reality',
      'Rich nations vs poor nations',
      'Military spending vs public welfare',
      'Everyday life compared with international politics'
    ]
  }
];

class GenreManager {
  constructor() {
    this.primaryGenreId = null; // null = Random (rotate across all)
    this.customGenres = [];
    this.load();
  }

  /**
   * Loads genres and primary setting from data/genres.json
   */
  load() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      if (fs.existsSync(GENRES_FILE)) {
        const raw = fs.readFileSync(GENRES_FILE, 'utf8');
        const data = JSON.parse(raw);
        this.primaryGenreId = data.primaryGenreId || null;
        this.customGenres = Array.isArray(data.customGenres) ? data.customGenres : [];
      } else {
        this.save();
      }
    } catch (err) {
      console.warn('[GenreManager] Error loading genres file, using defaults:', err.message);
    }
  }

  /**
   * Persists genres and primary setting to data/genres.json
   */
  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }

      const payload = {
        primaryGenreId: this.primaryGenreId,
        customGenres: this.customGenres,
        updatedAt: new Date().toISOString()
      };

      fs.writeFileSync(GENRES_FILE, JSON.stringify(payload, null, 2), 'utf8');
    } catch (err) {
      console.warn('[GenreManager] Error saving genres file:', err.message);
    }
  }

  /**
   * Returns all available genres (defaults + user custom)
   */
  getAllGenres() {
    return [...DEFAULT_GENRES, ...this.customGenres];
  }

  /**
   * Returns current primary genre object or null (if random)
   */
  getPrimaryGenre() {
    if (!this.primaryGenreId) return null;
    const all = this.getAllGenres();
    return all.find(g => g.id.toLowerCase() === this.primaryGenreId.toLowerCase()) || null;
  }

  /**
   * Sets primary genre by 0 (random), index (1-based), ID, or Name
   * @param {string|number} selection
   */
  setPrimaryGenre(selection) {
    const raw = String(selection ?? '').trim().toLowerCase();

    // 0 or "random" => Random rotation
    if (raw === '0' || raw === 'random' || raw === 'none' || raw === 'all' || raw === '') {
      this.primaryGenreId = null;
      this.save();
      return { success: true, genre: null, isRandom: true };
    }

    const all = this.getAllGenres();

    // Check if numeric index 1..N
    const num = parseInt(raw, 10);
    if (!isNaN(num) && num >= 1 && num <= all.length) {
      const chosen = all[num - 1];
      this.primaryGenreId = chosen.id;
      this.save();
      return { success: true, genre: chosen, isRandom: false };
    }

    // Check if matching ID or Name
    const matched = all.find(
      g => g.id.toLowerCase() === raw || g.name.toLowerCase() === raw
    );

    if (matched) {
      this.primaryGenreId = matched.id;
      this.save();
      return { success: true, genre: matched, isRandom: false };
    }

    return {
      success: false,
      error: `Invalid genre selection "${selection}". Choose 0 for Random or 1-${all.length}.`
    };
  }

  /**
   * Adds a new custom genre
   * @param {string} name 
   * @param {string} [description]
   * @param {Array<string>} [keywords]
   */
  addGenre(name, description = '', keywords = []) {
    const cleanName = String(name || '').trim();
    if (!cleanName || cleanName.length < 2) {
      throw new Error('Genre name must be at least 2 characters long.');
    }

    // Generate clean unique ID
    const slug = cleanName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
    const id = `CUSTOM_${slug}_${Date.now().toString().slice(-4)}`;

    const newGenre = {
      id,
      name: cleanName,
      description: description.trim() || `Custom analysis category: ${cleanName}`,
      keywords: Array.isArray(keywords) && keywords.length > 0 ? keywords : [cleanName],
      isCustom: true,
      createdAt: new Date().toISOString()
    };

    this.customGenres.push(newGenre);
    this.save();
    return newGenre;
  }

  /**
   * Formats the list of all genres for WhatsApp display
   */
  formatGenresList() {
    const all = this.getAllGenres();
    const primary = this.getPrimaryGenre();

    let output = `📚 *All Available Genres:*\n\n`;
    all.forEach((g, idx) => {
      const isPrimary = primary && primary.id === g.id;
      const star = isPrimary ? ' ⭐ *(PRIMARY)*' : '';
      output += `*${idx + 1}.* ${g.name}${star}\n   _${g.description}_\n\n`;
    });

    if (primary) {
      output += `🎯 *Active Setting:* Only posting *${primary.name}*\n`;
    } else {
      output += `🎲 *Active Setting:* *Random* (Rotating across all genres)\n`;
    }

    output += `\nReply with:
• *1* ➔ Add another genre
• *3* ➔ Make a genre primary
• *0* ➔ Back to Main Menu`;

    return output;
  }

  /**
   * Formats the selection prompt for WhatsApp when owner presses 3
   */
  formatGenresSelection() {
    const all = this.getAllGenres();
    const primary = this.getPrimaryGenre();

    let output = `🎯 *Make a Genre Primary:*\n`;
    output += `_Select which genre the bot should post from exclusively:_\n\n`;
    output += `• *0* ➔ 🎲 *Random* (Rotate across all genres)\n`;

    all.forEach((g, idx) => {
      const isPrimary = primary && primary.id === g.id;
      const marker = isPrimary ? ' *(CURRENT)*' : '';
      output += `• *${idx + 1}* ➔ *${g.name}*${marker}\n`;
    });

    output += `\n_Reply with the number of your choice (0 for Random)._\n_Once selected, the bot will post only of that genre nothing else!_`;
    return output;
  }

  /**
   * Resets to initial defaults (used in testing)
   */
  reset() {
    this.primaryGenreId = null;
    this.customGenres = [];
    this.save();
  }
}

export const genreManager = new GenreManager();
