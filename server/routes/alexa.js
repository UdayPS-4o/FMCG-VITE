const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();
const { saveReceipt, printReceipts, splitAmounts, DEFAULT_SERIES, DEFAULT_SM } = require('../utils/alexaCashReceipt');

/*
 * Alexa "Sarthak bhai" skill — voice cash receipts.
 *
 * The skill is a conversation: each turn Gemini extracts what the user said (party, amount,
 * series, salesman, a choice from a list, yes/print, cancel) given what has been collected so
 * far. The party and salesman are matched against CMPL here, so Alexa can ask "which one?"
 * and speak back exactly what was filled. Collected values travel in Alexa sessionAttributes.
 *
 * The Cash Receipt page polls /commands/pending and applies queued actions to the form. Each
 * poll reports the page's own series / S/M, so Alexa only asks for what the page is missing,
 * and can tell the user when no Cash Receipt page is open.
 */

// ─── Constants ────────────────────────────────────────────────────────────────
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const COMMANDS_FILE = process.env.ALEXA_COMMANDS_FILE || path.join(__dirname, '..', 'db', 'alexa_commands.json');
const COMMAND_TTL_MS = 2 * 60 * 1000;   // a queued command older than this is never applied
const PAGE_ALIVE_MS = 20 * 1000;        // the page polls every 3s; silence longer than this = closed
const MAX_AMOUNT = 200000;              // same cap as the Cash Receipt form
const MAX_LISTED = 4;                   // read out at most this many matching parties

// ─── Alexa response helpers ───────────────────────────────────────────────────
const say = (text, attrs, { end = false, reprompt } = {}) => ({
  version: '1.0',
  sessionAttributes: attrs || {},
  response: {
    outputSpeech: { type: 'PlainText', text },
    ...(end ? {} : { reprompt: { outputSpeech: { type: 'PlainText', text: reprompt || text } } }),
    shouldEndSession: end,
  },
});

// ─── Command queue (file-backed) ──────────────────────────────────────────────
const readCommands = async () => {
  try {
    return JSON.parse(await fs.readFile(COMMANDS_FILE, 'utf8'));
  } catch {
    return [];
  }
};

const writeCommands = async (commands) => {
  await fs.writeFile(COMMANDS_FILE, JSON.stringify(commands, null, 2));
};

const queueCommand = async (actions, voiceText) => {
  const commands = await readCommands();
  const cmd = { id: Date.now().toString(), voiceText, actions, status: 'pending', createdAt: new Date().toISOString() };
  commands.push(cmd);
  await writeCommands(commands.slice(-50));
  return cmd;
};

// Last poll from a Cash Receipt page: { at, series, sm, smLocked }
let pageStatus = null;
const pageOpen = () => !!pageStatus && Date.now() - pageStatus.at < PAGE_ALIVE_MS;

// ─── Party / salesman lookup (CMPL) ───────────────────────────────────────────
let cmplCache = { at: 0, parties: [], salesmen: [] };

const loadCmpl = async () => {
  if (Date.now() - cmplCache.at < 5 * 60 * 1000 && cmplCache.parties.length) return cmplCache;
  const file = path.resolve(process.env.DBF_FOLDER_PATH, 'data/json', 'CMPL.json');
  const rows = JSON.parse(await fs.readFile(file, 'utf8'));
  const usable = rows.filter(r => r && r.C_CODE && r.C_NAME && !r.C_CODE.endsWith('000') && !r.C_NAME.includes('OPENING'));
  cmplCache = {
    at: Date.now(),
    parties: usable.filter(r => !r.C_CODE.startsWith('SM')).map(r => ({ code: r.C_CODE, name: r.C_NAME.trim() })),
    salesmen: usable.filter(r => r.C_CODE.startsWith('SM')).map(r => ({ code: r.C_CODE, name: r.C_NAME.trim() })),
  };
  return cmplCache;
};

// Spelling-tolerant form for Hindi names typed in English: bhawani/bhavani, shree/shri, kumaar/kumar
const norm = (s) => String(s || '').toLowerCase()
  .replace(/[^a-z0-9 ]/g, ' ')
  .replace(/w/g, 'v').replace(/ee/g, 'i').replace(/oo/g, 'u').replace(/aa/g, 'a')
  .replace(/sh/g, 's').replace(/ph/g, 'f').replace(/z/g, 'j')
  .replace(/\s+/g, ' ').trim()
  // Initials: "S.S TRADERS" -> "ss traders", so spoken "SS traders" matches
  .replace(/\b([a-z0-9]) (?=[a-z0-9]\b)/g, '$1');

// Spoken filler that is never part of a party name
const FILLER = new Set(['ki', 'ka', 'ke', 'ko', 'se', 'party', 'vala', 'vali', 'vale', 'naam', 'name', 'ji', 'm', 's']);

/** Edit distance where swapping two neighbouring letters counts as one edit (bakhari ~ bakahri) */
const editDistance = (a, b) => {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
};

/** Typos allowed for a spoken word: none for short words, 1 for 4–6 letters, 2 for longer */
const allowedTypos = (w) => (w.length <= 3 ? 0 : w.length <= 6 ? 1 : 2);

/**
 * How well one spoken word fits a party name: 2 = whole word, 1 = part of a word,
 * 0.5 = a name word with a small spelling difference (master typos, mishearing), 0 = no fit.
 */
const wordFit = (w, n, nWords) => {
  if (nWords.includes(w)) return 2;
  if (n.includes(w)) return 1;
  const max = allowedTypos(w);
  if (max && nWords.some(nw => Math.abs(nw.length - w.length) <= max && editDistance(w, nw) <= max)) return 0.5;
  return 0;
};

/** Parties whose name contains every word spoken (spelling-tolerant), best first. */
const findMatches = (text, pool) => {
  const words = norm(text).split(' ').filter(w => w && !FILLER.has(w));
  if (!words.length) return [];
  const scored = [];
  for (const p of pool) {
    const n = norm(p.name);
    const nWords = n.split(' ');
    const fits = words.map(w => wordFit(w, n, nWords));
    if (fits.some(f => f === 0)) continue;
    // Prefer exact word hits, names that start with the spoken words, and shorter names
    const starts = n.startsWith(words[0]) ? 1 : 0;
    const typos = fits.filter(f => f < 1).length;
    scored.push({ p, typos, score: fits.reduce((a, f) => a + f * 5, 0) + starts * 5 - nWords.length });
  }
  // Typo matches only count when nothing matches with fewer typos
  const fewest = Math.min(...scored.map(s => s.typos));
  return scored.filter(s => s.typos === fewest).sort((a, b) => b.score - a.score).map(s => s.p);
};

const titleCase = (s) => String(s).toLowerCase().replace(/\b[a-z]/g, c => c.toUpperCase());
const spokenParty = (p) => titleCase(p.name);

// ─── Gemini: understand one utterance in context ──────────────────────────────
const extract = async (voiceText, state) => {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('GEMINI_API_KEY not set');

  const options = (state.candidates || []).map((c, i) => `${i + 1}. ${c.name}`).join('\n');
  const prompt = `You help fill a cash receipt by voice for an FMCG distributor in India. The user speaks Hindi/Hinglish/English.

Already collected: ${JSON.stringify({ party: state.party?.name || null, amount: state.amount || null, series: state.series || null, salesman: state.sm?.name || null })}
Last question asked to the user: ${state.awaiting || 'none'}
${options ? `Options read out to the user:\n${options}\n` : ''}
User said: "${voiceText}"

Return ONLY JSON:
{"party": string|null, "choice": number|null, "amount": number|null, "series": string|null, "salesman": string|null, "yes": boolean, "no": boolean, "print": boolean, "saveOnly": boolean, "cancel": boolean}

Rules:
- party: the customer/shop name words exactly as spoken, transliterated to English letters (सुरेश किराना → "suresh kirana"). Do not include words like raseed/receipt/banao/rupaye/ki/ka. If the user is answering "which one" with a place or extra name words, put those words here. null if no party mentioned.
- choice: if options were read out and the user picks one by position ("pehli", "doosri wali", "number 2", "second"), its 1-based number. Otherwise null.
- amount: rupees as a number. Convert spoken numbers: "chaudah hazaar" = 14000, "das hazaar paanch sau" = 10500, "sava lakh" = 125000, "dedh hazaar" = 1500, "12 hazaar 355" = 12355. If the last question was about amount and the user says just a number, that is the amount. null if none.
- series: a single letter/short letters if the user names a series ("series A", "A series"). If the last question was about series and the user says a letter, use it. Uppercase. null otherwise.
- salesman: salesman name words if mentioned, or the answer when the last question was about salesman. null otherwise.
- yes: user agrees / says haan, ha, theek hai, kar do, ok, yes. no: user says nahi, mat karo, no.
- print: user asks to print, "print karo", "save aur print", "save karke print".
- saveOnly: user wants it saved but NOT printed ("save", "save karo", "sirf save karo", "print mat karo", "bina print ke save"). Saying "save" without "print" is saveOnly.
- cancel: user wants to cancel/stop/start over ("cancel", "rehne do", "band karo").`;

  const res = await axios.post(`${GEMINI_URL}?key=${key}`, {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0, thinkingConfig: { thinkingBudget: 0 } },
  }, { timeout: 6000 });

  const raw = res.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    const m = raw.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : {};
  }
};

/** Crude fallback when Gemini is unavailable: digits = amount, remaining words = party. */
const extractFallback = (voiceText) => {
  const t = String(voiceText || '');
  const num = t.match(/\d[\d,]*/);
  const rest = t.replace(/\d[\d,]*/g, ' ')
    .replace(/\b(ek|raseed|rasid|receipt|banao|bana|do|rupaye|rupae|rupees|rs|ki|ka|ke|cash|print|karo)\b/gi, ' ')
    .trim();
  const yes = /\b(haan|ha|yes|ok|theek)\b/i.test(t);
  return {
    amount: num ? Number(num[0].replace(/,/g, '')) : null,
    party: rest || null,
    yes,
    print: /\b(print|save)\b/i.test(t),
    cancel: /\b(cancel|rehne do|band)\b/i.test(t),
  };
};

// ─── One conversation turn ────────────────────────────────────────────────────
const nextQuestion = (state) => {
  if (!state.party) return { awaiting: 'party', text: 'Kis party ki raseed banani hai?' };
  if (!state.amount) return { awaiting: 'amount', text: `${spokenParty(state.party)}. Kitne rupaye ki raseed?` };
  return null;
};

const smSpoken = async (state) => {
  if (state.sm) return titleCase(state.sm.name);
  const { salesmen } = await loadCmpl();
  const sm = salesmen.find(s => s.code === DEFAULT_SM);
  return sm ? titleCase(sm.name) : DEFAULT_SM;
};

/** "O 245" or "O 245 se O 247" */
const spokenNos = (series, nos) => (nos.length === 1 ? `${series} ${nos[0]}` : `${series} ${nos[0]} se ${series} ${nos[nos.length - 1]}`);

const turn = async (voiceText, state) => {
  const { parties, salesmen } = await loadCmpl();

  let ex;
  // Short yes/no answers to "Save karun, ya print bhi?" — no need to ask Gemini
  const short = String(voiceText).toLowerCase().replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  const YES = /^(haan|han|ha|haa|yes|ok|okay|theek hai|thik hai|kar do|karo|print|print karo|print bhi|print bhi karo|save and print|save aur print|save karke print karo|save karke print|print kar do)$/;
  const SAVE_ONLY = /^(save|save karo|save kar do|haan save karo|sirf save karo|sirf save|only save|save only|print mat karo|print nahi|bina print ke save karo|save karo print nahi)$/;
  const NO = /^(nahi|nahin|na|no|mat karo|rehne do|cancel)$/;
  if (state.awaiting === 'confirm' && (YES.test(short) || SAVE_ONLY.test(short) || NO.test(short))) {
    ex = { yes: YES.test(short), saveOnly: SAVE_ONLY.test(short), no: NO.test(short), cancel: false };
  } else try {
    ex = await extract(voiceText, state);
  } catch (err) {
    console.error('[Alexa] Gemini failed, using fallback parser:', err.message);
    ex = extractFallback(voiceText);
  }
  console.log('[Alexa] Understood:', JSON.stringify(ex));

  if (ex.cancel) {
    return { reply: 'Theek hai, raseed cancel kar di. Kuch save nahi hua.', state: {}, end: true };
  }

  const notes = [];     // things to say before the next question
  let partyAsk = null;  // a "which party?" question; asked after the rest of this turn is applied
  if (ex.print) state.wantPrint = true; // "... print karo" said before everything was collected
  // A bare name before any party is chosen is the party, not a salesman
  if (!state.party && !ex.party && ex.salesman) {
    ex.party = ex.salesman;
    ex.salesman = null;
  }

  // ── Party: pick from the list read out, narrow it down, or search afresh
  if (state.candidates && ex.choice && state.candidates[ex.choice - 1]) {
    state.party = state.candidates[ex.choice - 1];
    state.candidates = null;
  } else if (ex.party) {
    let matches = state.candidates ? findMatches(ex.party, state.candidates) : [];
    if (!matches.length) matches = findMatches(ex.party, parties);
    // A party whose whole name is exactly what was said wins outright
    const exact = matches.filter(m => norm(m.name) === norm(ex.party));
    if (exact.length === 1) matches = exact;
    if (matches.length === 1) {
      state.party = matches[0];
      state.candidates = null;
    } else if (matches.length === 0) {
      state.candidates = null;
      partyAsk = { text: `${titleCase(ex.party)} naam ki koi party nahi mili. Party ka naam dobara boliye.`, awaiting: 'party' };
    } else {
      state.party = null;
      // Read the best few as a numbered list (so "pehli wali" works)
      state.candidates = matches.slice(0, MAX_LISTED);
      const list = state.candidates.map((m, i) => `${i + 1}, ${spokenParty(m)}`).join('. ');
      partyAsk = matches.length <= MAX_LISTED
        ? { text: `${matches.length} party mili: ${list}. Kaunsi wali?`, awaiting: 'choice' }
        : { text: `${titleCase(ex.party)} naam ki ${matches.length} party hain. Jaise: ${list}. Number boliye, ya jagah ke saath poora naam boliye.`, awaiting: 'choice' };
    }
  }

  // ── Amount
  if (ex.amount != null) {
    const amt = Math.round(Number(ex.amount) * 100) / 100;
    if (!(amt > 0)) notes.push('Amount samajh nahi aaya.');
    else if (amt > MAX_AMOUNT) notes.push('Ek raseed do lakh se zyada ki nahi ban sakti.');
    else state.amount = amt;
  }

  // ── Optional overrides of the defaults (series O, salesman SM003)
  if (ex.series) {
    const s = String(ex.series).replace(/[^A-Za-z]/g, '').toUpperCase();
    if (s) state.series = s;
  }
  if (ex.salesman) {
    const sms = findMatches(ex.salesman, salesmen);
    if (sms.length) state.sm = sms[0];
    else notes.push(`${titleCase(ex.salesman)} naam ka salesman nahi mila.`);
  }

  const q = partyAsk || nextQuestion(state);
  if (q) return { reply: [...notes, q.text].join(' '), state: { ...state, awaiting: q.awaiting } };

  // Everything collected
  const series = state.series || DEFAULT_SERIES;
  const summary = `${spokenParty(state.party)}, ${state.amount} rupaye`;
  const confirmed = state.wantPrint || (state.awaiting === 'confirm' && (ex.yes || ex.saveOnly));

  if (confirmed) {
    const saved = await saveReceipt({ party: state.party, amount: state.amount, series, sm: state.sm });
    const what = saved.receiptNos.length === 1
      ? `Raseed ${spokenNos(saved.series, saved.receiptNos)} save ho gayi`
      : `${saved.receiptNos.length} raseed ${spokenNos(saved.series, saved.receiptNos)} save ho gayi`;
    if (ex.saveOnly && !state.wantPrint) {
      return { reply: `${what}.`, state: {}, end: true };
    }
    // Printing takes several seconds (render + spool) — don't keep Alexa waiting
    printReceipts(saved.receiptNos).catch(err => console.error('[Alexa] Print failed:', err.message));
    return { reply: `${what}, print ho rahi hai.`, state: {}, end: true };
  }

  if (state.awaiting === 'confirm' && ex.no) {
    return { reply: 'Theek hai, kuch save nahi kiya.', state: {}, end: true };
  }

  const pieces = splitAmounts(state.amount).length;
  const split = pieces > 1 ? ` Bees hazaar se zyada hai, isliye ${pieces} raseed banengi.` : '';
  return {
    reply: [...notes, `${summary}. Series ${series}, salesman ${await smSpoken(state)}.${split} Save karun, ya print bhi?`].join(' '),
    state: { ...state, awaiting: 'confirm' },
  };
};

// ─── Alexa Webhook ────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body || {};
    const requestType = body.request?.type;
    const state = { ...(body.session?.attributes || {}) };
    console.log('[Alexa] Request type:', requestType);

    if (requestType === 'LaunchRequest') {
      return res.json(say('Namaste! Main Sarthak hoon. Kis party ki raseed banani hai?', { awaiting: 'party' },
        { reprompt: 'Party ka naam aur amount boliye, jaise Suresh Kirana ki chaudah hazaar ki raseed.' }));
    }

    if (requestType === 'SessionEndedRequest') {
      // Amazon reports why the session ended here (reason ERROR + error.type/message on failures)
      console.log('[Alexa] Session ended:', JSON.stringify({ reason: body.request.reason, error: body.request.error, locale: body.request.locale }));
      return res.json({ version: '1.0', response: {} });
    }

    if (requestType !== 'IntentRequest') {
      return res.json(say('Kuch samajh nahi aaya. Phir se boliye.', state));
    }

    const intentName = body.request.intent?.name;
    console.log('[Alexa] Intent:', intentName);

    if (intentName === 'AMAZON.HelpIntent') {
      return res.json(say('Party ka naam aur amount boliye, jaise: Suresh Kirana ki chaudah hazaar ki raseed banao. Main save karke default printer par print kar dungi.', state));
    }
    if (intentName === 'AMAZON.StopIntent' || intentName === 'AMAZON.CancelIntent') {
      return res.json(say('Theek hai, alvida!', {}, { end: true }));
    }

    const slots = body.request.intent?.slots || {};
    const voiceText = slots.command?.value || slots.query?.value || '';
    if (!voiceText) {
      // FallbackIntent carries no text — repeat the pending question
      if (state.awaiting === 'confirm') {
        return res.json(say('Samajh nahi aaya. Sirf save ke liye save boliye, print ke liye print boliye, ya nahi.', state));
      }
      if (state.awaiting === 'choice' && state.candidates?.length) {
        return res.json(say('Samajh nahi aaya. Party ka number boliye, jaise pehli wali, ya poora naam boliye.', state));
      }
      const q = nextQuestion(state);
      return res.json(say(`Samajh nahi aaya. ${q ? q.text : 'Party ka naam aur amount boliye.'}`, state));
    }

    console.log('[Alexa] Heard:', voiceText, '| state:', JSON.stringify(state));
    const out = await turn(voiceText, state);
    console.log('[Alexa] Reply:', out.reply);
    return res.json(say(out.reply, out.state, { end: !!out.end }));
  } catch (err) {
    console.error('[Alexa] Webhook error:', err);
    if (res.headersSent) return;
    return res.status(200).json(say('Kuch technical problem aa gayi. Thodi der baad try karein.', {}, { end: true }));
  }
});

// ─── Command Queue API (called by the Cash Receipt page) ──────────────────────

/** GET /api/alexa/commands/pending — the page polls this; query params report its current state */
router.get('/commands/pending', async (req, res) => {
  try {
    pageStatus = {
      at: Date.now(),
      series: String(req.query.series || ''),
      sm: String(req.query.sm || ''),
      smLocked: req.query.smLocked === '1',
    };
    const now = Date.now();
    const pending = (await readCommands())
      .filter(c => c.status === 'pending' && now - new Date(c.createdAt).getTime() < COMMAND_TTL_MS);
    res.json({ commands: pending });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read commands' });
  }
});

/** POST /api/alexa/commands/:id/complete — the page marks a command as applied */
router.post('/commands/:id/complete', async (req, res) => {
  try {
    const commands = await readCommands();
    const idx = commands.findIndex(c => c.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Command not found' });
    commands[idx].status = 'completed';
    commands[idx].completedAt = new Date().toISOString();
    await writeCommands(commands);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update command' });
  }
});

module.exports = router;
