/* sea.js: live WebGL1 background, one fullscreen triangle, no libraries. Frames from my projects: sine distort,
   mip-bias blur, BT.601 luminance, 5-step palette, stepped caustics, bubbles, overlays. Driven by window 'sea'
   CustomEvents (core.js), detail: {frame 1-6, origin [u,v] 0-1 v up, mode blue|deep|night|red, lens [x,y,r] css px
   or null, grade 0-1, caustics 0-1, pause, hero, motion auto|reduced, shader on|off}. Sets html[data-sea=gl|still]
   and fills [data-out=sea-fps|sea-fps2|sea-frame|sea-res]. Exposes window.SEA_SRC and window.sea {state,fps,cap,res,...}. */
(() => {
'use strict';
const W = window, D = document, R = D.documentElement;
if (W.SEA_SRC) return; // until set below, window.sea is canvas#sea (named access)
const B = W.SEA_BAKE; // tools/bake.html: {ramp, frame, t, w, h, grade, caustics}
const FS = `// The water behind this page. WebGL1, GLSL ES 1.00
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform sampler2D uTex0, uTex1, uRamp; // frame, next frame, 256x4 palette
uniform vec2 uRes, uOrigin;            // canvas px; ripple origin, uv
uniform vec4 uLum, uTop, uBot;         // gain+bias of both frames; overlays rgb+amount
uniform vec3 uLens;                    // lens centre + radius, px
uniform vec2 uScrim;                   // hero menu scrim: amount, uv.x where it fades out
uniform float uAsp0, uAsp1, uT, uTs, uSwap, uRowA, uRowB, uMix, uGrade, uCaus, uBias, uFx;
varying vec2 vUv;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f *= f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + 1.), f.x), f.y);
}
float web(vec2 p, float t) { // cell edges, Worley F2 - F1
  vec2 i = floor(p), f = fract(p);
  float d1 = 8., d2 = 8.;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 g = vec2(x, y), o = .5 + .4 * sin(t + 6.2832 * vec2(hash(i + g), hash(i + g + 17.3)));
    float d = length(g + o - f);
    d2 = min(d2, max(d1, d)); d1 = min(d1, d);
  }
  return d2 - d1;
}
vec2 cover(vec2 uv, float a) { // object-fit: cover, frames are stored at 2:1
  float s = uRes.x / uRes.y;
  return (uv - .5) * (s > a ? vec2(1., a / s) : vec2(s / a, 1.)) + .5;
}
vec3 palette(float l) {
  return mix(texture2D(uRamp, vec2(l, (uRowA + .5) / 4.)).rgb, texture2D(uRamp, vec2(l, (uRowB + .5) / 4.)).rgb, uMix);
}
void main() {
  float asp = uRes.x / uRes.y;
  vec2 uv = vUv;
  uv.y += sin(uv.x / .12 + uT * .6) * .008;                          // 1 sine distort
  float ld = distance(gl_FragCoord.xy, uLens.xy);                    // lens: true colours
  float lens = uLens.z > 0. ? 1. - smoothstep(uLens.z - 1.5, uLens.z, ld) : 0.;
  vec2 lc = uLens.xy / uRes;
  float lr = min(ld / max(uLens.z, 1.), 1.);
  uv = mix(uv, lc + (uv - lc) * (.8 + .2 * lr * lr), lens);
  vec2 q = (uv - uOrigin) * vec2(asp, 1.);                           // ripple frame swap
  float d = length(q), r = uSwap * (length(vec2(asp, 1.)) + .1);
  float e = smoothstep(r - .08, r, d), rim = 1. - abs(e * 2. - 1.); // e = 0: next frame
  vec2 w = uv + q / (d + 1e-4) * sin((d - r) * 60.) * .004 * rim;
  float bias = mix(uBias, .5, lens);                                 // 2 mip blur
  vec3 a = texture2D(uTex0, cover(w, uAsp0), bias).rgb;
  vec3 b = texture2D(uTex1, cover(w, uAsp1), bias).rgb;
  vec3 k = vec3(.299, .587, .114);                                   // 3 BT.601 luminance
  float l = clamp(mix(dot(b, k) * uLum.z + uLum.w, dot(a, k) * uLum.x + uLum.y, e), 0., 1.);
  l = clamp(l - uScrim.x * (1. - smoothstep(uScrim.y, uScrim.y + .26, uv.x)), 0., 1.); // scrim in luminance: stays on the palette
  vec3 hi = palette(1.), col = mix(mix(b, a, e), palette(l), uGrade * (1. - lens)); // 4 palette
  col += hi * rim * rim * .3;
  vec2 cp = vec2(uv.x * asp, uv.y);
  float cz = smoothstep(.74, .98, uv.y) * uCaus * uFx;               // 5 stepped caustics
  if (cz > 0.) {
    vec2 p = cp * 9. + sin(cp.yx * vec2(9., 7.) + uTs) * .45;
    float n = noise(p * .45 + uTs * .15);
    col += hi * step(web(p, uTs * 1.3), .02 + .07 * n) * cz * (.2 + .45 * n);
  }
  vec2 bp = cp * 7. - vec2(0., uT * .45), bi = floor(bp), bf = fract(bp) - .5; // 6 rising bubbles
  bf.x += sin(uT * 1.7 + bi.y) * .06 + (hash(bi + 3.1) - .5) * .4;
  float br = mix(.08, .17, hash(bi + 7.3)), bd = length(bf);
  float bub = step(.9, hash(bi)) * (1. - smoothstep(.01, .04, abs(bd - br)) + (1. - smoothstep(br - .02, br, bd)) * .3);
  col += hi * bub * (1. - smoothstep(.45, .8, uv.y)) * smoothstep(.25, .6, uv.x) * .6 * uFx;
  col = mix(col, uTop.rgb, uTop.a * smoothstep(.7, 1., uv.y));       // 7 overlays
  col = mix(col, uBot.rgb, uBot.a * (1. - smoothstep(0., .35, uv.y)));
  col = mix(col, vec3(1.), uLens.z > 0. ? .9 * (1. - smoothstep(0., 1.5, abs(ld - uLens.z))) : 0.);
  gl_FragColor = vec4(col, 1.);
}
`;
const VS = 'attribute vec2 p;varying vec2 vUv;void main(){vUv=p*.5+.5;gl_Position=vec4(p,0.,1.);}';
// palette rows BLUE NIGHT RED DEEP, steps at 0/.31/.48/.77/.81; per row: top overlay, bottom overlay, fx strength
const RAMP = ['060A2B 0C124C 1B38F0 3351FF FCFEFE', '020702 0C3A06 1E8507 3CFB3B E0FE9D',
  '060000 2A0304 8E0B0C C51112 FFFFFF', '000214 01023C 06124F 16197F 6AE6FA'];
const ROW = { blue: 0, night: 1, red: 2, deep: 3 };
const OVL = ['00FCF2 .39 000F6D .8 1', '3CFB3B .2 020702 .8 .8', 'FF5A4E .16 111112 .8 .7', '0BC8FF .22 000214 .8 .5']
  .map(s => s.split(' ').flatMap(v => v.length > 5 ? [0, 2, 4].map(i => parseInt(v.substr(i, 2), 16) / 255) : +v));
// frames 1-6: source aspect (stored squashed to 2:1); luminance [gain, bias] fitted with tools/bake.html?stats=1
const ASP = [0, 16 / 9, 1366 / 776, 16 / 9, 1386 / 774, 1288 / 725, 1919 / 1079];
const LUM = [0, [1.4, .2], [1.25, .2], [2.9, .2], [.9, .01], [1, .32], [1.45, .3]];
const mm = q => !!(W.matchMedia && matchMedia(q).matches), MQ = W.matchMedia && matchMedia('(prefers-reduced-motion: reduce)');
const MOB = !B && (mm('(pointer:coarse)') || innerWidth < 600), OG = R.classList.contains('og'), DBG = /[?&]seadebug/.test(location.search);
const SRC = D.currentScript && D.currentScript.src, BASE = SRC ? new URL('../sea/', SRC).href : 'assets/sea/';
const now = () => performance.now(), ease = x => 1 - (1 - x) ** 3, cl = x => x > 1 ? 1 : x > 0 ? x : 0;
const to = (v, t, s) => v < t ? Math.min(t, v + s) : Math.max(t, v - s);
let cv, gl, U = {}, tex = [], lost = 0, ready = 0, off = 0, mot = '', pre = 0, raf = 0, last = 0, fN = 0, fT = 0, cw = 1, ch = 1;
let cur = 2, nxt = 0, want = 2, sw = 0, swOn = 0, org = [.5, .5], qOrg = org, rowA = 0, rowB = 0, mx = 1;
let scr = B ? 0 : 1, scrT = scr, grade = 1, gradeT = 1, caus = 1, causT = 1, lx = 0, ly = 0, lr = 0, lrT = 0, lMove = 0, paused = 0, heroIn = 1, lastIn = now();
const t0 = now(), S = W.sea = { state: 'init', fps: 0, cap: 0, res: 0, frame: 2, mode: 'blue', lum: LUM, asp: ASP, set };
W.SEA_SRC = FS;
// one still frame instead of the loop: reduced motion, ?og=1 render, offline bake
const calm = () => !!(B || OG || (MQ && MQ.matches) || mot === 'reduced' || R.dataset.motion === 'reduced');

function set(o) {
  o = o || {};
  if ('pause' in o) paused = !!o.pause;
  if ('hero' in o) { (heroIn = !!o.hero) || prefetch(); scrT = heroIn && !B ? 1 : 0; if (!ready || calm()) scr = scrT; }
  if ('motion' in o) mot = o.motion;
  if ('grade' in o) gradeT = cl(+o.grade);
  if ('caustics' in o) causT = cl(+o.caustics);
  if ('lens' in o) { const l = o.lens; l && l.length > 2 ? (lx = +l[0], ly = +l[1], lrT = +l[2] || 0, lMove = now()) : lrT = 0; }
  if (o.mode in ROW) mode(o.mode);
  if ('frame' in o) request(+o.frame, o.origin);
  if (o.shader === 'off') off = 1, still(); else if (o.shader === 'on' && off) off = 0, start();
  render();
}
function mode(m) {
  const r = ROW[m]; S.mode = m;
  if (r === rowB) return;
  if (!ready || calm()) rowA = rowB = r, mx = 1; else rowA = mx < .5 ? rowA : rowB, rowB = r, mx = 0;
}
// swap only once the texture is loaded; mobile keeps its one texture unless asked directly (no origin: the bench)
function request(n, o) {
  if (!(n >= 1 && n <= 6)) return;
  if (n !== cur) prefetch();
  want = n; qOrg = o && o.length > 1 ? [+o[0], +o[1]] : [.5, .5];
  const t = tex[n];
  t && t.ok ? go() : (!MOB || !o) && load(n, () => { want === n && go(); render(); });
}
function go() {
  const n = want, t = tex[n];
  if (!ready || swOn || n === cur || !t || !t.ok) return;
  if (calm()) return cur = n, unit(0, t.t), unit(1, t.t), caption();
  nxt = n; org = qOrg; sw = 0; swOn = 1; unit(1, t.t); kick();
}
function swapped() { swOn = 0; cur = nxt; unit(0, tex[cur].t); unit(1, tex[cur].t); caption(); go(); }
function unit(u, t) { gl.activeTexture(gl.TEXTURE0 + u); gl.bindTexture(gl.TEXTURE_2D, t); }
function par(min) {
  [[gl.TEXTURE_MIN_FILTER, min], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE],
    [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(([k, v]) => gl.texParameteri(gl.TEXTURE_2D, k, v));
}
function load(n, cb) {
  let x = tex[n];
  if (x) return x.ok || x.err ? cb && cb() : cb && x.cb.push(cb);
  x = tex[n] = { cb: cb ? [cb] : [] };
  const im = new Image(), done = () => { x.cb.forEach(f => f()); x.cb = []; };
  im.src = BASE + 'image' + n + (MOB ? '-512' : '-1024') + '.jpg';
  (im.decode ? im.decode() : new Promise((y, j) => { im.onload = y; im.onerror = j; })).then(() => {
    if (!gl || lost) return;
    unit(3, x.t = gl.createTexture()); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, im);
    gl.generateMipmap(gl.TEXTURE_2D); par(gl.LINEAR_MIPMAP_LINEAR); x.ok = 1; done();
  }, () => { x.err = 1; done(); });
}
// desktop: after the first frame change or leaving the hero, the other frames load one by one when idle
function prefetch() {
  if (pre || MOB || !gl) return; pre = 1;
  const idle = f => W.requestIdleCallback ? requestIdleCallback(f, { timeout: 2e3 }) : setTimeout(f, 300);
  const nx = () => { const n = [5, 3, 4, 6, 1].find(k => !tex[k]); n && idle(() => load(n, nx)); };
  nx();
}
function ramp() {
  const c = D.createElement('canvas'), x = c.getContext('2d');
  c.width = 256; c.height = 4;
  RAMP.forEach((row, y) => {
    const s = row.split(' '), g = x.createLinearGradient(0, 0, 256, 0);
    [.31, .48, .77, .81].forEach((p, i) => { g.addColorStop(p - .002, '#' + s[i]); g.addColorStop(p + .002, '#' + s[i + 1]); });
    x.fillStyle = g; x.fillRect(0, y, 256, 1);
  });
  unit(2, gl.createTexture()); gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c); par(gl.LINEAR);
}
// 0.5x css px on desktop, 0.33x on mobile, DPR ignored
function size() {
  cw = B ? B.w : R.clientWidth || innerWidth; ch = B ? B.h : R.clientHeight || innerHeight;
  const k = S.res = B ? 1 : mm('(pointer:coarse)') || cw < 600 ? .33 : .5, w = Math.round(cw * k) || 1, h = Math.round(ch * k) || 1;
  D.querySelectorAll('[data-out="sea-res"]').forEach(e => { e.textContent = '' + k; });
  if (cv.width !== w || cv.height !== h) return cv.width = w, cv.height = h;
}
const f = (n, ...v) => gl['uniform' + v.length + 'f'](U[n], ...v);
function draw(t) {
  const w = cv.width, h = cv.height, n = swOn ? nxt : cur, m = ease(mx), a = OVL[rowA], b = OVL[rowB];
  const o = i => a[i] + (b[i] - a[i]) * m, k = w / cw;
  gl.viewport(0, 0, w, h);
  f('uRes', w, h); f('uT', t); f('uTs', Math.floor(t * 10) / 10); f('uAsp0', ASP[cur]); f('uAsp1', ASP[n]);
  f('uLum', ...LUM[cur], ...LUM[n]); f('uSwap', swOn ? ease(sw) : 0); f('uOrigin', ...org);
  f('uRowA', rowA); f('uRowB', rowB); f('uMix', m); f('uGrade', grade); f('uCaus', caus); f('uBias', MOB ? 2 : 2.5);
  f('uTop', o(0), o(1), o(2), o(3)); f('uBot', o(4), o(5), o(6), o(7)); f('uFx', o(8)); f('uScrim', scr * .34, cw < 1024 ? 2 : .36);
  f('uLens', lx * k, (ch - ly) * h / ch, lr > .5 ? lr * k : 0);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
function paint() {
  const a = DBG && now();
  draw(calm() ? (B ? B.t : 4) : (now() - t0) / 1e3 % 1047.1976); // wraps after 100 periods of the distort sine
  if (DBG) { // ?seadebug: cpu = JS submit time, ms = until a pixel is read back (GPU sync), smoothed
    const c = now() - a; gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    S.cpu = (S.cpu || c) * .9 + c * .1; S.ms = (S.ms || now() - a) * .9 + (now() - a) * .1;
  }
}
// fps cap: 60 in transitions, 30 in the hero, 12 below it or after 20 s without input, 0 when hidden or paused
function tick(t) {
  raf = 0;
  const c = S.cap = paused || D.hidden ? 0 : swOn || mx < 1 || scr !== scrT || grade !== gradeT || caus !== causT || lr !== lrT ||
    (lr > 0 && now() - lMove < 300) ? 60 : heroIn && now() - lastIn < 2e4 ? 30 : 12;
  if (!c) return S.fps = 0, out();
  raf = requestAnimationFrame(tick);
  if (t - last < 1e3 / c - 4) return;
  const dt = Math.min(t - last, 50) * (S.slow || 1); last = t; // sea.slow: debug time scale
  if (swOn && (sw += dt / 450) >= 1) swapped();
  if (mx < 1) mx = Math.min(1, mx + dt / 600);
  scr = to(scr, scrT, dt / 300); grade = to(grade, gradeT, dt / 300); caus = to(caus, causT, dt / 300); lr = to(lr, lrT, dt);
  paint(); fN++;
  if (t - fT >= 500) S.fps = Math.round(fN * 1e3 / (t - fT)), fN = 0, fT = t, out();
}
function kick() { if (!raf && ready && S.state === 'gl' && !calm()) fT = last = now(), fN = 0, raf = requestAnimationFrame(tick); }
function stop() { raf && cancelAnimationFrame(raf); raf = 0; }
function render() {
  if (!ready || S.state !== 'gl') return;
  if (!calm()) return kick();
  stop(); if (swOn) sw = 1, swapped();
  mx = 1; grade = gradeT; caus = causT; lr = lrT = 0; paint(); S.fps = S.cap = 0; out();
}
function out() { const v = '' + S.fps; D.querySelectorAll('[data-out^="sea-fps"]').forEach(e => e.textContent !== v && (e.textContent = v)); }
function caption() {
  const b = D.querySelector('.gal__row[data-frame="' + (S.frame = cur) + '"] b');
  b && D.querySelectorAll('[data-out="sea-frame"]').forEach(e => { e.textContent = b.textContent; });
}
function still() { stop(); S.state = 'still'; S.fps = S.cap = 0; out(); R.dataset.sea = 'still'; cv && (cv.style.opacity = 0); }
function live() { S.state = 'gl'; size(); paint(); cv.style.opacity = 1; R.dataset.sea = 'gl'; B && (R.dataset.baked = 1); render(); }
function start() { lost || (gl ? ready && live() : init()); }
function first(n) { if (lost || !gl) return; cur = n; unit(0, tex[n].t); unit(1, tex[n].t); ready = 1; caption(); off || (live(), go()); }
function init() {
  cv = D.getElementById('sea');
  if (!cv) cv = D.createElement('canvas'), cv.id = 'sea', cv.setAttribute('aria-hidden', 'true'), D.body.prepend(cv);
  const cs = cv.style;
  if (!B) {
    if (getComputedStyle(cv).position !== 'fixed') cs.cssText += ';position:fixed;left:0;top:0;z-index:0;pointer-events:none';
    cs.width = cs.height = '100%';
  }
  cs.opacity = 0; cs.transition = calm() ? '' : 'opacity .3s linear';
  // software GL (blocklisted GPU) gets the still image, except on localhost or with ?sea=force
  const loc = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname) || /[?&]sea=force/.test(location.search);
  const A = { alpha: false, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: !!B,
    powerPreference: 'low-power', failIfMajorPerformanceCaveat: !B && !loc };
  try { gl = cv.getContext('webgl', A) || cv.getContext('experimental-webgl', A); } catch (e) { gl = null; }
  if (!gl) return still();
  cv.addEventListener('webglcontextlost', () => { lost = 1; ready = 0; still(); });
  const pr = gl.createProgram();
  [[gl.VERTEX_SHADER, VS], [gl.FRAGMENT_SHADER, FS]].forEach(([k, s]) => {
    const h = gl.createShader(k); gl.shaderSource(h, s); gl.compileShader(h);
    gl.getShaderParameter(h, gl.COMPILE_STATUS) || console.error('sea: shader compile failed\n' + gl.getShaderInfoLog(h));
    gl.attachShader(pr, h);
  });
  gl.bindAttribLocation(pr, 0, 'p'); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return console.error('sea: link failed\n' + gl.getProgramInfoLog(pr)), gl = null, still();
  gl.useProgram(pr);
  new Set(FS.match(/\bu[A-Z]\w*/g)).forEach(n => { U[n] = gl.getUniformLocation(pr, n); });
  gl.uniform1i(U.uTex0, 0); gl.uniform1i(U.uTex1, 1); gl.uniform1i(U.uRamp, 2);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, 0, 0, 0);
  ramp(); size(); S.state = 'loading';
  if (B) mode(B.ramp in ROW ? B.ramp : 'deep'), grade = gradeT = cl(B.grade ?? 1), caus = causT = cl(B.caustics ?? 1);
  const n = B ? B.frame : +(W.SEA_STATE && W.SEA_STATE.frame) || 5;
  load(n, () => tex[n].ok ? first(n) : still());
}

W.addEventListener('sea', e => set(e.detail));
W.addEventListener('resize', () => { ready && S.state === 'gl' && size() && paint(); });
D.addEventListener('visibilitychange', () => D.hidden ? (stop(), S.fps = 0, out()) : kick());
MQ && MQ.addEventListener && MQ.addEventListener('change', render);
['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'].forEach(k => W.addEventListener(k, () => { lastIn = now(); }, { passive: true }));
const N = navigator, C = N.connection;
if (!B && R.dataset.sea === 'off') off = 1, still();
else if (!B && (C && C.saveData || N.deviceMemory <= 2)) still();
else init();
})();
