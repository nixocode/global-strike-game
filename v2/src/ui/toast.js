const host = () => document.getElementById('toasts');

export function toast(msg, kind = 'info', ms = 3200) {
  const c = host();
  if (!c) return;
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  c.appendChild(el);
  setTimeout(() => {
    el.classList.add('fading');
    setTimeout(() => el.remove(), 260);
  }, ms);
}
