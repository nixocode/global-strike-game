import { fmt } from '../sim/Simulation.js';
import { winterStage } from '../sim/winter.js';

const META = {
  victory: { title: 'VICTORY', sub: 'Enemies neutralized — Earth endures.', icon: '☢️', color: 'var(--green)' },
  pyrrhic: { title: 'PYRRHIC VICTORY', sub: 'You won the war and broke the world doing it.', icon: '☠️', color: 'var(--orange)' },
  apocalypse: { title: 'APOCALYPSE', sub: 'The Earth is uninhabitable. Nobody won.', icon: '🌍', color: 'var(--red)' },
  defeat: { title: 'DEFEAT', sub: 'Your nation has fallen.', icon: '☠️', color: 'var(--red)' },
};

export function showGameOver({ outcome, state, destroyed }) {
  const overlay = document.getElementById('overlay');
  const m = META[outcome] || META.defeat;
  const arcade = state.mode.id === 'arcade';
  const earthPct = Math.max(0, Math.round((1 - state.worldDestroyedFrac()) * 100));
  const earthColor = earthPct >= 70 ? 'var(--green)' : earthPct >= 45 ? 'var(--orange)' : 'var(--red)';
  const alive = state.player.cities.filter((c) => c.pop > 0).length;
  const wStage = winterStage(state.winterIndex);
  const wColor = state.winterIndex >= 0.7 ? 'var(--red)' : state.winterIndex >= 0.4 ? 'var(--orange)' : 'var(--yellow)';

  const rows = state.nations
    .filter((n) => n.casualties > 0)
    .sort((a, b) => b.casualties - a.casualties)
    .map((n) => {
      const dead = destroyed.has(n.id);
      const you = n === state.player ? '<span style="color:var(--blue)">YOU</span> ' : '';
      return `<div class="go-row"><span>${you}${n.flag} ${n.name}</span>
        <span><b style="color:var(--red)">${fmt(n.casualties)}</b>
        <span class="mono" style="font-size:8px;letter-spacing:1px;color:${dead ? 'var(--red)' : 'var(--text3)'}">${dead ? 'DESTROYED' : 'SURVIVED'}</span></span></div>`;
    })
    .join('');

  overlay.innerHTML = `
    <div class="overlay"><div class="card" style="max-width:560px;text-align:center">
      <div style="font-size:50px">${m.icon}</div>
      <div class="title" style="color:${m.color}">${m.title}</div>
      <div class="subtitle" style="margin:0 auto 18px">${m.sub}</div>
      ${arcade ? `<div class="mono" style="font-size:13px;color:var(--text3);letter-spacing:2px">FINAL SCORE</div>
        <div class="mono" style="font-size:42px;font-weight:700;color:var(--yellow);margin-bottom:18px">${state.score.toLocaleString()}</div>` : ''}
      <div class="go-stats">
        <div class="go-stat"><div class="v" style="color:${earthColor}">${earthPct}%</div><div class="l">Earth Intact</div></div>
        <div class="go-stat"><div class="v" style="color:var(--red)">${fmt(state.totalKills)}</div><div class="l">Casualties</div></div>
        <div class="go-stat"><div class="v" style="color:var(--accent2)">${state.turn}</div><div class="l">Turns</div></div>
        <div class="go-stat"><div class="v" style="color:var(--green)">${alive}/${state.player.cities.length}</div><div class="l">Cities Left</div></div>
        ${arcade ? '' : `<div class="go-stat"><div class="v" style="color:${wColor};text-transform:uppercase">${wStage}</div><div class="l">Nuclear Winter</div></div>`}
      </div>
      <div class="go-breakdown">${rows}</div>
      <button class="btn primary" style="width:100%;margin-top:18px" onclick="location.reload()">Play again</button>
    </div></div>`;
}
