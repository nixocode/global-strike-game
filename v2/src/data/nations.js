/**
 * Nuclear powers. Arsenals are split across the triad (ICBM / SLBM / bomber) in
 * proportions that echo real force structure, scaled to playable counts.
 *
 *   icbm   — land silos: fast, accurate, but fixed/known locations
 *   slbm   — submarines: survivable second strike, hidden, slightly less accurate
 *   bomber — air leg: slow, recallable, interceptable, high yield
 *
 * defense layers are intercept probabilities applied in sequence:
 *   boost (rare) → midcourse → terminal. Saturation degrades them.
 */
export const NATIONS = [
  {
    id: 'usa', name: 'United States', flag: '🇺🇸', color: '#4488ff',
    arsenal: { icbm: 8, slbm: 12, bomber: 6 },
    defense: { boost: 0.05, midcourse: 0.30, terminal: 0.35 },
    doctrine: 'flexible',
    cities: [
      { name: 'New York', lat: 40.7, lng: -74.0, pop: 8300000 },
      { name: 'Los Angeles', lat: 34.1, lng: -118.2, pop: 3900000 },
      { name: 'Chicago', lat: 41.9, lng: -87.6, pop: 2700000 },
      { name: 'Houston', lat: 29.8, lng: -95.4, pop: 2300000 },
      { name: 'Washington DC', lat: 38.9, lng: -77.0, pop: 700000 },
    ],
  },
  {
    id: 'russia', name: 'Russia', flag: '🇷🇺', color: '#cc3333',
    arsenal: { icbm: 14, slbm: 10, bomber: 6 },
    defense: { boost: 0.04, midcourse: 0.26, terminal: 0.32 },
    doctrine: 'mad',
    cities: [
      { name: 'Moscow', lat: 55.8, lng: 37.6, pop: 12600000 },
      { name: 'St Petersburg', lat: 59.9, lng: 30.3, pop: 5400000 },
      { name: 'Novosibirsk', lat: 55.0, lng: 82.9, pop: 1600000 },
      { name: 'Yekaterinburg', lat: 56.8, lng: 60.6, pop: 1500000 },
    ],
  },
  {
    id: 'china', name: 'China', flag: '🇨🇳', color: '#ee4444',
    arsenal: { icbm: 10, slbm: 6, bomber: 2 },
    defense: { boost: 0.03, midcourse: 0.22, terminal: 0.30 },
    doctrine: 'mad',
    cities: [
      { name: 'Beijing', lat: 39.9, lng: 116.4, pop: 21500000 },
      { name: 'Shanghai', lat: 31.2, lng: 121.5, pop: 24300000 },
      { name: 'Guangzhou', lat: 23.1, lng: 113.3, pop: 15300000 },
      { name: 'Shenzhen', lat: 22.5, lng: 114.1, pop: 12500000 },
    ],
  },
  {
    id: 'uk', name: 'United Kingdom', flag: '🇬🇧', color: '#3366cc',
    arsenal: { icbm: 0, slbm: 8, bomber: 0 }, // SLBM-only deterrent
    defense: { boost: 0.04, midcourse: 0.28, terminal: 0.34 },
    doctrine: 'mad',
    cities: [
      { name: 'London', lat: 51.5, lng: -0.1, pop: 9000000 },
      { name: 'Birmingham', lat: 52.5, lng: -1.9, pop: 1100000 },
      { name: 'Manchester', lat: 53.5, lng: -2.2, pop: 550000 },
    ],
  },
  {
    id: 'france', name: 'France', flag: '🇫🇷', color: '#2255bb',
    arsenal: { icbm: 0, slbm: 7, bomber: 3 },
    defense: { boost: 0.04, midcourse: 0.26, terminal: 0.32 },
    doctrine: 'flexible',
    cities: [
      { name: 'Paris', lat: 48.9, lng: 2.3, pop: 2200000 },
      { name: 'Marseille', lat: 43.3, lng: 5.4, pop: 870000 },
      { name: 'Lyon', lat: 45.8, lng: 4.8, pop: 520000 },
    ],
  },
  {
    id: 'india', name: 'India', flag: '🇮🇳', color: '#ff8800',
    arsenal: { icbm: 5, slbm: 3, bomber: 4 },
    defense: { boost: 0.02, midcourse: 0.16, terminal: 0.24 },
    doctrine: 'mad',
    cities: [
      { name: 'Mumbai', lat: 19.1, lng: 72.9, pop: 20700000 },
      { name: 'Delhi', lat: 28.6, lng: 77.2, pop: 16800000 },
      { name: 'Bangalore', lat: 12.97, lng: 77.6, pop: 8400000 },
      { name: 'Chennai', lat: 13.1, lng: 80.3, pop: 4600000 },
    ],
  },
  {
    id: 'pakistan', name: 'Pakistan', flag: '🇵🇰', color: '#33aa44',
    arsenal: { icbm: 6, slbm: 1, bomber: 5 },
    defense: { boost: 0.01, midcourse: 0.12, terminal: 0.20 },
    doctrine: 'first',
    cities: [
      { name: 'Karachi', lat: 24.9, lng: 67.1, pop: 14900000 },
      { name: 'Lahore', lat: 31.6, lng: 74.4, pop: 11100000 },
      { name: 'Islamabad', lat: 33.7, lng: 73.1, pop: 1100000 },
    ],
  },
  {
    id: 'israel', name: 'Israel', flag: '🇮🇱', color: '#4499ee',
    arsenal: { icbm: 2, slbm: 3, bomber: 1 },
    defense: { boost: 0.08, midcourse: 0.40, terminal: 0.50 }, // best layered defense
    doctrine: 'fortress',
    cities: [
      { name: 'Tel Aviv', lat: 32.1, lng: 34.8, pop: 460000 },
      { name: 'Jerusalem', lat: 31.8, lng: 35.2, pop: 940000 },
      { name: 'Haifa', lat: 32.8, lng: 35.0, pop: 280000 },
    ],
  },
  {
    id: 'nkorea', name: 'North Korea', flag: '🇰🇵', color: '#aa2222',
    arsenal: { icbm: 4, slbm: 1, bomber: 0 },
    defense: { boost: 0.0, midcourse: 0.08, terminal: 0.14 },
    doctrine: 'first',
    cities: [
      { name: 'Pyongyang', lat: 39.0, lng: 125.8, pop: 2870000 },
      { name: 'Hamhung', lat: 39.9, lng: 127.5, pop: 770000 },
    ],
  },
  {
    id: 'iran', name: 'Iran', flag: '🇮🇷', color: '#44aa66',
    arsenal: { icbm: 3, slbm: 0, bomber: 1 },
    defense: { boost: 0.0, midcourse: 0.10, terminal: 0.18 },
    doctrine: 'first',
    cities: [
      { name: 'Tehran', lat: 35.7, lng: 51.4, pop: 8700000 },
      { name: 'Isfahan', lat: 32.7, lng: 51.7, pop: 2000000 },
      { name: 'Mashhad', lat: 36.3, lng: 59.6, pop: 3000000 },
    ],
  },
];

/** Deep clone the static roster into a fresh mutable set of live nations. */
export function makeLiveNations() {
  return NATIONS.map((n) => ({
    id: n.id,
    name: n.name,
    flag: n.flag,
    color: n.color,
    doctrine: n.doctrine,
    arsenal: { ...n.arsenal },
    defense: { ...n.defense },
    cities: n.cities.map((c) => ({ ...c, pop0: c.pop })),
    casualties: 0,
  }));
}
