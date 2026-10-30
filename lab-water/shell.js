// Page shell for lab-water: the gear in the top-right corner, the settings drawer it
// opens, the view filters shared with the other labs, fullscreen and the failure screen.
// No rendering here; main.js owns the water.

const $ = (id) => document.getElementById(id);

export const FILTERS = {
  normal: 'none',
  night: 'grayscale(1) brightness(0.62) contrast(1.7)',
  thermal: 'url(#flir)',
  'thermal-game': 'grayscale(1) brightness(0.5) contrast(1.6) sepia(1) saturate(5) hue-rotate(-18deg)',
};
export const FILTER_KEYS = { Digit1: 'normal', Digit2: 'night', Digit3: 'thermal', Digit4: 'thermal-game' };

export function createShell() {
  const gear = $('gear'), drawer = $('drawer'), stage = $('stage');
  let open = false;

  function setOpen(v) {
    open = v;
    document.body.classList.toggle('drawer-open', open);
    gear.setAttribute('aria-expanded', String(open));
    if (open) drawer.removeAttribute('inert'); else drawer.setAttribute('inert', '');
  }
  gear.addEventListener('click', () => setOpen(!open));
  // a click on the water closes the drawer; clicks inside it (and on the gear) don't
  stage.addEventListener('pointerdown', () => { if (open) setOpen(false); });

  let filter = 'normal';
  function setFilter(name) {
    if (!(name in FILTERS)) return;
    filter = name;
    const canvas = stage.querySelector('canvas');
    if (canvas) canvas.style.filter = FILTERS[name];
    document.dispatchEvent(new CustomEvent('lab-filter', { detail: name }));
  }

  function toggleFullscreen() {
    const p = document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();
    p?.catch?.(() => {});
  }

  const typing = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable;
  document.addEventListener('keydown', (e) => {
    if (e.code === 'Escape' && open) { setOpen(false); gear.focus(); return; }
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.code === 'KeyF') toggleFullscreen();
    else if (e.code in FILTER_KEYS) setFilter(FILTER_KEYS[e.code]);
    else return;
    e.preventDefault();
  });

  function ready() { $('loading').classList.add('gone'); }
  function fail(message) {
    $('loading').hidden = true;
    $('failure-message').textContent = message;
    $('failure').hidden = false;
    $('gear-zone').hidden = true;
    window.__error = message;
  }
  function overlay(text) { const o = $('overlay'); o.hidden = !text; o.textContent = text || ''; }

  return { setOpen, isOpen: () => open, setFilter, getFilter: () => filter, toggleFullscreen, ready, fail, overlay };
}
