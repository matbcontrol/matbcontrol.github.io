/* core.js: UI controller (no deps, defer). Sea API: window 'sea' CustomEvent, detail = changed keys of window.SEA_STATE. */
'use strict';
(() => {
const d = document, R = d.documentElement, W = window, B = d.body, ds = R.dataset;
const $ = (s, c = d) => c.querySelector(s), $$ = (s, c = d) => [...c.querySelectorAll(s)];
const on = (t, e, f, o) => t && t.addEventListener(e, f, o);
const later = (f, ms) => setTimeout(f, ms), raf = f => requestAnimationFrame(f);
const txt = (el, v) => { if (el && el.textContent !== v) el.textContent = v; };
const put = (k, v) => $$(`[data-hud="${k}"]`).forEach(x => txt(x, v));
const tg = (el, c, v) => el && el.classList.toggle(c, v), has = (el, c) => el.classList.contains(c);
const kick = (el, c) => { if (el) { el.classList.remove(c); void el.offsetWidth; el.classList.add(c); } };
const pad = n => String(n).padStart(2, '0'), safe = f => { try { f(); } catch (e) { console.error(e); } };
const eIn = t => t * t * t, eOut = t => 1 - (1 - t) ** 4;
const mq = matchMedia('(prefers-reduced-motion: reduce)'), calm = () => mq.matches || ds.motion == 'reduced';
const IO = 'IntersectionObserver' in W, io = (f, o) => new IntersectionObserver(f, o);
const track = (set, es) => es.forEach(e => set[e.isIntersecting ? 'add' : 'delete'](e.target));
const DLG = typeof HTMLDialogElement == 'function' && 'showModal' in HTMLDialogElement.prototype;
const OG = has(R, 'og'), hero = $('#top'), opened = () => $('dialog[open]');
const arrow = (e, i, n, wrap) => {
  const j = { ArrowDown: i + 1, ArrowUp: i - 1, Home: 0, End: n - 1 }[e.key];
  if (i < 0 || j == null || e.altKey || e.ctrlKey || e.metaKey) return -1;
  e.preventDefault(); return wrap ? (j + n) % n : Math.max(0, Math.min(j, n - 1));
};
/* select on real mouse moves (layout shifts under a resting cursor must not steal a keyboard selection), touch/pen over, focus */
const hover = (el, f) => { on(el, 'pointermove', f, { passive: true }); on(el, 'pointerover', e => e.pointerType != 'mouse' && f(e)); on(el, 'focusin', f); };
R.classList.replace('no-js', 'js') || R.classList.add('js');

/* sea: frame 1-6, origin [u,v] (v up), mode blue|deep|night|red, lens [x,y,r] css px|null, grade, caustics, pause, hero, motion, shader */
const S = W.SEA_STATE = { frame: +(hero && hero.dataset.frame) || 2, origin: [.5, .5], mode: 'deep', lens: null,
  grade: 1, caustics: 1, pause: false, hero: true, motion: calm() ? 'reduced' : 'auto' };
const sea = o => { Object.assign(S, o); W.dispatchEvent(new CustomEvent('sea', { detail: o })); };
const halts = new Set(), halt = (k, v) => { halts[v ? 'add' : 'delete'](k); if (!!halts.size !== S.pause) sea({ pause: !!halts.size }); };
let cur = null, bench = false, heroIn = true;
const seaMode = s => ds.hour == 'zero' ? 'night' : s === hero ? 'blue' : { red: 'red', night: 'night' }[s.dataset.mode] || 'deep';
function syncSea() {
  const s = cur || hero; if (!s || bench) return;
  const o = {}, m = seaMode(s), f = +s.dataset.frame || 2;
  if (m !== S.mode) o.mode = m;
  if (f !== S.frame) { o.frame = f; o.origin = [.5, .5]; }
  if (o.mode || o.frame) sea(o);
}
if (hero) S.mode = seaMode(hero);
ds.mode = (hero && hero.dataset.mode) || 'blue';

/* settings (localStorage kartak.settings); MOTION only tightens the OS setting */
let cfg; try { cfg = JSON.parse(localStorage.getItem('kartak.settings')); } catch (e) {}
if (!cfg || typeof cfg != 'object') cfg = {};
if (cfg.motion == 'reduced') ds.motion = 'reduced';
if (cfg.shader == 'off') ds.sea = 'off';
const motion = () => calm() ? 'reduced' : 'auto';
const setUI = () => $$('[data-set]').forEach(b => { const [k, v] = b.dataset.set.split(':'); b.setAttribute('aria-pressed', v === (k == 'motion' ? motion() : cfg.shader == 'off' ? 'off' : 'on')); });
function setting(b) {
  const [k, v] = b.dataset.set.split(':'); cfg[k] = v;
  try { localStorage.setItem('kartak.settings', JSON.stringify(cfg)); } catch (e) {}
  if (k == 'motion') { if (v == 'reduced') ds.motion = v; else delete ds.motion; R.classList.remove('intro'); sea({ motion: motion(), lens: null }); }
  else if (v == 'off') { ds.sea = 'off'; sea({ shader: 'off' }); }
  else { if (ds.sea == 'off') delete ds.sea; sea({ shader: 'on' }); loadSea(); }
  setUI();
}
mq.addEventListener && on(mq, 'change', () => { setUI(); sea({ motion: motion(), lens: null }); });

/* HUD: date, time slot, Tbilisi clock, moon (toggles 00:00 mode) */
const DOW = 'Sun Mon Tue Wed Thu Fri Sat'.split(' ');
const PH = ['new moon', 'waxing crescent', 'first quarter', 'waxing gibbous', 'full moon', 'waning gibbous', 'last quarter', 'waning crescent'];
const slot = (h, we) => h == 0 ? '00:00' : h < 5 ? 'Late Night' : h < 8 ? 'Early Morning' : h < 12 ? 'Morning' : h < 13 ? 'Lunch Time'
  : h < 16 ? 'Afternoon' : h < 18 ? (we ? 'Daytime' : 'After School') : h < 22 ? 'Evening' : 'Late Night';
let tbs, zeroSet = null;
try { tbs = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Tbilisi', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); } catch (e) {}
const moonB = $('.hud__moon'), lit = $('.hud__moon-lit');
function setZero(v) { if (v) ds.hour = 'zero'; else delete ds.hour; moonB && moonB.setAttribute('aria-pressed', !!v); syncSea(); }
function hud() {
  const n = new Date(), h = n.getHours(), w = n.getDay(), we = w % 6 == 0;
  put('date', n.getMonth() + 1 + '/' + n.getDate()); put('dow', DOW[w]); put('slot', slot(h, we)); put('wm', we ? 'Weekend' : 'Weekday');
  if (!OG) { let t; try { t = tbs.format(n); } catch (e) { const u = new Date(+n + 144e5); t = pad(u.getUTCHours()) + ':' + pad(u.getUTCMinutes()); } put('tbs', ' · ' + t); }
  const z = $('.foot__zero'); if (z) z.hidden = h != 0;
  if (zeroSet === null && (h == 0) != (ds.hour == 'zero')) setZero(h == 0);
  const SYN = 29.530588853, p = ((((Date.now() - Date.UTC(2000, 0, 6, 18, 14)) / 864e5) % SYN + SYN) % SYN) / SYN;
  const c = Math.cos(2 * Math.PI * p), wax = p < .5;
  lit && lit.setAttribute('d', `M0 -20A20 20 0 0 ${+wax} 0 20A${(Math.abs(c) * 20).toFixed(2)} 20 0 0 ${(c > 0) === wax ? 0 : 1} 0 -20Z`);
  moonB && moonB.setAttribute('aria-label', `Moon: ${PH[Math.round(p * 8) % 8]}. Toggle 00:00 mode`);
}
safe(() => {
  moonB && moonB.setAttribute('aria-pressed', ds.hour == 'zero');
  hud(); setInterval(hud, 3e4); on(d, 'visibilitychange', () => d.hidden || hud());
  on(moonB, 'click', () => setZero(zeroSet = ds.hour != 'zero'));
  $$('[data-year]').forEach(x => txt(x, '' + new Date().getFullYear()));
  $$('.btn--copy,.foot__set').forEach(x => { x.hidden = false; });
  setUI();
});

/* compact HUD, rail, bottom bar, current section */
const hudEl = $('.hud'), rail = $('.rail'), bbar = $('.bbar'), ends = new Set();
function chrome() {
  tg(hudEl, 'hud--compact', !heroIn); tg(rail, 'is-open', !heroIn); tg(bbar, 'is-open', !heroIn && !ends.size);
  if (S.hero !== heroIn) sea(heroIn ? { hero: true } : { hero: false, lens: null });
}
function setCur(s) {
  if (s === cur) return; cur = s; ds.mode = s.dataset.mode || 'blue';
  const h = '#' + s.id, rl = $(`.rail__i[href="${h}"]`), lab = (rl && rl.dataset.label) || '';
  $$('.rail__i,.cmds--pause .cmd__a').forEach(a => a.getAttribute('href') == h ? a.setAttribute('aria-current', 'true') : a.removeAttribute('aria-current'));
  put('sec', lab); txt($('[data-rail="label"]'), lab.replace(/^\d+\s*/, ''));
  bench && s.id != 'tech-art' ? benchReset() : syncSea();
}
safe(() => {
  if (!IO) return;
  /* hero counts as in view while its bottom is below 40% of the viewport */
  hero && io(es => { heroIn = es[es.length - 1].isIntersecting; chrome(); }, { rootMargin: '-40% 0px 0px 0px' }).observe(hero);
  const eo = io(es => { track(ends, es); chrome(); }, { rootMargin: '0px 0px -15% 0px' });
  [$('#contact'), $('.foot')].forEach(x => x && eo.observe(x));
  const vis = new Set(), spy = io(es => {
    track(vis, es); let best, bt = -1e9;
    vis.forEach(s => { const t = s.getBoundingClientRect().top; if (t <= innerHeight / 2 && t > bt) { bt = t; best = s; } });
    best && setCur(best);
  }, { rootMargin: '-49% 0px -50% 0px' });
  $$('main > section[id]').forEach(s => spy.observe(s));
});

/* command menus: hero + pause clone */
let fT;
function frameSoon(a) {
  clearTimeout(fT);
  fT = later(() => {
    const f = +a.dataset.frame, r = a.getBoundingClientRect();
    if (f && !bench && (a.closest('dialog') || !cur || cur === hero)) sea({ frame: f, origin: [(r.left + r.width / 2) / innerWidth, 1 - (r.top + r.height / 2) / innerHeight] });
  }, 120);
}
function menu(nav, tip, isHero) {
  const sel = a => {
    const li = a.closest('.cmd'), fx = !calm(); if (!li || has(li, 'is-sel')) return;
    $$('.cmd', nav).forEach(x => tg(x, 'is-sel', x === li));
    if (tip) { txt($('[data-tip-out="t"]', tip), a.dataset.tip || ''); txt($('[data-tip-out="s"]', tip), a.dataset.sub || ''); fx && kick(tip, 'is-swap'); }
    if (isHero) { const ix = $('[data-idx]'); txt(ix, a.dataset.i || ''); if (fx) { kick(ix, 'is-drop'); hero.dataset.frame = a.dataset.frame; } }
    fx && frameSoon(a);
  };
  const pick = e => { const a = e.target.closest('.cmd__a'); a && sel(a); };
  hover(nav, pick);
  on(nav, 'keydown', e => { const l = $$('.cmd__a', nav), j = arrow(e, l.indexOf(d.activeElement), l.length, 1); j >= 0 && l[j].focus(); });
  return sel;
}
const heroSel = () => $('#menu .cmd.is-sel .cmd__a') || $('#menu .cmd__a');
const heroStep = k => { const l = $$('#menu .cmd__a'), i = l.indexOf(heroSel()); l.length && l[(i + k + l.length) % l.length].focus(); };
const pause = $('#pause');
let pauseSel;
safe(() => {
  const m = $('#menu'), ol = $('#menu > ol'), pn = pause && $('.cmds--pause', pause);
  hero && m && menu(m, $('.tip', hero), 1);
  if (ol && pn) { const c = ol.cloneNode(true); $$('.is-sel', c).forEach(x => tg(x, 'is-sel', false)); pn.append(c); pauseSel = menu(pn, $('.tip', pause)); }
});

/* dialogs; pause close animates only if CSS animates .is-closing */
function shut(dl) {
  if (!dl.open || has(dl, 'is-closing')) return;
  if (calm()) return dl.close();
  const a0 = getComputedStyle(dl).animationName;
  dl.classList.add('is-closing');
  const a1 = getComputedStyle(dl).animationName;
  if (a1 == 'none' || a1 == a0) return dl.close();
  let done;
  const fin = e => { if (done || (e && e.target != dl)) return; done = 1; dl.removeEventListener('animationend', fin); dl.close(); };
  on(dl, 'animationend', fin); later(fin, 450);
}
function openPause() {
  if (pause.open) return;
  pause.classList.remove('is-closing'); pause.showModal();
  const id = cur && cur !== hero ? cur.id : (heroSel() || { hash: '' }).hash.slice(1), a = $(`.cmd__a[href="#${id}"]`, pause) || $('.cmd__a', pause);
  if (a) { pauseSel && pauseSel(a); a.focus(); }
}
const show = (dl, el) => { dl._from = el; dl.showModal(); };
const back = dl => { const el = dl._from; dl._from = null; el && el.isConnected && el.getClientRects().length && el.focus({ preventScroll: true }); };
safe(() => {
  on(pause, 'cancel', e => { e.preventDefault(); shut(pause); });
  on(pause && $('.pause__x', pause), 'submit', e => { e.preventDefault(); shut(pause); });
  on(pause, 'close', () => { pause.classList.remove('is-closing'); syncSea(); });
});

/* video facades + #vdlg */
const vdlg = $('#vdlg'), srcdlg = $('#srcdlg'), ytVis = new Set();
const ytIO = IO && io(es => { track(ytVis, es); halt('yt', ytVis.size > 0); });
function ytFrame(id, title) {
  const f = d.createElement('iframe');
  f.src = 'https://www.youtube-nocookie.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0';
  f.title = title || 'Video';
  f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
  f.setAttribute('allowfullscreen', '');
  return f;
}
function ytInline(a) {
  const box = a.closest('.yt'), f = box && box.dataset.yt && ytFrame(box.dataset.yt, box.dataset.title);
  if (!f) return;
  box.textContent = ''; box.append(f); box.classList.add('is-live'); f.focus(); ytIO && ytIO.observe(f);
  return 1;
}
function openVideo(el) {
  const fr = vdlg && $('[data-vdlg="frame"]', vdlg); if (!fr || !el.dataset.yt) return;
  txt($('#vdlg-t'), el.dataset.title || 'Showreel');
  fr.textContent = ''; fr.append(ytFrame(el.dataset.yt, el.dataset.title));
  show(vdlg, el); halt('vdlg', 1);
  return 1;
}
function openSrc(el) {
  if (!srcdlg || !W.SEA_SRC) return;
  txt($('#srcdlg-code'), '' + W.SEA_SRC); mono(); show(srcdlg, el);
  return 1;
}
let pc;
safe(() => {
  $$('.yt__play').forEach(a => { a.removeAttribute('target'); a.removeAttribute('rel'); a.setAttribute('role', 'button'); $$('.nt', a).forEach(n => n.remove()); });
  const pre = e => { if (!pc && e.target.closest && e.target.closest('[data-yt]')) { pc = d.createElement('link'); pc.rel = 'preconnect'; pc.href = 'https://www.youtube-nocookie.com'; d.head.append(pc); } };
  on(d, 'pointerover', pre, { passive: true }); on(d, 'focusin', pre);
  on(vdlg, 'close', () => { $('[data-vdlg="frame"]', vdlg).textContent = ''; halt('vdlg'); back(vdlg); });
  on(srcdlg, 'close', () => back(srcdlg));
});

/* gallery + lightbox */
const rows = $$('.gal__row'), lb = $('#lb'), capOf = r => [($('b', r) || {}).textContent || '', ($('.gal__txt > span', r) || {}).textContent || ''];
let lbI = 0;
function galSel(r) {
  if (has(r, 'is-sel')) return;
  rows.forEach(x => tg(x, 'is-sel', x === r));
  const th = $('img', r), img = $('.gal__img'), c = capOf(r);
  if (img && th) { img.srcset = th.getAttribute('srcset') || ''; img.src = th.getAttribute('src'); img.setAttribute('height', th.getAttribute('height')); calm() || kick(img, 'is-swap'); }
  txt($('[data-gal="cap"]'), c[0]); txt($('[data-gal="sub"]'), c[1]);
}
function lbSet(i) {
  const n = rows.length, r = rows[lbI = (i + n) % n], th = $('img', r), img = $('[data-lb="img"]', lb), c = capOf(r);
  if (img) { img.src = r.getAttribute('href'); img.alt = th ? th.alt : ''; th && ['width', 'height'].forEach(k => img.setAttribute(k, th.getAttribute(k))); }
  txt($('[data-lb="cap"]', lb), c[0]); txt($('[data-lb="sub"]', lb), c[1]);
  txt($('[data-lb="num"]', lb), pad(lbI + 1)); txt($('[data-lb="i"]', lb), '' + (lbI + 1));
}
const lbGo = k => { lbSet(lbI + k); calm() || kick($('[data-lb="img"]', lb), 'is-swap'); };
/* horizontal swipes belong to the lightbox while it is open (no browser back-swipe) */
const lbOpen = r => { const i = rows.indexOf(r); if (!lb || i < 0) return; lbSet(i); lb.style.touchAction = 'pan-y pinch-zoom'; R.style.overscrollBehaviorX = 'none'; show(lb, r); halt('lb', 1); return 1; };
safe(() => {
  const list = $('.gal__list'), pick = e => { const r = e.target.closest('.gal__row'); r && galSel(r); };
  hover(list, pick);
  on(list, 'keydown', e => { const j = arrow(e, rows.indexOf(d.activeElement), rows.length); j >= 0 && rows[j].focus(); });
  on(lb, 'close', () => { halt('lb'); R.style.overscrollBehaviorX = ''; back(lb); });
  on(lb, 'keydown', e => { const k = { ArrowRight: 1, ArrowLeft: -1 }[e.key]; if (k) { e.preventDefault(); lbGo(k); } });
  let sx;
  on(lb, 'touchstart', e => { const t = e.changedTouches[0]; sx = [t.clientX, t.clientY]; }, { passive: true });
  on(lb, 'touchend', e => {
    const t = e.changedTouches[0], dx = sx ? t.clientX - sx[0] : 0;
    if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(t.clientY - sx[1])) lbGo(dx < 0 ? 1 : -1);
    sx = null;
  }, { passive: true });
});

/* blot transition (64 vertices), then scroll + hash + focus H2 */
const wipe = $('svg.wipe'), wN = $('.wipe__navy'), wU = $('.wipe__ultra');
let busy;
function blotPath(cx, cy, r0, p) {
  let s = ''; const ph = .4 * Math.PI * p;
  for (let i = 0; i < 64; i++) {
    const a = i * Math.PI / 32, r = r0 * p * (1 + .1 * Math.sin(5 * a + ph));
    s += (i ? 'L' : 'M') + (cx + r * Math.cos(a)).toFixed(1) + ' ' + (cy + r * Math.sin(a)).toFixed(1);
  }
  return s + 'Z';
}
function blot(rc, h2, land) {
  busy = 1;
  const w = innerWidth, h = innerHeight, far = (x, y) => Math.hypot(Math.max(x, w - x), Math.max(y, h - y)) / .9 + 2;
  let x = rc.left + rc.width / 2, y = rc.top + rc.height / 2, r0 = far(x, y), t0, landed;
  const draw = (pn, pu) => { wN.setAttribute('d', blotPath(x, y, r0, pn)); wU.setAttribute('d', pu > 0 ? blotPath(x, y, r0, pu) : ''); };
  const reach = () => { if (landed) return; landed = 1; land(); const q = h2.getBoundingClientRect(); x = q.left + q.width / 2; y = q.top + q.height / 2; r0 = far(x, y); };
  const end = () => { wN.setAttribute('d', ''); wU.setAttribute('d', ''); wipe.classList.remove('is-on'); busy = 0; clearTimeout(g); };
  const g = later(() => { if (busy) { reach(); end(); } }, 1500);
  wipe.setAttribute('viewBox', `0 0 ${w} ${h}`); wipe.classList.add('is-on');
  const step = now => {
    if (!busy) return;
    const t = now - (t0 = t0 || now);
    if (t < 280) draw(eIn(Math.min(t / 240, 1)), eIn(Math.min((t - 80) / 200, 1)));
    else { reach(); const u = (t - 280) / 300; if (u >= 1) return end(); draw(1 - eOut(u), 1 - eOut(Math.min(u / .75, 1))); }
    raf(step);
  };
  raf(step);
}
function go(a) {
  const id = a.hash.slice(1), sec = id && d.getElementById(id); if (!sec) return;
  if (busy) return 1;
  const rc = a.getBoundingClientRect(), dl = a.closest('dialog'), h2 = $('h2', sec) || sec;
  if (dl && dl.open) dl.close();
  const land = () => {
    try { sec.scrollIntoView({ behavior: 'instant' }); } catch (e) { sec.scrollIntoView(); }
    try { history.replaceState(null, '', '#' + id); } catch (e) {}
    h2.focus({ preventScroll: true }); kick(h2, 'is-arrive');
  };
  calm() || !wipe || !wN || !wU ? land() : blot(rc, h2, land);
  return 1;
}

/* confirm flash, copy */
const flash = $('.flash'), live = $('.sr-live');
function confirmFx(el) {
  if (calm()) return;
  if (flash) { flash.classList.add('is-on'); later(() => flash.classList.remove('is-on'), 50); }
  kick(el, 'is-jit'); later(() => el.classList.remove('is-jit'), 140);
}
async function copy(b) {
  const t = b.dataset.copyTarget && $(b.dataset.copyTarget), s = b.dataset.copy || (t ? t.textContent : '');
  let ok;
  try { await navigator.clipboard.writeText(s); ok = 1; } catch (e) {
    const ta = d.createElement('textarea'); ta.value = s; ta.readOnly = true; ta.style.cssText = 'position:fixed;top:0;opacity:0';
    (b.closest('dialog') || B).append(ta); ta.select();
    try { ok = d.execCommand('copy'); } catch (e2) {}
    ta.remove(); b.focus({ preventScroll: true });
  }
  if (!ok) return;
  if (live) { live.textContent = ''; later(() => { live.textContent = b.dataset.announce || 'Copied'; }, 60); }
  if (b._l == null) b._l = b.textContent;
  b.textContent = 'Copied'; clearTimeout(b._t); b._t = later(() => { b.textContent = b._l; }, 1200);
}

/* shader bench: manual while TECH ART is current */
const BD = { grade: 1, mode: 'night', caustics: 1, frame: 3 };
const press = (k, v) => $$(`[data-sea-set^="${k}:"]`).forEach(b => b.setAttribute('aria-pressed', b.dataset.seaSet == k + ':' + v));
function benchSet(b) {
  const [k, v] = b.dataset.seaSet.split(':');
  if (k == 'reset') return benchReset();
  bench = true; press(k, v); sea({ [k]: k == 'mode' ? v : +v });
}
function benchReset() { bench = false; for (const k in BD) press(k, BD[k]); sea({ grade: 1, caustics: 1 }); syncSea(); }

/* clicks (modified / middle clicks stay native) */
on(d, 'click', e => {
  const t = e.target, alt = e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey;
  let el;
  if (!t.closest) return;
  if ((el = t.closest('[data-set]'))) return setting(el);
  if ((el = t.closest('[data-sea-set]'))) return benchSet(el);
  if ((el = t.closest('.btn--copy'))) return void copy(el);
  if ((el = t.closest('[data-lb="prev"],[data-lb="next"]'))) return lbGo(el.dataset.lb == 'next' ? 1 : -1);
  if (alt || e.defaultPrevented) return;
  if ((el = t.closest('.btn,.cmd__a,.fcmd__a,.bbar__b,.rail__i'))) confirmFx(el);
  if (DLG && (el = t.closest('[data-open]'))) {
    const k = el.dataset.open;
    if (k == 'pause' ? pause && (openPause(), 1) : k == 'vdlg' ? openVideo(el) : openSrc(el)) e.preventDefault();
  } else if ((el = t.closest('.yt__play'))) { ytInline(el) && e.preventDefault(); }
  else if (DLG && (el = t.closest('.gal__row'))) { lbOpen(el) && e.preventDefault(); }
  else if ((el = t.closest('[data-resume]'))) {
    e.preventDefault();
    try { scrollTo({ top: 0, behavior: calm() ? 'instant' : 'smooth' }); } catch (x) { scrollTo(0, 0); }
    const a = heroSel(); a && a.focus({ preventScroll: true });
  } else if ((el = t.closest('.cmd__a,.rail__i')) && go(el)) e.preventDefault();
});

/* keys */
on(d, 'keydown', e => {
  const ae = d.activeElement, k = e.key;
  if (e.defaultPrevented) return;
  if (k == 'Escape') {
    if (!DLG || !pause || opened() || d.fullscreenElement || ae && (/^(INPUT|TEXTAREA|SELECT|IFRAME)$/.test(ae.tagName) || ae.isContentEditable)) return;
    e.preventDefault(); return openPause();
  }
  if (k == ' ' && ae && ae.classList && has(ae, 'yt__play')) { e.preventDefault(); return ae.click(); }
  if (!IO || opened() || !heroIn || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || ae && ae != B && ae != R && ae.id != 'main') return;
  if (k == 'ArrowDown' || k == 'ArrowUp') { e.preventDefault(); heroStep(k == 'ArrowDown' ? 1 : -1); }
  else if (k == 'Enter' && heroSel()) { e.preventDefault(); heroSel().click(); }
});

/* intro: any input or 0.9 s ends it */
safe(() => {
  if (!has(R, 'intro')) return;
  const ev = ['pointerdown', 'keydown', 'wheel', 'touchstart'], end = () => {
    R.classList.remove('intro'); try { sessionStorage.setItem('kartak.intro', '1'); } catch (e) {}
    ev.forEach(k => removeEventListener(k, end, true));
  };
  ev.forEach(k => addEventListener(k, end, { capture: true, passive: true })); later(end, 900);
});

/* reveal: reveal-on right before observing */
safe(() => {
  if (!IO) return;
  R.classList.add('reveal-on');
  try {
    /* revealing one element also reveals earlier ones already scrolled past (anchor jumps, fast flings) */
    const els = $$('.rv'), ob = io(es => es.forEach(e => {
      const i = e.isIntersecting ? els.indexOf(e.target) : -1;
      for (let j = 0; j <= i; j++) { const x = els[j]; if (!has(x, 'in') && (j == i || x.getBoundingClientRect().bottom < 0)) { x.classList.add('in'); ob.unobserve(x); } }
    }), { rootMargin: '0px 0px -8% 0px' });
    els.forEach(x => ob.observe(x));
  } catch (e) { R.classList.remove('reveal-on'); throw e; }
});

/* RESULTS rank-up (50%), CONTACT finisher (35%) */
function count(box) {
  $$('.num', box).forEach(n => {
    const m = n.textContent.match(/^(\d+)([+%])$/), fin = n.textContent; let t0;
    if (!m) return;
    const f = now => { const u = Math.min((now - (t0 = t0 || now) - 380) / 440, 1); n.textContent = u < 1 ? Math.round(m[1] * eOut(Math.max(u, 0))) + m[2] : fin; u < 1 && raf(f); };
    raf(f);
  });
}
safe(() => {
  const fx = $$('[data-fx]');
  if (!IO) return fx.forEach(x => x.classList.add('in'));
  const ob = io(es => es.forEach(e => {
    const el = e.target, rank = el.dataset.fx == 'rankup';
    if (!e.isIntersecting || e.intersectionRect.height / Math.max(1, Math.min(e.boundingClientRect.height, innerHeight)) < (rank ? .49 : .34)) return;
    ob.unobserve(el); el.classList.add('in'); rank && !calm() && count(el);
  }), { threshold: [0, .1, .2, .3, .35, .4, .5, .6, .7, .8, .9, 1] });
  fx.forEach(x => ob.observe(x));
});

/* ribbon span + NOW, highlight, contact selection */
safe(() => {
  const rib = $('.ribbon'), n = new Date(), dim = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
  rib && rib.style.setProperty('--span', Math.max((n.getFullYear() - 2021) * 12 + n.getMonth() - 8 + (n.getDate() - 1) / dim, 58).toFixed(2));
  const litUp = k => $$('.ribbon__bar[data-exp],.day[data-exp]').forEach(x => tg(x, 'is-lit', x.dataset.exp === k));
  const over = e => { const x = e.target.closest('[data-exp]'); x && litUp(x.dataset.exp); };
  const out = e => { const x = e.target.closest('[data-exp]'); x && !(e.relatedTarget && x.contains(e.relatedTarget)) && litUp(); };
  [rib, $('.days')].forEach(c => { on(c, 'pointerover', over); on(c, 'focusin', over); on(c, 'pointerout', out); on(c, 'focusout', out); });
  const fl = $('.fin__cmds'), fs = e => { const li = e.target.closest('.fcmd'); li && !has(li, 'is-sel') && $$('.fcmd', fl).forEach(x => tg(x, 'is-sel', x === li)); };
  hover(fl, fs);
});

/* lazy mono font */
let monoOn;
function mono() {
  if (monoOn) return;
  monoOn = d.createElement('link'); monoOn.rel = 'stylesheet';
  monoOn.href = 'https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400&display=swap'; d.head.append(monoOn);
}
safe(() => {
  const ta = $('#tech-art'); if (!ta) return; if (!IO) return mono();
  const o = io(es => { if (es.some(e => e.isIntersecting)) { mono(); o.disconnect(); } }, { rootMargin: '100% 0px' }); o.observe(ta);
});

/* lens (>= 1280 px, right of 45%) */
safe(() => {
  let q, fr;
  on(d, 'pointermove', e => {
    if (e.pointerType != 'mouse' || OG) return;
    if (!(heroIn && innerWidth >= 1280 && e.clientX > innerWidth * .45 && !calm() && ds.sea == 'gl' && !opened())) return S.lens && sea({ lens: null });
    q = [Math.round(e.clientX), Math.round(e.clientY), 140];
    fr = fr || raf(() => { fr = 0; q && sea({ lens: q }); });
  }, { passive: true });
  on(R, 'pointerleave', () => { q = null; S.lens && sea({ lens: null }); });
});

/* sea.js after load + idle */
let seaIn;
function loadSea() {
  const c = navigator.connection;
  if (seaIn || ds.sea == 'off') return;
  if (c && c.saveData || navigator.deviceMemory <= 2) { ds.sea = 'still'; return; }
  seaIn = d.createElement('script'); seaIn.src = 'assets/js/sea.js'; seaIn.async = true;
  seaIn.onload = () => sea({ ...S }); B.append(seaIn);
}
safe(() => {
  const gl = () => $$('.seatag,.bench,.foot__bg').forEach(x => { x.hidden = ds.sea != 'gl'; });
  gl(); new MutationObserver(gl).observe(R, { attributes: true, attributeFilter: ['data-sea'] });
  const idle = () => W.requestIdleCallback ? requestIdleCallback(loadSea, { timeout: 1500 }) : later(loadSea, 300);
  d.readyState == 'complete' ? idle() : on(W, 'load', idle, { once: true });
});
})();
