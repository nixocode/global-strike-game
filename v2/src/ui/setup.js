import { NATIONS } from '../data/nations.js';
import { DOCTRINES } from '../data/doctrines.js';

/**
 * Setup overlay: choose nation + doctrine. Resolves { nationId, doctrineId }.
 */
export function showSetup(mode) {
  return new Promise((resolve) => {
    const overlay = document.getElementById('overlay');
    let nationId = null;
    let doctrineId = null;

    const nationCards = NATIONS.map((n) => {
      const total = n.arsenal.icbm + n.arsenal.slbm + n.arsenal.bomber;
      return `<div class="pick nation" data-id="${n.id}">
        <div class="pick-flag">${n.flag}</div>
        <div class="pick-name">${n.name}</div>
        <div class="pick-meta mono">${total} warheads · ${n.cities.length} cities</div>
      </div>`;
    }).join('');

    const doctrineCards = DOCTRINES.map(
      (d) => `<div class="pick doctrine" data-id="${d.id}">
        <div class="pick-name">${d.short}</div>
        <div class="pick-desc">${d.desc}</div>
        <div class="pick-bonus mono">${d.bonus}</div>
      </div>`
    ).join('');

    overlay.innerHTML = `
      <div class="overlay"><div class="card setup-card">
        <div class="eyebrow">${mode.icon} ${mode.name} mode</div>
        <div class="title" style="font-size:30px">Command setup</div>
        <div class="setup-section-title mono">1 — Choose your nation</div>
        <div class="pick-grid nations">${nationCards}</div>
        <div class="setup-section-title mono">2 — Choose your doctrine</div>
        <div class="pick-grid doctrines">${doctrineCards}</div>
        <button class="btn primary begin" disabled style="margin-top:22px;width:100%">Begin operations</button>
      </div></div>`;

    const begin = overlay.querySelector('.begin');
    const sync = () => { begin.disabled = !(nationId && doctrineId); };

    overlay.querySelectorAll('.pick.nation').forEach((el) =>
      el.addEventListener('click', () => {
        nationId = el.dataset.id;
        overlay.querySelectorAll('.pick.nation').forEach((x) => x.classList.toggle('sel', x === el));
        sync();
      })
    );
    overlay.querySelectorAll('.pick.doctrine').forEach((el) =>
      el.addEventListener('click', () => {
        doctrineId = el.dataset.id;
        overlay.querySelectorAll('.pick.doctrine').forEach((x) => x.classList.toggle('sel', x === el));
        sync();
      })
    );
    begin.addEventListener('click', () => {
      if (begin.disabled) return;
      overlay.innerHTML = '';
      resolve({ nationId, doctrineId });
    });
  });
}
