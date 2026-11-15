// backend/utils/porutham.js
// 10 Porutham (Tamil horoscope matching) from the girl's and boy's NAKSHATRA + RASI.
// Names can be typed in English or Tamil, in many spellings ("Thiruvathirai", "Ardra", "திருவாதிரை" ...).
// Result is INDICATIVE only – the UI tells people to confirm with their family astrologer.

// ---- 27 nakshatras in order: [canonical, tamil, gana, yoni, rajju, aliases...] ----
const N = [
  ['Ashwini', 'அஸ்வினி', 'D', 'horse', 'pada', 'aswini', 'ashvini'],
  ['Bharani', 'பரணி', 'M', 'elephant', 'kati', 'parani'],
  ['Krittika', 'கார்த்திகை', 'R', 'sheep', 'nabhi', 'karthigai', 'karthika', 'kartika', 'karthikai', 'kiruthigai'],
  ['Rohini', 'ரோகிணி', 'M', 'serpent', 'kantha', 'rohinie'],
  ['Mrigashira', 'மிருகசீரிஷம்', 'D', 'serpent', 'siro', 'mrigasira', 'mirugasirisham', 'mrigashirsha', 'mirugaseerisham', 'mrigasheersha', 'makayiram'],
  ['Ardra', 'திருவாதிரை', 'M', 'dog', 'kantha', 'thiruvathirai', 'arudra', 'thiruvadhirai', 'aadra', 'ardhra'],
  ['Punarvasu', 'புனர்பூசம்', 'D', 'cat', 'nabhi', 'punarpoosam', 'punarpusam', 'punarpoosham'],
  ['Pushya', 'பூசம்', 'D', 'sheep', 'kati', 'poosam', 'pusam', 'pooyam', 'pushyami'],
  ['Ashlesha', 'ஆயில்யம்', 'R', 'cat', 'pada', 'ayilyam', 'aayilyam', 'aslesha', 'ayilyam'],
  ['Magha', 'மகம்', 'R', 'rat', 'pada', 'makam', 'magam', 'maham', 'magham'],
  ['Purva Phalguni', 'பூரம்', 'M', 'rat', 'kati', 'pooram', 'purvaphalguni', 'puram', 'pubba'],
  ['Uttara Phalguni', 'உத்திரம்', 'M', 'cow', 'nabhi', 'uthiram', 'uttaraphalguni', 'uttiram'],
  ['Hasta', 'அஸ்தம்', 'D', 'buffalo', 'kantha', 'hastham', 'astham', 'atham', 'hastha'],
  ['Chitra', 'சித்திரை', 'R', 'tiger', 'siro', 'chithirai', 'chithra', 'chitrai'],
  ['Swati', 'சுவாதி', 'D', 'buffalo', 'kantha', 'swathi', 'svati', 'suvathi', 'chothi'],
  ['Vishakha', 'விசாகம்', 'R', 'tiger', 'nabhi', 'visakam', 'visakha', 'vishaakam'],
  ['Anuradha', 'அனுஷம்', 'D', 'deer', 'kati', 'anusham', 'anuradham', 'anizham'],
  ['Jyeshtha', 'கேட்டை', 'R', 'deer', 'pada', 'kettai', 'jyestha', 'jyeshta', 'kettaii', 'thrikketta'],
  ['Moola', 'மூலம்', 'R', 'dog', 'pada', 'moolam', 'mula', 'mulam'],
  ['Purva Ashadha', 'பூராடம்', 'M', 'monkey', 'kati', 'pooradam', 'purvashadha', 'purvashada', 'purvaashada', 'puradam'],
  ['Uttara Ashadha', 'உத்திராடம்', 'M', 'mongoose', 'nabhi', 'uthiradam', 'uttarashadha', 'uttarashada', 'uttaraashada', 'uthradam'],
  ['Shravana', 'திருவோணம்', 'D', 'monkey', 'kantha', 'thiruvonam', 'sravana', 'shravanam', 'thiruvonam', 'onam'],
  ['Dhanishta', 'அவிட்டம்', 'R', 'lion', 'siro', 'avittam', 'dhanishtha', 'dhanista', 'sravishta', 'shravishta'],
  ['Shatabhisha', 'சதயம்', 'R', 'horse', 'kantha', 'sadayam', 'sathayam', 'satabhisha', 'shatabhishak', 'satabhisham', 'chathayam'],
  ['Purva Bhadrapada', 'பூரட்டாதி', 'M', 'lion', 'nabhi', 'poorattathi', 'purvabhadra', 'purvabhadrapada', 'poorattadhi', 'pururuttathi'],
  ['Uttara Bhadrapada', 'உத்திரட்டாதி', 'M', 'cow', 'kati', 'uthirattathi', 'uttarabhadra', 'uttarabhadrapada', 'uthirattadhi', 'uthrattathi'],
  ['Revati', 'ரேவதி', 'D', 'elephant', 'pada', 'revathi', 'reavathi'],
];

// ---- 12 rasis: [canonical, tamil, lord, aliases...] ----
const R = [
  ['Mesha', 'மேஷம்', 'mars', 'mesham', 'aries'],
  ['Rishabha', 'ரிஷபம்', 'venus', 'rishabam', 'vrishabha', 'vrushabha', 'taurus', 'edavam'],
  ['Mithuna', 'மிதுனம்', 'mercury', 'mithunam', 'gemini'],
  ['Kataka', 'கடகம்', 'moon', 'katagam', 'kadagam', 'kadaka', 'karkataka', 'karkadaka', 'cancer'],
  ['Simha', 'சிம்மம்', 'sun', 'simmam', 'simham', 'leo'],
  ['Kanya', 'கன்னி', 'mercury', 'kanni', 'virgo'],
  ['Thula', 'துலாம்', 'venus', 'thulam', 'tula', 'libra'],
  ['Vrischika', 'விருச்சிகம்', 'mars', 'viruchigam', 'vrischikam', 'viruchika', 'vrichika', 'scorpio'],
  ['Dhanus', 'தனுசு', 'jupiter', 'dhanusu', 'dhanush', 'danus', 'sagittarius'],
  ['Makara', 'மகரம்', 'saturn', 'magaram', 'makaram', 'capricorn'],
  ['Kumbha', 'கும்பம்', 'saturn', 'kumbam', 'kumbham', 'aquarius'],
  ['Meena', 'மீனம்', 'jupiter', 'meenam', 'pisces'],
];

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z஀-௿]+/g, '');

function buildIndex(table, firstAliasAt) {
  const idx = new Map();
  table.forEach((row, i) => {
    idx.set(norm(row[0]), i);
    idx.set(norm(row[1]), i);
    row.slice(firstAliasAt).forEach((a) => idx.set(norm(a), i));
  });
  return idx;
}
const N_IDX = buildIndex(N, 5);
const R_IDX = buildIndex(R, 3);

function lookup(idx, text) {
  const t = norm(text);
  if (!t) return -1;
  if (idx.has(t)) return idx.get(t);
  // "Rohini 2nd pada", "Rohini (2)" -> longest known name at the start
  let best = -1, bestLen = 0;
  for (const [k, v] of idx) if (t.startsWith(k) && k.length > bestLen) { best = v; bestLen = k.length; }
  return best;
}
export const nakshatraIndex = (t) => lookup(N_IDX, t);
export const rasiIndex = (t) => lookup(R_IDX, t);

// ---- tables ----
const ENEMY_YONI = [['cow', 'tiger'], ['elephant', 'lion'], ['horse', 'buffalo'], ['dog', 'deer'], ['serpent', 'mongoose'], ['monkey', 'sheep'], ['cat', 'rat']];
const VEDHA = [[0, 17], [1, 16], [2, 15], [3, 14], [5, 21], [6, 20], [7, 19], [8, 18], [9, 26], [10, 25], [11, 24], [12, 23], [4, 13], [4, 22], [13, 22]];
const FRIENDS = {
  sun: ['moon', 'mars', 'jupiter'], moon: ['sun', 'mercury'], mars: ['sun', 'moon', 'jupiter'],
  mercury: ['sun', 'venus'], jupiter: ['sun', 'moon', 'mars'], venus: ['mercury', 'saturn'], saturn: ['mercury', 'venus'],
};
const ENEMIES = {
  sun: ['venus', 'saturn'], moon: [], mars: ['mercury'], mercury: ['moon'],
  jupiter: ['mercury', 'venus'], venus: ['sun', 'moon'], saturn: ['sun', 'moon', 'mars'],
};
// rasi index (0-11) -> rasis that are "vasya" (attracted) to it
const VASYA = { 0: [4, 7], 1: [3, 6], 2: [5], 3: [7, 8], 4: [6], 5: [11, 2], 6: [5, 9], 7: [3], 8: [11], 9: [0, 10], 10: [0], 11: [9] };

const pairIn = (list, a, b) => list.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

// g / b = nakshatra index (0-26) of girl / boy ; gr / br = rasi index (0-11) of girl / boy
export function computePoruthams(g, b, gr, br) {
  const dist = ((b - g + 27) % 27) + 1; // count from girl's star to boy's star
  const rdist = ((br - gr + 12) % 12) + 1;
  const gGana = N[g][2], bGana = N[b][2];
  const gY = N[g][3], bY = N[b][3];
  const lordG = R[gr][2], lordB = R[br][2];

  const res = [];
  const add = (key, en, ta, ok, note) => res.push({ key, en, ta, ok: !!ok, note });

  add('dina', 'Dina', 'தினம்', [2, 4, 6, 8, 0].includes(dist % 9), 'Health & daily harmony');
  add('gana', 'Gana', 'கணம்', gGana === bGana || (gGana !== 'R' && bGana !== 'R'), 'Temperament');
  add('mahendra', 'Mahendra', 'மகேந்திரம்', [4, 7, 10, 13, 16, 19, 22, 25].includes(dist), 'Children & family growth');
  add('stree_deergha', 'Stree Deergha', 'ஸ்திரீ தீர்க்கம்', dist > 13, 'Prosperity & wellbeing of the bride');
  add('yoni', 'Yoni', 'யோனி', !pairIn(ENEMY_YONI, gY, bY), 'Physical & emotional compatibility');
  add('rasi', 'Rasi', 'ராசி', ![2, 6, 8, 12].includes(rdist), 'Family continuity');
  add('rasi_adhipathi', 'Rasi Adhipathi', 'ராசி அதிபதி', lordG === lordB || (!ENEMIES[lordG].includes(lordB) && !ENEMIES[lordB].includes(lordG)), 'Bond between the rasi lords');
  add('vasya', 'Vasya', 'வசியம்', (VASYA[gr] || []).includes(br) || (VASYA[br] || []).includes(gr) || gr === br, 'Mutual attraction & understanding');
  add('rajju', 'Rajju', 'ரஜ்ஜு', N[g][4] !== N[b][4], 'Long married life (very important)');
  add('vedha', 'Vedha', 'வேதை', !pairIn(VEDHA, g, b), 'Freedom from affliction');
  return res;
}

export function matchPorutham(girl, boy) {
  const g = nakshatraIndex(girl.nakshatra), b = nakshatraIndex(boy.nakshatra);
  const gr = rasiIndex(girl.rasi), br = rasiIndex(boy.rasi);
  if (g < 0 || b < 0 || gr < 0 || br < 0) return { available: false, reason: 'unrecognized' };
  const items = computePoruthams(g, b, gr, br);
  const score = items.filter((i) => i.ok).length;
  const rajjuOk = items.find((i) => i.key === 'rajju').ok;
  let verdict = score >= 7 ? 'excellent' : score >= 5 ? 'average' : 'low';
  if (!rajjuOk && verdict === 'excellent') verdict = 'average';
  return {
    available: true, score, total: items.length, verdict, rajjuOk, items,
    girl: { nakshatra: N[g][0], nakshatra_ta: N[g][1], rasi: R[gr][0], rasi_ta: R[gr][1] },
    boy: { nakshatra: N[b][0], nakshatra_ta: N[b][1], rasi: R[br][0], rasi_ta: R[br][1] },
  };
}
export const _tables = { N, R, VEDHA };
