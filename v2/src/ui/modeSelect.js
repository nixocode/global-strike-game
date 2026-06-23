import { MODE_LIST } from '../data/modes.js';

/**
 * Renders the mode-select overlay. Resolves with the chosen mode profile.
 * Mounts into #overlay; tears itself down on choice.
 */
export function showModeSelect() {
  return new Promise((resolve) => {
    const overlay = document.getElementById('overlay');
    const cards = MODE_LIST.map(
      (m) => `
      <div class="mode-card ${m.id}" data-mode="${m.id}">
        <div class="mode-icon">${m.icon}</div>
        <div class="mode-tag">${m.tag}</div>
        <div class="mode-name">${m.name}</div>
        <div class="mode-desc">${m.desc}</div>
        <div class="mode-feats">
          ${m.feats.map((f) => `<div class="mode-feat">${f}</div>`).join('')}
        </div>
      </div>`
    ).join('');

    overlay.innerHTML = `
      <div class="overlay">
        <div class="card">
          <div class="eyebrow">Global Strike — Nuclear Strategy</div>
          <div class="title">Choose your war</div>
          <div class="subtitle">Two ways to end the world. One is a sober simulation of deterrence and consequence. The other shatters the planet for points.</div>
          <div class="mode-grid">${cards}</div>
        </div>
      </div>`;

    overlay.querySelectorAll('.mode-card').forEach((card) => {
      card.addEventListener('click', () => {
        const id = card.getAttribute('data-mode');
        const mode = MODE_LIST.find((m) => m.id === id);
        overlay.innerHTML = '';
        resolve(mode);
      });
    });
  });
}
