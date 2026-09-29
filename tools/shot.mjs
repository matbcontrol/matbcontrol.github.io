// Headless Chrome QA: screenshots at scroll positions + console errors + optional JS eval.
// Talks to Chrome over the DevTools protocol using Node's built-in WebSocket (Node >= 22).
//
// Usage:
//   node tools/shot.mjs --url http://127.0.0.1:8080/ --out qa --prefix desk --w 1440 --h 900 --scrolls 8
// Options:
//   --url URL        page to open (serve the repo with tools/serve.js first)
//   --out DIR        output folder for PNGs (created if missing)            [qa]
//   --prefix NAME    file name prefix                                       [shot]
//   --w / --h        viewport size in CSS px                                [1440 / 900]
//   --scrolls N      screenshots at N scroll positions (step = 0.9 * viewport)  [1]
//   --at "0,1200"    explicit scroll offsets in px (overrides --scrolls)
//   --selector "#id" scroll this element into view before the shot (repeatable via comma)
//   --full           one full-page screenshot instead of scroll positions
//   --wait MS        wait after load before the first shot                  [2500]
//   --step-wait MS   wait after each scroll                                 [900]
//   --mobile         mobile emulation (touch, mobile UA, DPR 2 downscaled to 1)
//   --reduced        emulate prefers-reduced-motion: reduce
//   --eval "JS"      evaluate an expression after load and print its JSON result
//   --click "sel"    click an element (by CSS selector) after load, before shots
//   --key "Escape"   dispatch a keydown for this key after load, before shots
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  if (i < 0) return def;
  const v = args[i + 1];
  return v === undefined || v.startsWith('--') ? true : v;
};
const url = opt('url', 'http://127.0.0.1:8080/');
const out = path.resolve(opt('out', 'qa'));
const prefix = opt('prefix', 'shot');
const W = +opt('w', 1440), H = +opt('h', 900);
const scrolls = +opt('scrolls', 1);
const at = opt('at', null);
const selectors = opt('selector', null);
const full = !!opt('full', false);
const wait = +opt('wait', 2500), stepWait = +opt('step-wait', 900);
const mobile = !!opt('mobile', false), reduced = !!opt('reduced', false);
const evalExpr = opt('eval', null), clickSel = opt('click', null), key = opt('key', null);

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const port = 9300 + Math.floor(Math.random() * 600);
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'shot-'));
fs.mkdirSync(out, { recursive: true });

const chrome = spawn(CHROME, [
  '--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`,
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--hide-scrollbars',
  '--no-first-run', '--no-default-browser-check', '--mute-audio', 'about:blank',
], { stdio: 'ignore' });

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function target() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
      const page = list.find(t => t.type === 'page');
      if (page) return page.webSocketDebuggerUrl;
    } catch { /* not up yet */ }
    await sleep(250);
  }
  throw new Error('Chrome DevTools endpoint did not come up');
}

const logs = [];
let ws, seq = 0;
const pending = new Map();
const waiters = [];
function send(method, params = {}) {
  const id = ++seq;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((res, rej) => pending.set(id, { res, rej, method }));
}
function once(method) { return new Promise(res => waiters.push({ method, res })); }
const fmtArg = a => a.value !== undefined ? (typeof a.value === 'string' ? a.value : JSON.stringify(a.value)) : (a.description || a.type);

async function main() {
  ws = new WebSocket(await target());
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  ws.onmessage = ev => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const p = pending.get(m.id); pending.delete(m.id);
      m.error ? p.rej(new Error(`${p.method}: ${m.error.message}`)) : p.res(m.result);
      return;
    }
    if (m.method === 'Runtime.consoleAPICalled') logs.push(`[console.${m.params.type}] ${m.params.args.map(fmtArg).join(' ')}`);
    if (m.method === 'Runtime.exceptionThrown') {
      const d = m.params.exceptionDetails;
      logs.push(`[exception] ${d.exception?.description || d.text} @ ${d.url || ''}:${d.lineNumber}:${d.columnNumber}`);
    }
    if (m.method === 'Log.entryAdded') logs.push(`[${m.params.entry.level}] ${m.params.entry.text} ${m.params.entry.url || ''}`);
    for (let i = waiters.length - 1; i >= 0; i--) if (waiters[i].method === m.method) { waiters[i].res(m.params); waiters.splice(i, 1); }
  };

  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile });
  if (mobile) {
    await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });
    await send('Emulation.setUserAgentOverride', { userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36' });
  }
  if (reduced) await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });

  const loaded = once('Page.loadEventFired');
  await send('Page.navigate', { url });
  await Promise.race([loaded, sleep(15000)]);
  await sleep(wait);

  const evaluate = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) return { error: r.exceptionDetails.exception?.description || r.exceptionDetails.text };
    return r.result.value;
  };
  if (clickSel) { console.log('click:', JSON.stringify(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(clickSel)});if(!e)return 'not found';e.click();return 'ok'})()`))); await sleep(stepWait); }
  if (key) { console.log('key:', JSON.stringify(await evaluate(`(()=>{const t=document.activeElement||document.body;t.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true}));return 'ok'})()`))); await sleep(stepWait); }
  if (evalExpr) console.log('eval:', JSON.stringify(await evaluate(evalExpr), null, 1));

  const shots = [];
  const shoot = async name => {
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const f = path.join(out, `${prefix}-${name}.png`);
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    shots.push(f);
  };
  if (full) {
    const m = await send('Page.getLayoutMetrics');
    const h = Math.ceil(m.cssContentSize.height);
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, clip: { x: 0, y: 0, width: W, height: h, scale: 1 } });
    const f = path.join(out, `${prefix}-full.png`);
    fs.writeFileSync(f, Buffer.from(r.data, 'base64'));
    shots.push(f);
  } else if (selectors) {
    for (const s of String(selectors).split(',')) {
      await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(s.trim())});if(e)e.scrollIntoView({block:'start',behavior:'instant'})})()`);
      await sleep(stepWait);
      await shoot(s.trim().replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, ''));
    }
  } else {
    const offsets = at ? String(at).split(',').map(Number) : Array.from({ length: scrolls }, (_, i) => Math.round(i * H * 0.9));
    const maxY = await evaluate('document.documentElement.scrollHeight - innerHeight');
    for (const y of offsets) {
      if (y > maxY + H * 0.5 && y > 0) break;
      await evaluate(`window.scrollTo({top:${y},behavior:'instant'})`);
      await sleep(y === 0 ? 200 : stepWait);
      await shoot(String(y).padStart(5, '0'));
    }
  }

  console.log(`viewport ${W}x${H}${mobile ? ' mobile' : ''}${reduced ? ' reduced-motion' : ''}`);
  console.log('screenshots:\n' + shots.join('\n'));
  console.log(logs.length ? 'console/log entries:\n' + logs.join('\n') : 'console/log entries: none');
}

main()
  .catch(e => { console.error('shot.mjs failed:', e.message); process.exitCode = 1; })
  .finally(async () => {
    try { ws?.close(); } catch {}
    chrome.kill();
    await sleep(400);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch {}
  });
