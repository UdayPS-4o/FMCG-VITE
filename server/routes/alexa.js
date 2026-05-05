const express = require('express');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const router = express.Router();

// ─── Constants ────────────────────────────────────────────────────────────────
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';
const COMMANDS_FILE = path.join(__dirname, '..', 'db', 'alexa_commands.json');

// ─── Helpers ──────────────────────────────────────────────────────────────────
const alexaResponse = (speechText, repromptText, shouldEndSession = false) => ({
  version: '1.0',
  response: {
    outputSpeech: { type: 'PlainText', text: speechText },
    reprompt: {
      outputSpeech: { type: 'PlainText', text: repromptText || speechText }
    },
    shouldEndSession
  }
});

const readCommands = async () => {
  try {
    const data = await fs.readFile(COMMANDS_FILE, 'utf8');
    return JSON.parse(data);
  } catch {
    return [];
  }
};

const writeCommands = async (commands) => {
  await fs.writeFile(COMMANDS_FILE, JSON.stringify(commands, null, 2));
};

const queueCommand = async (actions, voiceText) => {
  const commands = await readCommands();
  const newCommand = {
    id: Date.now().toString(),
    voiceText,
    actions,
    status: 'pending',
    createdAt: new Date().toISOString()
  };
  commands.push(newCommand);
  await writeCommands(commands.slice(-50));
  return newCommand;
};

/**
 * Parse the voice command with Gemini and return { reply, actions }
 */
const parseCommandWithGemini = async (voiceText) => {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set');

  const systemInstruction = `You are Sarthak, an AI assistant for an FMCG billing system called Ekta Enterprises.
The user gives voice commands to create cash receipts.

Respond ONLY with valid JSON (no markdown, no backticks) with this exact structure:
{
  "reply": "<short spoken reply in same language as user, 1-2 sentences>",
  "actions": [
    { "type": "update_field", "field": "<party|amount|series|narration|date|discount|receiptNo>", "value": "<value>" },
    { "type": "search_party", "searchTerm": "<English transliteration of party name>" },
    { "type": "print_receipt" }
  ]
}

Rules:
- Translate Hindi party names to English (सुरेश → Suresh, राम → Ram)
- For greetings or questions, set actions to []
- Keep reply short and conversational`;

  const url = `${GEMINI_BASE_URL}/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`;
  const response = await axios.post(url, {
    contents: [{ role: 'user', parts: [{ text: voiceText }] }],
    systemInstruction: { parts: [{ text: systemInstruction }] },
    generationConfig: { responseMimeType: 'application/json', temperature: 0.3 }
  }, { timeout: 25000 });

  const raw = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    return match ? JSON.parse(match[0]) : { reply: 'Command process ho gaya.', actions: [] };
  }
};

// ─── Alexa Webhook ────────────────────────────────────────────────────────────
router.post('/webhook', async (req, res) => {
  try {
    const body = req.body;
    const requestType = body?.request?.type;

    console.log('[Alexa] Request type:', requestType);

    // ── LaunchRequest ─────────────────────────────────────────────────────────
    if (requestType === 'LaunchRequest') {
      return res.json(alexaResponse(
        'Namaste! Main Sarthak hoon. Aap koi bhi command de sakte hain. Jaise: Suresh ki chaudah hazaar rupaye ki receipt banao.',
        'Kya command dena chahte hain?'
      ));
    }

    // ── SessionEndedRequest ───────────────────────────────────────────────────
    if (requestType === 'SessionEndedRequest') {
      return res.json({ version: '1.0', response: { shouldEndSession: true } });
    }

    // ── IntentRequest ─────────────────────────────────────────────────────────
    if (requestType === 'IntentRequest') {
      const intentName = body.request.intent?.name;
      console.log('[Alexa] Intent:', intentName);

      // Help
      if (intentName === 'AMAZON.HelpIntent') {
        return res.json(alexaResponse(
          'Aap keh sakte hain: Suresh ki chaudah hazaar rupaye ki receipt banao, ya party ka amount set karo, ya receipt print karo. Kya karna hai?',
          'Koi command dein.'
        ));
      }

      // Stop / Cancel
      if (intentName === 'AMAZON.StopIntent' || intentName === 'AMAZON.CancelIntent') {
        return res.json(alexaResponse('Theek hai, alvida!', '', true));
      }

      // Main command intent or fallback — extract the spoken text
      let voiceText = '';
      const slots = body.request.intent?.slots || {};
      voiceText = slots.command?.value || slots.query?.value || '';

      // For FallbackIntent, try to get whatever Alexa heard
      if (!voiceText && intentName === 'AMAZON.FallbackIntent') {
        voiceText = 'general help';
      }

      if (!voiceText) {
        return res.json(alexaResponse(
          'Mujhe aapki baat samajh nahi aayi. Phir se bolein.',
          'Kya karna hai?'
        ));
      }

      console.log('[Alexa] Processing voice command:', voiceText);

      try {
        const parsed = await parseCommandWithGemini(voiceText);
        const replyText = parsed.reply || 'Theek hai, command process ho raha hai.';

        if (parsed.actions && parsed.actions.length > 0) {
          await queueCommand(parsed.actions, voiceText);
          console.log('[Alexa] Queued', parsed.actions.length, 'action(s)');
        }

        return res.json(alexaResponse(replyText, 'Koi aur kaam hai?'));
      } catch (err) {
        console.error('[Alexa] Gemini error:', err.message);
        return res.json(alexaResponse(
          'Server se response aane mein problem ho rahi hai. Thodi der baad try karein.',
          'Phir se try karein.'
        ));
      }
    }

    // Unknown request type
    return res.json(alexaResponse('Kuch samajh nahi aaya. Phir se bolein.', 'Kya karna hai?'));

  } catch (err) {
    console.error('[Alexa] Webhook error:', err.message);
    return res.status(200).json(alexaResponse(
      'Kuch technical problem aa gayi. Please thodi der baad try karein.',
      'Phir se try karein.'
    ));
  }
});

// ─── Command Queue API (called by the web app) ────────────────────────────────

/** GET /api/alexa/commands/pending — web app polls this */
router.get('/commands/pending', async (req, res) => {
  try {
    const commands = await readCommands();
    const pending = commands.filter(c => c.status === 'pending');
    res.json({ commands: pending });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read commands' });
  }
});

/** POST /api/alexa/commands/:id/complete — web app marks command as done */
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
