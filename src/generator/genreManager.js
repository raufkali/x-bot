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
    description: 'India vs Pakistan: Military spending, governance, socio-politics, defence deals, Kashmir, diplomacy, cricket & human welfare',
    categories: [
      {
        code: 'A',
        title: 'Post-Colonial State',
        subtopics: [
          'Why India became centralized after 1947',
          'Nehruvian secularism vs Hindu nationalism',
          'Partition trauma and foreign policy',
          'India\'s constitutional development',
          'Federalism and state autonomy',
          'Pakistan and India\'s competing national identities'
        ]
      },
      {
        code: 'B',
        title: 'BJP vs Congress',
        subtopics: [
          'Congress dynasty and political decline',
          'BJP and Hindutva',
          'Secularism vs religious nationalism',
          'Election machinery and campaign funding',
          'Welfare politics and economic policies',
          'Political leadership and democratic institutions'
        ]
      },
      {
        code: 'C',
        title: 'RSS: The Invisible State',
        subtopics: [
          'RSS history and organizational structure',
          'Shakhas and ideological training',
          'RSS influence on BJP',
          'Minority perspectives',
          'Relationship with Muslims, Christians and Sikhs',
          'Influence on government and institutions'
        ]
      },
      {
        code: 'D',
        title: 'Caste and Social Hierarchy',
        subtopics: [
          'Brahminical hierarchy',
          'Dalit representation',
          'Ambedkar vs Gandhi',
          'Caste-based violence',
          'Reservation policies',
          'Caste and economic inequality'
        ]
      },
      {
        code: 'E',
        title: 'Corruption and Defence Deals',
        subtopics: [
          'Rafale controversy',
          'Tejas development',
          'Adani and political connections',
          'Electoral Bonds',
          'Defence procurement transparency',
          'Public expenditure and accountability'
        ]
      },
      {
        code: 'F',
        title: 'Socio-Ethnic Fault Lines',
        subtopics: [
          'North vs South',
          'Hindi imposition',
          'Tax contribution and resource distribution',
          'Delimitation',
          'Manipur and Nagaland',
          'Regional identity and language politics'
        ]
      },
      {
        code: 'G',
        title: 'Kashmir',
        subtopics: [
          'Article 370 removal',
          'Constitutional and international legal perspectives',
          'Human rights',
          'Communication restrictions',
          'Political representation',
          'India-Pakistan Kashmir dispute'
        ]
      },
      {
        code: 'H',
        title: 'Sikhs and Khalistan',
        subtopics: [
          'Operation Blue Star',
          '1984 anti-Sikh violence',
          'Sikh political representation',
          'Farmers\' protests',
          'Khalistan movement',
          'Canada, UK and US diplomatic tensions'
        ]
      },
      {
        code: 'I',
        title: 'India vs Neighbours',
        subtopics: [
          'India-Pakistan relations',
          'India-China border disputes',
          'India-Bangladesh relations',
          'India-Nepal relations',
          'Sri Lanka and Maldives',
          'SAARC decline',
          'BIMSTEC and QUAD',
          'China\'s regional influence'
        ]
      },
      {
        code: 'J',
        title: 'Diplomacy and Strategic Autonomy',
        subtopics: [
          'Russian oil imports',
          'US defence partnerships',
          'Non-Alignment 2.0',
          'BRICS and SCO',
          'India\'s global power ambitions',
          'Strategic autonomy vs opportunism'
        ]
      },
      {
        code: 'K',
        title: 'Cricket and Sports Diplomacy',
        subtopics: [
          'BCCI financial influence',
          'IPL economics',
          'Asia Cup controversies',
          'India-Pakistan cricket relations',
          'Cricket and nationalism',
          'Sports boycotts',
          'International cricket revenue'
        ]
      },
      {
        code: 'L',
        title: 'Development Comparisons',
        subtopics: [
          'India vs China vs Bangladesh vs Pakistan',
          'GDP and GDP per capita',
          'Poverty and inequality',
          'Public debt',
          'Hunger and nutrition',
          'Employment',
          'HDI',
          'Healthcare and education',
          'Infrastructure and manufacturing'
        ]
      },
      {
        code: 'M',
        title: 'Weapons vs Human Welfare',
        subtopics: [
          'Defence budget vs public welfare priorities',
          'Nuclear deterrence vs poverty',
          'Fighter jets vs public hospitals',
          'Submarines vs clean drinking water',
          'Missiles vs child malnutrition',
          '340 nuclear warheads vs classrooms',
          'Border radars vs farmer crises',
          'Military pensions vs rural healthcare'
        ]
      },
      {
        code: 'N',
        title: 'Economy and Finance',
        subtopics: [
          'GDP growth and purchasing power',
          'Inflation and currency dynamics',
          'Public debt and taxation reform',
          'Foreign direct investment flows',
          'Export diversification and industrial policy',
          'Remittance stability and foreign reserves',
          'Poverty and income distribution'
        ]
      },
      {
        code: 'O',
        title: 'Science and Technology',
        subtopics: [
          'Software exports and IT services',
          'IT freelancing and global gig economy',
          'Artificial intelligence adoption and research',
          'Semiconductor manufacturing ambitions',
          'Space exploration and satellite capabilities',
          'Biotechnology and agricultural science',
          'Startup ecosystem and venture funding',
          'Digital public infrastructure and fintech'
        ]
      },
      {
        code: 'P',
        title: 'Education and Human Development',
        subtopics: [
          'STEM graduate output and female literacy',
          'University research and global rankings',
          'Technical education and vocational training',
          'Healthcare infrastructure and life expectancy',
          'Child malnutrition and human capital index',
          'Brain drain and skilled talent mobility'
        ]
      },
      {
        code: 'Q',
        title: 'Infrastructure and Natural Resources',
        subtopics: [
          'Renewable energy and solar transition',
          'Water management and Indus Basin hydrology',
          'Reko Diq copper-gold and Thar coal mining',
          'Highway corridors and regional connectivity',
          'Port infrastructure: Gwadar vs Chabahar vs Nhava Sheva',
          'High-speed rail and urban mass transit'
        ]
      },
      {
        code: 'R',
        title: 'Pakistan Achievements and Untapped Potential',
        subtopics: [
          'Global freelance software ranking and IT talent',
          'Sialkot surgical instruments and FIFA football manufacturing',
          'Strategic transit geography connecting Central to South Asia',
          'Young demographic dividend and entrepreneurial resilience',
          'Diaspora remittances and global economic footprint',
          'Local defense hardware engineering and JF-17 export success'
        ]
      },
      {
        code: 'S',
        title: 'General South Asian Realities',
        subtopics: [
          'Shared climate vulnerability and glacial melting',
          'Transboundary smog and winter air quality crises',
          'Intra-regional trade potential vs political barriers',
          'Cross-border water security under Indus Waters Treaty',
          'Youth unemployment and digital skill transition'
        ]
      }
    ],
    subtopics: [
      'Why India became centralized after 1947',
      'Nehruvian secularism vs Hindu nationalism',
      'Partition trauma and foreign policy',
      'India\'s constitutional development',
      'Federalism and state autonomy',
      'Pakistan and India\'s competing national identities',
      'Congress dynasty and political decline',
      'BJP and Hindutva',
      'Secularism vs religious nationalism',
      'Election machinery and campaign funding',
      'Welfare politics and economic policies',
      'Political leadership and democratic institutions',
      'RSS history and organizational structure',
      'Shakhas and ideological training',
      'RSS influence on BJP',
      'Minority perspectives',
      'Relationship with Muslims, Christians and Sikhs',
      'Influence on government and institutions',
      'Brahminical hierarchy',
      'Dalit representation',
      'Ambedkar vs Gandhi',
      'Caste-based violence',
      'Reservation policies',
      'Caste and economic inequality',
      'Rafale controversy',
      'Tejas development',
      'Adani and political connections',
      'Electoral Bonds',
      'Defence procurement transparency',
      'Public expenditure and accountability',
      'North vs South',
      'Hindi imposition',
      'Tax contribution and resource distribution',
      'Delimitation',
      'Manipur and Nagaland',
      'Regional identity and language politics',
      'Article 370 removal',
      'Constitutional and international legal perspectives',
      'Human rights',
      'Communication restrictions',
      'Political representation',
      'India-Pakistan Kashmir dispute',
      'Operation Blue Star',
      '1984 anti-Sikh violence',
      'Sikh political representation',
      'Farmers\' protests',
      'Khalistan movement',
      'Canada, UK and US diplomatic tensions',
      'India-Pakistan relations',
      'India-China border disputes',
      'India-Bangladesh relations',
      'India-Nepal relations',
      'Sri Lanka and Maldives',
      'SAARC decline',
      'BIMSTEC and QUAD',
      'China\'s regional influence',
      'Russian oil imports',
      'US defence partnerships',
      'Non-Alignment 2.0',
      'BRICS and SCO',
      'India\'s global power ambitions',
      'Strategic autonomy vs opportunism',
      'BCCI financial influence',
      'IPL economics',
      'Asia Cup controversies',
      'India-Pakistan cricket relations',
      'Cricket and nationalism',
      'Sports boycotts',
      'International cricket revenue',
      'India vs China vs Bangladesh vs Pakistan',
      'GDP and GDP per capita',
      'Poverty and inequality',
      'Public debt',
      'Hunger and nutrition',
      'Employment',
      'HDI',
      'Healthcare and education',
      'Infrastructure and manufacturing',
      'Defence budget vs public welfare priorities',
      'Nuclear deterrence vs poverty',
      'Fighter jets vs public hospitals',
      'Submarines vs clean drinking water',
      'Missiles vs child malnutrition',
      'GDP growth and purchasing power',
      'Inflation and currency dynamics',
      'Public debt and taxation reform',
      'Foreign direct investment flows',
      'Export diversification and industrial policy',
      'Remittance stability and foreign reserves',
      'Poverty and income distribution',
      'Software exports and IT services',
      'IT freelancing and global gig economy',
      'Artificial intelligence adoption and research',
      'Semiconductor manufacturing ambitions',
      'Space exploration and satellite capabilities',
      'Biotechnology and agricultural science',
      'Startup ecosystem and venture funding',
      'Digital public infrastructure and fintech',
      'STEM graduate output and female literacy',
      'University research and global rankings',
      'Technical education and vocational training',
      'Healthcare infrastructure and life expectancy',
      'Child malnutrition and human capital index',
      'Brain drain and skilled talent mobility',
      'Renewable energy and solar transition',
      'Water management and Indus Basin hydrology',
      'Reko Diq copper-gold and Thar coal mining',
      'Highway corridors and regional connectivity',
      'Port infrastructure: Gwadar vs Chabahar vs Nhava Sheva',
      'High-speed rail and urban mass transit',
      'Global freelance software ranking and IT talent',
      'Sialkot surgical instruments and FIFA football manufacturing',
      'Strategic transit geography connecting Central to South Asia',
      'Young demographic dividend and entrepreneurial resilience',
      'Diaspora remittances and global economic footprint',
      'Local defense hardware engineering and JF-17 export success',
      'Shared climate vulnerability and glacial melting',
      'Transboundary smog and winter air quality crises',
      'Intra-regional trade potential vs political barriers',
      'Cross-border water security under Indus Waters Treaty',
      'Youth unemployment and digital skill transition'
    ],
    keywords: [
      'India vs Pakistan',
      'Defence budget vs public welfare',
      'Nuclear deterrence vs poverty',
      'Fighter jets vs public hospitals',
      'Submarines vs clean drinking water',
      'Missiles vs child malnutrition',
      'Weapons vs school education',
      'Post-colonial state centralization',
      'BJP Hindutva vs Congress secularism',
      'RSS shakhas and institutional influence',
      'Caste hierarchy and Dalit representation',
      'Rafale Tejas and Electoral Bonds',
      'North vs South federal tax split',
      'Article 370 and Kashmir status',
      'Sikhs Khalistan and farmer protests',
      'India China Nepal Bangladesh relations',
      'Russian oil and strategic autonomy',
      'BCCI IPL cricket diplomacy',
      'South Asia GDP HDI development comparison'
    ]
  },
  {
    id: 'GEOPOLITICS',
    name: 'Geopolitics & Global Power',
    description: 'China vs USA, Russia and Ukraine, Middle East, international trade, critical choke points and sanctions',
    subtopics: [
      'US-China semiconductor and advanced chip embargo',
      'Taiwan Strait and global microchip supply security',
      'Strait of Malacca, Red Sea and maritime choke points',
      'De-dollarization and bilateral local currency trade',
      'BRICS expansion and Global South alternative finance',
      'Red Sea maritime trade disruptions and global freight rates',
      'Iran-Saudi reconciliation and Middle East power shifts',
      'Rare earth mineral supply dominance and export controls',
      'Arctic shipping routes and Russian icebreaker fleet',
      'NATO expansion and European rearmament budgets'
    ],
    keywords: [
      'India vs Pakistan',
      'China vs USA',
      'Iran and oil trade',
      'Russia and Ukraine',
      'Middle East conflicts',
      'US military bases',
      'International trade and sanctions',
      'Global power competition',
      'Semiconductor chip embargo',
      'Taiwan Strait microchips',
      'Maritime choke points Malacca Red Sea',
      'De-dollarization currency settlements',
      'BRICS alternative financing',
      'Rare earth minerals dominance',
      'NATO defense spending'
    ]
  },
  {
    id: 'PAKISTAN_POLITICS',
    name: 'Pakistan Politics & Economy',
    description: 'Government spending, IMF loans, debt servicing, fiscal reform, civil-military dynamics and economic realities',
    subtopics: [
      'Energy sector circular debt and capacity payments crisis',
      'Civil-military economic council (SIFC) and investment policy',
      'Federal Board of Revenue tax-to-GDP ratio and elite exemptions',
      'National Finance Commission (NFC) award and provincial fiscal shares',
      'Privatization of loss-making state enterprises (PIA, Discos)',
      'Parliamentary accountability and judicial-executive friction',
      'Agricultural income tax implementation and feudal resistance',
      'Real estate speculation vs productive industrial development',
      'Debt servicing consuming over 50% of federal revenues',
      'Public development cuts during IMF austerity programs'
    ],
    keywords: [
      'Government spending',
      'IMF loans and economic pressure',
      'Defence budgets vs public welfare',
      'Education and healthcare spending',
      'Political families and power',
      'Civilian and military relations',
      'Democracy and accountability',
      'Circular debt capacity payments',
      'FBR tax exemptions elite capture',
      'NFC award provincial shares',
      'State enterprise privatization',
      'Agricultural income tax reform',
      'Real estate plot speculation'
    ]
  },
  {
    id: 'SOCIAL_ETHNIC_ISSUES',
    name: 'Social & Regional Issues',
    description: 'Regional resource distribution, ethnic voice, administrative fairness, and provincial development',
    subtopics: [
      'Balochistan resource royalties and political integration',
      'Merged tribal districts (ex-FATA) development and policing',
      'Sindh rural vs urban quota system and Karachi civic infrastructure',
      'Hazara community security and representation in Quetta',
      'Gilgit-Baltistan constitutional status and regional representation',
      'Pashtun Tahafuz Movement and civil rights dialogue',
      'Internal climate refugees and informal urban settlement rights',
      'Inter-provincial water sharing and Indus River System dispute',
      'South Punjab administrative division and resource allocation',
      'Mother tongue education policy and linguistic representation'
    ],
    keywords: [
      'Punjab, Sindh, Balochistan and KPK',
      'Unequal development',
      'Resource distribution',
      'Ethnic representation and voice',
      'National unity vs policy fairness',
      'Balochistan natural gas royalties',
      'Karachi revenue vs infrastructure spending',
      'Ex-FATA rehabilitation funding',
      'IRSA water accord disputes',
      'Gilgit-Baltistan constitutional rights',
      'Language policy in national schooling'
    ]
  },
  {
    id: 'AI_HUMAN_SOCIETY',
    name: 'AI & Human Society',
    description: 'AI replacing jobs, digital surveillance, data centre electricity and water consumption, algorithmic society',
    subtopics: [
      'Generative AI displacing South Asian BPO and call center jobs',
      'Autonomous military drones and algorithmic decision warfare',
      'Data center power consumption straining national electric grids',
      'Massive freshwater depletion for cooling AI GPU server farms',
      'Biometric surveillance, digital IDs and financial monitoring',
      'Algorithmic credit scoring and informal economy exclusion',
      'Deepfakes, election disinfo and synthetic political media',
      'Tech monopoly IP consolidation vs global open-source creators',
      'AI capital concentration vs labor wage share decline',
      'Developing nation healthcare access vs patented Western models'
    ],
    keywords: [
      'AI replacing human work',
      'Human dependence on AI',
      'Digital surveillance and government control',
      'Autonomous military weapons',
      'Data centres electricity and water consumption',
      'BPO call center job displacement',
      'AI freshwater cooling demands',
      'Biometric ID surveillance',
      'Synthetic media deepfakes elections',
      'Algorithmic credit scoring'
    ]
  },
  {
    id: 'CLIMATE_GLOBAL_POWER',
    name: 'Climate & Global Power',
    description: 'Loss and damage, emissions injustice, Indus Waters Treaty, cross-border smog, critical energy minerals',
    subtopics: [
      'Loss and Damage fund: promised billions vs disbursed realities',
      'Pakistan 2022 floods and historical emissions debt of G7',
      'Indus Waters Treaty under glacial retreat and climate volatility',
      'Transboundary smog crisis across Lahore, Amritsar and Delhi',
      'Global race for lithium, cobalt and nickel critical transition minerals',
      'Carbon border adjustment taxes as developed-world protectionism',
      'Heatwaves, wet-bulb thresholds and South Asian labor productivity',
      'Climate-driven internal displacement and urban slum strain',
      'Small island states sea-level rise and international legal rights',
      'Green energy debt traps and expensive transition conditionalities'
    ],
    keywords: [
      'Pakistan floods and climate damage',
      'Global pollution and emissions',
      'Rich countries vs poor countries',
      'Climate funding promises vs reality',
      'Water shortages and rivers',
      'Loss and damage fund disbursement',
      'Indus Waters Treaty glacial melt',
      'Lahore Delhi transboundary smog',
      'Lithium cobalt supply control',
      'Wet-bulb temperature labor loss'
    ]
  },
  {
    id: 'SATIRICAL_COMMENTARY',
    name: 'Double-Meaning & Satirical Commentary',
    description: 'VIP protocols, luxury imports on loans, free electricity for rulers, austerity paradoxes, political ironies',
    subtopics: [
      'VIP protocol motorcades blocking citizen emergency ambulances',
      'Luxury bulletproof imported SUVs funded through emergency loans',
      'Free electricity units for ruling elites while consumers face cutoffs',
      'Austerity pledges and sacrifice appeals delivered from 5-star banquets',
      'Unemployed university graduates competing for court peon jobs',
      'National sovereignty declarations hours before IMF loan renewals',
      'Taxing salaried citizen milk and bread while exempting property cartels',
      'Independence Day fireworks spending vs emergency room medicine stocks',
      'Smart city tech conferences held during knee-deep monsoon flooding',
      'Foreign investment summits held while local mills close from tariffs'
    ],
    keywords: [
      'Sugar vs guns',
      'Political promises vs reality',
      'Rich nations vs poor nations',
      'Military spending vs public welfare',
      'Everyday life compared with international politics',
      'VIP protocol ambulance delays',
      'Imported luxury SUVs on debt',
      'Free electricity ruling elite',
      'Five-star austerity announcements',
      'Salaried tax vs property exemptions',
      'Monsoon flood smart city conferences'
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

  /**
   * Gets genre by ID
   * @param {string} genreId
   */
  getGenreById(genreId) {
    if (!genreId) return null;
    const clean = String(genreId).trim().toUpperCase();
    return this.getAllGenres().find(g => g.id.toUpperCase() === clean) || null;
  }

  /**
   * Retrieves all subtopics for a given genre ID
   * @param {string} genreId
   * @returns {string[]}
   */
  getSubtopicsForGenre(genreId) {
    const genre = this.getGenreById(genreId);
    if (!genre) return [];
    if (Array.isArray(genre.subtopics) && genre.subtopics.length > 0) {
      return [...genre.subtopics];
    }
    if (Array.isArray(genre.keywords) && genre.keywords.length > 0) {
      return [...genre.keywords];
    }
    return [genre.name];
  }

  /**
   * Returns the category code and metadata for a subtopic under PAK_VS_IND
   * @param {string} subtopic
   */
  getPakVsIndCategoryBySubtopic(subtopic = '') {
    if (!subtopic) return null;
    const clean = String(subtopic).toLowerCase().trim();
    const pakGenre = this.getGenreById('PAK_VS_IND');
    if (!pakGenre || !Array.isArray(pakGenre.categories)) return null;

    for (const cat of pakGenre.categories) {
      if (cat.title.toLowerCase().includes(clean) || clean.includes(cat.title.toLowerCase())) {
        return cat;
      }
      if (Array.isArray(cat.subtopics)) {
        if (cat.subtopics.some(s => {
          const sLower = s.toLowerCase().trim();
          return sLower === clean || clean.includes(sLower) || sLower.includes(clean);
        })) {
          return cat;
        }
      }
    }
    return null;
  }

  /**
   * Returns an unused subtopic from a genre, comparing against exhausted subtopics
   * @param {string} genreId
   * @param {string[]} usedSubtopics
   * @param {string} [excludedSubtopic]
   */
  getUnusedSubtopic(genreId, usedSubtopics = [], excludedSubtopic = '') {
    const all = this.getSubtopicsForGenre(genreId);
    if (all.length === 0) return '';

    const cleanUsed = (usedSubtopics || []).map(s => String(s).toLowerCase().trim());
    const cleanExcluded = String(excludedSubtopic || '').toLowerCase().trim();

    const unused = all.filter(s => {
      const lower = s.toLowerCase().trim();
      if (cleanExcluded && (lower === cleanExcluded || lower.includes(cleanExcluded) || cleanExcluded.includes(lower))) {
        return false;
      }
      return !cleanUsed.some(u => u === lower || (u.length > 8 && lower.includes(u)) || (lower.length > 8 && u.includes(lower)));
    });

    if (unused.length > 0) {
      return unused[Math.floor(Math.random() * unused.length)];
    }

    // If all used, filter out just the excluded one
    const eligible = cleanExcluded
      ? all.filter(s => s.toLowerCase().trim() !== cleanExcluded)
      : all;
    return eligible[Math.floor(Math.random() * (eligible.length || all.length))] || all[0];
  }
}

export const genreManager = new GenreManager();
