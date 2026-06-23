/**
 * Strategic doctrines. Shape both the player's stats and the AI Commander's behaviour.
 * `aggression` (0..1) and `restraint` (0..1) feed the AI valuation; multipliers tune combat.
 */
export const DOCTRINES = [
  {
    id: 'mad',
    name: 'Mutual Assured Destruction',
    short: 'MAD',
    desc: 'Balanced retaliation. Strong second strike, measured escalation.',
    bonus: '+30% defense · reliable second strike',
    defenseMul: 1.3,
    yieldMul: 1.0,
    interceptBonus: 0.0,
    aggression: 0.4,
    restraint: 0.7,
  },
  {
    id: 'first',
    name: 'First Strike',
    short: 'First Strike',
    desc: 'Pre-emptive doctrine. Heavier warheads, thinner defenses, hits early.',
    bonus: '+50% yield · −15% defense',
    defenseMul: 0.85,
    yieldMul: 1.5,
    interceptBonus: 0.0,
    aggression: 0.9,
    restraint: 0.2,
  },
  {
    id: 'fortress',
    name: 'Fortress',
    short: 'Fortress',
    desc: 'Layered missile defense. Survive the storm, then dictate terms.',
    bonus: '+25% intercept across all layers',
    defenseMul: 1.15,
    yieldMul: 1.0,
    interceptBonus: 0.25,
    aggression: 0.3,
    restraint: 0.8,
  },
  {
    id: 'flexible',
    name: 'Flexible Response',
    short: 'Flexible',
    desc: 'Adaptable posture, a modest edge across every system.',
    bonus: '+15% everything',
    defenseMul: 1.15,
    yieldMul: 1.15,
    interceptBonus: 0.1,
    aggression: 0.55,
    restraint: 0.55,
  },
];

export const doctrineById = (id) => DOCTRINES.find((d) => d.id === id) || DOCTRINES[0];
