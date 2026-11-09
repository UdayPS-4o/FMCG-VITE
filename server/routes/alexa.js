const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

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
  .replace(/\s+/g, ' ').trim();

// Spoken filler that is never part of a party name
const FILLER = new Set(['ki', 'ka', 'ke', 'ko', 'se', 'party', 'vala', 'vali', 'vale', 'naam', 'name', 'ji', 'm', 's']);

/** Parties whose name contains every word spoken (spelling-tolerant), best first. */
const findMatches = (text, pool) => {
  const words = norm(text).split(' ').filter(w => w && !FILLER.has(w));
  if (!words.length) return [];
  const scored = [];
  for (const p of pool) {
    const n = norm(p.name);
    const nWords = n.split(' ');
    if (!words.every(w => n.includes(w))) continue;
    // Prefer whole-word hits, names that start with the spoken words, and shorter names
    const whole = words.filter(w => nWords.includes(w)).length;
    const starts = n.startsWith(words[0]) ? 1 : 0;
    scored.push({ p, score: whole * 10 + starts * 5 - nWords.length });
  }
  return scored.sort((a, b) => b.score - a.score).map(s => s.p);
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
{"party": string|null, "choice": number|null, "amount": number|null, "series": string|null, "salesman": string|null, "yes": boolean, "no": boolean, "print": boolean, "cancel": boolean}

Rules:
- party: the customer/shop name words exactly as spoken, transliterated to English letters (सुरेश किराना → "suresh kirana"). Do not include words like raseed/receipt/banao/rupaye/ki/ka. If the user is answering "which one" with a place or extra name words, put those words here. null if no party mentioned.
- choice: if options were read out and the user picks one by position ("pehli", "doosri wali", "number 2", "second"), its 1-based number. Otherwise null.
- amount: rupees as a number. Convert spoken numbers: "chaudah hazaar" = 14000, "das hazaar paanch sau" = 10500, "sava lakh" = 125000, "dedh hazaar" = 1500, "12 hazaar 355" = 12355. If the last question was about amount and the user says just a number, that is the amount. null if none.
- series: a single letter/short letters if the user names a series ("series A", "A series"). If the last question was about series and the user says a letter, use it. Uppercase. null otherwise.
- salesman: salesman name words if mentioned, or the answer when the last question was about salesman. null otherwise.
- yes: user agrees / says haan, ha, theek hai, kar do, ok, yes. no: user says nahi, mat karo, no.
- print: user asks to save, print, "save karo", "print karo", "save aur print".
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
  const page = pageOpen() ? pageStatus : null;
  if (page && !page.series && !state.series) return { awaiting: 'series', text: 'Series kya rakhein? Jaise A ya B.' };
  if (page && !page.sm && !page.smLocked && !state.sm) {
    const names = cmplCache.salesmen.slice(0, 3).map(s => titleCase(s.name)).join(', ');
    return { awaiting: 'salesman', text: `Salesman kaun hai? Jaise ${names}.` };
  }
  return null;
};

const turn = async (voiceText, state) => {
  const { parties, salesmen } = await loadCmpl();

  let ex;
  try {
    ex = await extract(voiceText, state);
  } catch (err) {
    console.error('[Alexa] Gemini failed, using fallback parser:', err.message);
    ex = extractFallback(voiceText);
  }
  console.log('[Alexa] Understood:', JSON.stringify(ex));

  if (ex.cancel) {
    return { reply: 'Theek hai, raseed cancel kar di.', state: {}, end: true };
  }

  const fill = [];      // actions to send to the page this turn
  const notes = [];     // things to say before the next question
  let partyAsk = null;  // a "which party?" question; asked after the rest of this turn is applied
  if (ex.print) state.wantPrint = true; // "... print karo" said before the party was settled
  // A bare name before any party is chosen is the party, unless we just asked for the salesman
  if (!state.party && !ex.party && ex.salesman && state.awaiting !== 'salesman') {
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
      state.candidates = matches.slice(0, 20);
      if (matches.length <= MAX_LISTED) {
        const list = matches.map((m, i) => `${i + 1}, ${spokenParty(m)}`).join('. ');
        partyAsk = { text: `${matches.length} party mili: ${list}. Kaunsi wali?`, awaiting: 'choice' };
      } else {
        // Read the best few as a numbered list (so "pehli wali" works) and offer narrowing down
        state.candidates = matches.slice(0, MAX_LISTED);
        const list = state.candidates.map((m, i) => `${i + 1}, ${spokenParty(m)}`).join('. ');
        partyAsk = { text: `${titleCase(ex.party)} naam ki ${matches.length} party hain. Jaise: ${list}. Number boliye, ya jagah ke saath poora naam boliye.`, awaiting: 'choice' };
      }
    }
  }
  if (state.party && state.party.code !== state.filledParty) {
    fill.push({ type: 'update_field', field: 'party', value: state.party.code });
    state.filledParty = state.party.code;
  }

  // ── Amount
  if (ex.amount != null) {
    const amt = Math.round(Number(ex.amount) * 100) / 100;
    if (!(amt > 0)) {
      notes.push('Amount samajh nahi aaya.');
    } else if (amt > MAX_AMOUNT) {
      notes.push(`Ek raseed do lakh se zyada ki nahi ban sakti.`);
    } else if (amt !== state.amount) {
      state.amount = amt;
      fill.push({ type: 'update_field', field: 'amount', value: String(amt) });
    }
  }

  // ── Series
  if (ex.series) {
    const s = String(ex.series).replace(/[^A-Za-z]/g, '').toUpperCase();
    if (s && s !== state.series) {
      state.series = s;
      fill.push({ type: 'update_field', field: 'series', value: s });
    }
  }

  // ── Salesman
  if (ex.salesman) {
    const sms = findMatches(ex.salesman, salesmen);
    if (sms.length >= 1 && sms[0].code !== state.sm?.code) {
      state.sm = sms[0];
      fill.push({ type: 'update_field', field: 'sm', value: sms[0].code });
    } else if (!sms.length) {
      notes.push(`${titleCase(ex.salesman)} naam ka salesman nahi mila.`);
    }
  }

  if (fill.length) await queueCommand(fill, voiceText);

  const q = partyAsk || nextQuestion(state);
  if (q) {
    return { reply: [...notes, q.text].join(' '), state: { ...state, awaiting: q.awaiting } };
  }

  // Everything collected
  const summary = `${spokenParty(state.party)}, ${state.amount} rupaye`;
  if (!pageOpen()) {
    return {
      reply: `${summary}. Lekin Cash Receipt page khula nahi hai. Website par Cash Receipt kholiye, do minute ke andar main wahan bhar dungi. Phir boliye print karo.`,
      state: { ...state, awaiting: 'confirm' },
    };
  }

  if (state.wantPrint || (state.awaiting === 'confirm' && ex.yes)) {
    // Re-send every field with the print so the page prints exactly what was confirmed
    const all = [{ type: 'update_field', field: 'party', value: state.party.code },
      { type: 'update_field', field: 'amount', value: String(state.amount) }];
    if (state.series) all.push({ type: 'update_field', field: 'series', value: state.series });
    if (state.sm) all.push({ type: 'update_field', field: 'sm', value: state.sm.code });
    all.push({ type: 'print_receipt' });
    await queueCommand(all, voiceText);
    return { reply: `${summary} ki raseed save karke print kar rahi hoon.`, state: {}, end: true };
  }

  if (state.awaiting === 'confirm' && ex.no) {
    return { reply: 'Theek hai. Raseed screen par bhari hui hai, aap check karke save kar lijiye.', state: {}, end: true };
  }

  return {
    reply: [...notes, `${summary} ki raseed screen par bhar di hai. Save aur print karun?`].join(' '),
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
      const hint = pageOpen() ? '' : ' Pehle website par Cash Receipt page khol lijiye.';
      return res.json(say(`Namaste! Main Sarthak hoon.${hint} Kis party ki raseed banani hai?`, { awaiting: 'party' },
        { reprompt: 'Party ka naam aur amount boliye, jaise Suresh Kirana ki chaudah hazaar ki raseed.' }));
    }

    if (requestType === 'SessionEndedRequest') {
      return res.json({ version: '1.0', response: { shouldEndSession: true } });
    }

    if (requestType !== 'IntentRequest') {
      return res.json(say('Kuch samajh nahi aaya. Phir se boliye.', state));
    }

    const intentName = body.request.intent?.name;
    console.log('[Alexa] Intent:', intentName);

    if (intentName === 'AMAZON.HelpIntent') {
      return res.json(say('Party ka naam aur amount boliye, jaise: Suresh Kirana ki chaudah hazaar ki raseed banao. Main screen par bhar dungi, phir print karo boliye.', state));
    }
    if (intentName === 'AMAZON.StopIntent' || intentName === 'AMAZON.CancelIntent') {
      return res.json(say('Theek hai, alvida!', {}, { end: true }));
    }

    const slots = body.request.intent?.slots || {};
    const voiceText = slots.command?.value || slots.query?.value || '';
    if (!voiceText) {
      // FallbackIntent carries no text — repeat the pending question
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
