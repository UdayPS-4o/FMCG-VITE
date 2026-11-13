/**
 * Records every scene of the promo:
 *   clips/<id>.mp4   – the app in action (800x1600) or a full-frame card (1080x1920)
 *   clips/<id>.png   – caption + phone-bezel overlay for app scenes
 * Scene length follows the Hindi voice-over (audio/durations.json).
 *   node record.mjs            → everything
 *   node record.mjs s04 s05    → only the scenes whose id starts with these
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { openApp, APP, sleep, hydrateOrders, approveLatestOrder } from './mock.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FFMPEG = execFileSync(path.join(HERE, '.venv/Scripts/python.exe'), ['-c', 'import imageio_ffmpeg;print(imageio_ffmpeg.get_ffmpeg_exe())']).toString().trim();
const scenes = JSON.parse(fs.readFileSync(path.join(HERE, 'script.json'), 'utf8'));
const durs = JSON.parse(fs.readFileSync(path.join(HERE, 'audio/durations.json'), 'utf8'));
const only = process.argv.slice(2);
const want = (id) => !only.length || only.some(o => id.startsWith(o));
const LOGO = 'data:image/webp;base64,' + fs.readFileSync(path.join(HERE, '../app/icons/icon-512.webp')).toString('base64');
fs.mkdirSync(path.join(HERE, 'clips'), { recursive: true });

/* ───────────── helpers ───────────── */
const byText = (page, text, sel = 'button, a, div, span') => page.evaluateHandle((text, sel) => {
    const all = [...document.querySelectorAll(sel)].filter(e => e.offsetParent !== null && e.textContent.trim().includes(text));
    all.sort((a, b) => a.textContent.length - b.textContent.length); // innermost match
    return all[0] || null;
}, text, sel);

async function tap(page, target) {
    const el = typeof target === 'string' ? await page.$(target) : target;
    const box = el && el.asElement() && await el.asElement().boundingBox();
    if (!box) { console.log('   ! tap target missing:', typeof target === 'string' ? target : ''); return false; }
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down(); await sleep(70); await page.mouse.up();
    return true;
}
const tapText = async (page, text, sel) => { const ok = await tap(page, await byText(page, text, sel)); if (!ok) console.log('   ! (text)', text); return ok; };
const scrollTo = (page, y) => page.evaluate(y => window.scrollTo({ top: y, behavior: 'smooth' }), y);
/** slow eased scroll — reads better on video than a jump */
async function glide(page, toY, ms) {
    await page.evaluate((toY, ms) => new Promise(res => {
        const from = window.scrollY, t0 = performance.now();
        const step = (t) => {
            const k = Math.min(1, (t - t0) / ms);
            const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
            window.scrollTo(0, from + (toY - from) * e);
            if (k < 1) requestAnimationFrame(step); else res();
        };
        requestAnimationFrame(step);
    }), toY, ms);
}
const typeSlow = async (page, sel, text, delay = 110) => { await tap(page, sel); await page.type(sel, text, { delay }); };

/** Runs the steps and spreads the spare time between them so the clip lasts `seconds`. */
async function paced(seconds, steps) {
    const end = Date.now() + seconds * 1000;
    for (let i = 0; i < steps.length; i++) {
        await steps[i]();
        await sleep(Math.max(350, (end - Date.now()) / (steps.length - i)));
    }
    const over = (Date.now() - end) / 1000;
    if (over > 0.6) console.log('   ! ran ' + over.toFixed(1) + 's over');
}

/**
 * Own screen recorder: raw CDP screencast frames with their real timestamps,
 * stitched by ffmpeg — full device resolution and true-to-life timing.
 */
async function record(page, id, fn, size = '800:1600') {
    const out = path.join(HERE, 'clips', id + '.mp4');
    const dir = path.join(HERE, 'clips', '_' + id);
    fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    const cdp = await page.createCDPSession();
    const stamps = [];
    cdp.on('Page.screencastFrame', (ev) => {
        fs.writeFileSync(path.join(dir, String(stamps.length).padStart(5, '0') + '.jpg'), Buffer.from(ev.data, 'base64'));
        stamps.push(ev.metadata.timestamp);
        cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => { });
    });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 93, everyNthFrame: 1 });
    const t0 = Date.now();
    try { await fn(); } finally {
        const wall = (Date.now() - t0) / 1000;
        await cdp.send('Page.stopScreencast').catch(() => { });
        await sleep(200);
        await cdp.detach().catch(() => { });
        const lines = [];
        stamps.forEach((t, i) => {
            const dur = i < stamps.length - 1 ? stamps[i + 1] - t : Math.max(0.05, wall - (t - stamps[0]));
            lines.push("file '" + String(i).padStart(5, '0') + ".jpg'", 'duration ' + dur.toFixed(4));
        });
        lines.push("file '" + String(stamps.length - 1).padStart(5, '0') + ".jpg'");
        fs.writeFileSync(path.join(dir, 'list.txt'), lines.join(String.fromCharCode(10)));
        execFileSync(FFMPEG, ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', 'list.txt', '-vf', 'scale=' + size + ',fps=30', '-c:v', 'libx264', '-crf', '14', '-preset', 'medium', '-pix_fmt', 'yuv420p', out], { cwd: dir });
        fs.rmSync(dir, { recursive: true, force: true });
        console.log('✓ ' + id + '  ' + wall.toFixed(1) + 's, ' + stamps.length + ' frames  (voice ' + durs[id] + 's)');
    }
}

/* ───────────── full-frame cards (intro / outro) ───────────── */
const BG = 'radial-gradient(120% 80% at 50% 0%, #6366f1 0%, #4338ca 38%, #1e1b4b 100%)';
const FONT = '"Nirmala UI","Mangal","Segoe UI",sans-serif';
const chips = (list, t0, gap) => list.map((c, i) => '<div class="chip" style="animation-delay:' + (t0 + i * gap) + 's">' + c + '</div>').join('');
const cardHtml = (s, kind) => `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}
html{zoom:2;background:#1e1b4b}
body{width:540px;height:960px;overflow:hidden;background:${BG};font-family:${FONT};color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.blob{position:absolute;border-radius:50%;filter:blur(60px);opacity:.45;animation:float 9s ease-in-out infinite alternate}
.b1{width:340px;height:340px;background:#a855f7;top:-90px;left:-110px}
.b2{width:380px;height:380px;background:#10b981;bottom:-140px;right:-140px;animation-delay:-4s}
@keyframes float{to{transform:translate(40px,50px) scale(1.15)}}
@keyframes pop{0%{transform:scale(.3) rotate(-12deg);opacity:0}70%{transform:scale(1.08)}100%{transform:scale(1);opacity:1}}
@keyframes up{from{transform:translateY(34px);opacity:0}to{transform:none;opacity:1}}
@keyframes ring{0%{transform:scale(.8);opacity:.7}100%{transform:scale(1.9);opacity:0}}
@keyframes pulse{50%{transform:scale(1.06)}}
.logo{position:relative;width:190px;height:190px;border-radius:46px;background:#fff;display:flex;align-items:center;justify-content:center;box-shadow:0 30px 70px rgba(0,0,0,.4);animation:pop .9s cubic-bezier(.2,.9,.3,1.2) both .2s}
.logo img{width:140px;height:140px;object-fit:contain}
.logo:before,.logo:after{content:'';position:absolute;inset:0;border-radius:46px;border:3px solid rgba(255,255,255,.6);opacity:0;animation:ring 2.6s ease-out infinite 1.1s}
.logo:after{animation-delay:2.4s}
.brand{margin-top:44px;font-size:21px;letter-spacing:5px;font-weight:700;opacity:.85;animation:up .7s both .9s}
h1{margin-top:14px;font-size:50px;line-height:1.25;font-weight:800;padding:0 30px;animation:up .7s both 1.2s}
h2{margin-top:18px;font-size:26px;font-weight:600;color:#c7d2fe;animation:up .7s both 1.7s}
.chips{display:flex;flex-wrap:wrap;gap:12px;justify-content:center;margin-top:46px;padding:0 34px}
.chip{background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.28);border-radius:999px;padding:10px 20px;font-size:20px;font-weight:600;animation:up .6s both}
.cta{margin-top:50px;background:#10b981;border-radius:22px;padding:18px 40px;font-size:26px;font-weight:800;box-shadow:0 18px 40px rgba(16,185,129,.45);animation:up .7s both 2.4s, pulse 1.6s ease-in-out infinite 3.2s}
.foot{position:absolute;bottom:54px;left:0;right:0;font-size:19px;opacity:.75;animation:up .7s both 3s}
</style></head><body>
<div class="blob b1"></div><div class="blob b2"></div>
<div class="logo"><img src="${LOGO}"></div>
<div class="brand">EKTA ENTERPRISES</div>
<h1>${s.title}</h1><h2>${s.sub}</h2>
${kind === 'intro'
        ? '<div class="chips">' + chips(['🛒 मोबाइल से ऑर्डर', '🏷️ स्कीम और छूट', '🚚 लाइव ट्रैकिंग', '📒 बिल और लेजर'], 2.6, 1.6) + '</div>'
        : '<div class="cta">📲 मोबाइल नंबर + OTP से लॉगिन</div><div class="chips">' + chips(['✅ आसान', '⚡ तेज़', '🤝 भरोसेमंद'], 6.0, 1.2) + '</div><div class="foot">अधिक जानकारी के लिए एकता एंटरप्राइजेज़ से संपर्क करें</div>'}
</body></html>`;

/* caption + bezel overlay: 1080x1920 with a transparent, rounded hole where the app clip sits */
const SCREEN = { x: 180, y: 392, w: 720, h: 1440, r: 54 };
const overlayHtml = (s, n, total) => {
    const { x, y, w, h, r } = SCREEN, b = 14;
    const hole = `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 -${r} ${r}h-${w - 2 * r}a${r} ${r} 0 0 1 -${r} -${r}v-${h - 2 * r}a${r} ${r} 0 0 1 ${r} -${r}Z`;
    return `<!doctype html><html><head><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}html,body{background:transparent}
body{width:1080px;height:1920px;font-family:${FONT};color:#fff;position:relative;overflow:hidden}
svg{position:absolute;inset:0}
.cap{position:absolute;top:64px;left:0;right:0;text-align:center}
.step{display:inline-block;background:rgba(255,255,255,.16);border:2px solid rgba(255,255,255,.3);border-radius:999px;padding:4px 26px;font-size:30px;font-weight:700;letter-spacing:2px}
h1{font-size:74px;font-weight:800;line-height:1.2;margin-top:16px;text-shadow:0 6px 24px rgba(0,0,0,.3)}
h2{font-size:40px;font-weight:600;color:#c7d2fe;margin-top:8px}
</style></head><body>
<svg width="1080" height="1920" viewBox="0 0 1080 1920">
 <defs>
  <radialGradient id="g" cx="50%" cy="0%" r="110%"><stop offset="0" stop-color="#6366f1"/><stop offset=".4" stop-color="#4338ca"/><stop offset="1" stop-color="#1e1b4b"/></radialGradient>
 </defs>
 <path fill-rule="evenodd" fill="url(#g)" d="M0 0H1080V1920H0Z ${hole}"/>
 <rect x="${x - b / 2}" y="${y - b / 2}" width="${w + b}" height="${h + b}" rx="${r + b / 2}" fill="none" stroke="#0f172a" stroke-width="${b}"/>
 <rect x="${x - b}" y="${y - b}" width="${w + 2 * b}" height="${h + 2 * b}" rx="${r + b}" fill="none" stroke="#64748b" stroke-width="3"/>
</svg>
<div class="cap"><span class="step">${n} / ${total}</span><h1>${s.title}</h1><h2>${s.sub}</h2></div>
</body></html>`;
};

/* ───────────── app scenes ───────────── */
const brandChip = async (page, name) => {
    const h = await page.evaluateHandle((name) => {
        const el = [...document.querySelectorAll('button, div, span, p')].filter(e => e.children.length === 0 && e.textContent.trim().toUpperCase() === name.toUpperCase())[0];
        const chip = el && (el.closest('button') || el.parentElement);
        if (chip) chip.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        return chip || null;
    }, name);
    await sleep(900);
    return h;
};
const cardBtn = (page, which) => page.evaluateHandle((which) => {
    const visible = b => b.offsetParent && b.getBoundingClientRect().top > 60 && b.getBoundingClientRect().bottom < window.innerHeight - 90;
    const btns = [...document.querySelectorAll('button')].filter(visible);
    if (which === 'add') return btns.find(b => b.textContent.trim() === 'जोड़ें') || null;
    const done = btns.find(b => b.textContent.trim() === 'Done');
    if (!done || which === 'done') return done || null;
    const panel = [...done.parentElement.parentElement.querySelectorAll('button')];
    return panel[{ boxMinus: 0, boxPlus: 1, pcsMinus: 2, pcsPlus: 3 }[which]] || null;
}, which);
const press = (page, which) => async () => { if (!await tap(page, await cardBtn(page, which))) console.log('   ! (card)', which); };

const appScenes = {
    async s02_login(page, d) {
        await page.goto(APP + '/login', { waitUntil: 'networkidle2' });
        await record(page, 's02_login', () => paced(d, [
            () => sleep(1200),
            () => typeSlow(page, 'input[type=text]', '9876500010', 150),
            () => tapText(page, 'OTP प्राप्त करें', 'button'),
            async () => { await page.waitForSelector('input[type=number]'); await sleep(900); await typeSlow(page, 'input[type=number]', '4821', 260); },
            () => tapText(page, 'साइन इन करें', 'button'),
            () => sleep(1500),
        ]));
    },
    async s03_catalogue(page, d) {
        // warm the catalogue cache for the search we are about to show, so results appear instantly
        await page.goto(APP + '/search', { waitUntil: 'networkidle2' });
        await page.type('input', 'dove', { delay: 400 }); await sleep(2500);
        await page.goto(APP + '/', { waitUntil: 'networkidle2' });
        await sleep(3500);
        await record(page, 's03_catalogue', () => paced(d, [
            () => sleep(500),
            async () => { await brandChip(page, 'LUX'); },
            async () => { await tap(page, await brandChip(page, 'SURF EXCEL')); },
            () => glide(page, 620, 2400),
            () => glide(page, 0, 1100),
            async () => { await tap(page, 'a[href="/search"]'); await sleep(700); },
            async () => { const sel = 'input'; await page.waitForSelector(sel); await page.type(sel, 'dove', { delay: 230 }); },
            () => glide(page, 380, 1600),
        ]));
    },
    async s04_add(page, d) {
        await page.goto(APP + '/', { waitUntil: 'networkidle2' });
        await sleep(1200);
        await tap(page, await brandChip(page, 'Godrej Aer'));
        await sleep(2200);
        await glide(page, 150, 400);
        await record(page, 's04_add', () => paced(d, [
            () => sleep(500),
            press(page, 'add'), press(page, 'boxPlus'), press(page, 'boxPlus'),
            press(page, 'pcsPlus'), press(page, 'pcsPlus'), press(page, 'pcsPlus'),
            press(page, 'done'),
            press(page, 'add'), press(page, 'boxPlus'), press(page, 'done'),
        ]));
    },
    async s05_order(page, d) {
        await record(page, 's05_order', () => paced(d, [
            async () => { await tap(page, 'a[href="/cart"]'); await sleep(250); await page.evaluate(() => window.scrollTo(0, 0)); },
            () => tapText(page, 'ऑर्डर करें', 'button'),
            () => tapText(page, 'नकद (Cash)', 'button'),
            () => tapText(page, 'ऑर्डर पक्का करें', 'button'),
            () => sleep(2600),
        ]));
    },
    async s06_track(page, d) {
        await record(page, 's06_track', () => paced(d, [
            async () => { if (!await tapText(page, 'ऑर्डर ट्रैक करें', 'button')) await page.goto(APP + '/order/T1043'); await sleep(300); await page.evaluate(() => window.scrollTo(0, 0)); },
            () => sleep(1200),
            async () => {
                approveLatestOrder();
                await page.evaluate(() => window.dispatchEvent(new CustomEvent('order:push', { detail: { title: '✅ Order #T1043 confirmed', body: 'Ekta Enterprises has confirmed your order. Your bill is being prepared.', url: '/order/T1043', orderId: 'T1043', status: 'Approved' } })));
            },
            () => sleep(1500),
        ]));
    },
    async s07_orders(page, d) {
        await scrollTo(page, 0); await sleep(600);
        await record(page, 's07_orders', () => paced(d, [
            async () => { await tap(page, 'a[href="/orders"]'); await sleep(250); await page.evaluate(() => window.scrollTo(0, 0)); },
            async () => { await tapText(page, '#T1031', 'div'); await sleep(300); await page.evaluate(() => window.scrollTo(0, 0)); },
            async () => { await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(b => b.textContent.includes('फिर से')); if (b) b.animate([{ transform: 'scale(1)' }, { transform: 'scale(1.12)' }, { transform: 'scale(1)' }], { duration: 700, iterations: 3 }); }); },
            () => glide(page, 300, 1200),
        ]));
    },
    async s08_profile(page, d) {
        await page.goto(APP + '/orders', { waitUntil: 'networkidle2' });
        await record(page, 's08_profile', () => paced(d, [
            async () => { await tap(page, 'a[href="/profile"]'); await sleep(250); await page.evaluate(() => window.scrollTo(0, 0)); },
            () => glide(page, 330, 1500),
            () => glide(page, 900, 2000),
            () => glide(page, 1350, 1800),
        ]));
    },
    async s09_extras(page, d) {
        const schemeY = await page.evaluate(() => { const e = [...document.querySelectorAll('h2,h3,div,span,p')].find(e => e.children.length === 0 && e.textContent.trim() === 'आपके लिए स्कीम'); return e ? e.getBoundingClientRect().top + window.scrollY - 120 : 1500; });
        await scrollTo(page, 0); await sleep(900);
        await record(page, 's09_extras', () => paced(d, [
            () => sleep(400),
            () => tapText(page, 'English', 'button'),
            () => tapText(page, 'हिंदी', 'button'),
            () => glide(page, schemeY, 2000),
        ]));
    },
};

/* ───────────── run ───────────── */
await hydrateOrders();
const { browser, page } = await openApp({ loggedIn: false });
page.on('pageerror', e => console.log('   PAGEERR', e.message));
page.on('dialog', d => d.accept());

const appIds = Object.keys(appScenes);
for (const s of scenes) {
    if (!appScenes[s.id]) continue;
    // app scenes share state (login → cart → order): earlier ones always run, later unwanted ones are skipped
    if (only.length && !appIds.slice(appIds.indexOf(s.id)).some(want)) continue;
    await appScenes[s.id](page, want(s.id) ? durs[s.id] - 0.4 : 4);
}

// overlays + cards on a second page
const p2 = await browser.newPage();
const numbered = scenes.filter(s => appScenes[s.id]);
for (const s of scenes) {
    if (!want(s.id)) continue;
    if (appScenes[s.id]) {
        await p2.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
        await p2.setContent(overlayHtml(s, numbered.indexOf(s) + 1, numbered.length));
        await p2.screenshot({ path: path.join(HERE, 'clips', s.id + '.png'), omitBackground: true });
    } else {
        const kind = s.id.includes('intro') ? 'intro' : 'outro';
        await p2.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
        await p2.setContent('<body style="margin:0;background:#1e1b4b"></body>');
        await sleep(800);
        await record(p2, s.id, async () => { await p2.setContent(cardHtml(s, kind)); await sleep((durs[s.id] + (kind === 'outro' ? 1.6 : 0.7)) * 1000); }, '1080:1920');
    }
}
await browser.close();
