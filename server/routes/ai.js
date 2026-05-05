const express = require('express');
const axios = require('axios');
const router = express.Router();

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

/**
 * POST /api/ai/chat
 *
 * Body:
 * {
 *   model: string,           // e.g. "gemini-2.5-flash"
 *   systemInstruction: string,
 *   history: Array<{ role: string, parts: Array<{ text: string }> }>,
 *   message: string | Array, // current user message (string or array of Part objects)
 *   tools?: any              // optional function declarations
 * }
 *
 * Returns:
 * {
 *   text?: string,
 *   functionCalls?: Array<{ name: string, args: object }>
 * }
 */
router.post('/chat', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key not configured on server.' });
  }

  const { model = 'gemini-2.5-flash', systemInstruction, history = [], message, tools } = req.body;

  if (!message) {
    return res.status(400).json({ error: 'message is required' });
  }

  // Build the Gemini REST payload
  // history comes in as [{role, parts:[{text}]}]
  // message can be a string (user text) or an array of Part objects (function responses)
  const contents = [
    ...history,
    {
      role: 'user',
      parts: typeof message === 'string' ? [{ text: message }] : message,
    },
  ];

  const payload = {
    contents,
    ...(systemInstruction && {
      systemInstruction: { parts: [{ text: systemInstruction }] },
    }),
    ...(tools && { tools }),
  };

  try {
    const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000, // 60s timeout for long AI responses
    });

    const candidate = response.data?.candidates?.[0];
    if (!candidate) {
      return res.status(502).json({ error: 'No response from Gemini' });
    }

    const content = candidate.content;
    const text = content?.parts?.find(p => p.text)?.text || null;
    const functionCalls = content?.parts
      ?.filter(p => p.functionCall)
      ?.map(p => ({ name: p.functionCall.name, args: p.functionCall.args })) || [];

    return res.json({ text, functionCalls });
  } catch (err) {
    console.error('[AI proxy] Gemini API error:', err?.response?.data || err.message);
    return res.status(502).json({
      error: 'Gemini API request failed',
      details: err?.response?.data?.error?.message || err.message,
    });
  }
});

/**
 * POST /api/ai/chat/function-response
 *
 * Used to send function call results back to Gemini and get the next response.
 *
 * Body:
 * {
 *   model: string,
 *   systemInstruction: string,
 *   history: Array<{ role, parts }>,   // full history including the last model turn with functionCall
 *   functionResponses: Array<{ name: string, response: object }>
 * }
 */
router.post('/chat/function-response', async (req, res) => {
  if (!GEMINI_API_KEY) {
    return res.status(500).json({ error: 'Gemini API key not configured on server.' });
  }

  const { model = 'gemini-2.5-flash', systemInstruction, history = [], functionResponses, tools } = req.body;

  if (!functionResponses || !Array.isArray(functionResponses)) {
    return res.status(400).json({ error: 'functionResponses array is required' });
  }

  // Append the function response turn
  const contents = [
    ...history,
    {
      role: 'user',
      parts: functionResponses.map(fr => ({
        functionResponse: { name: fr.name, response: fr.response },
      })),
    },
  ];

  const payload = {
    contents,
    ...(systemInstruction && {
      systemInstruction: { parts: [{ text: systemInstruction }] },
    }),
    ...(tools && { tools }),
  };

  try {
    const url = `${GEMINI_BASE_URL}/models/${model}:generateContent?key=${GEMINI_API_KEY}`;
    const response = await axios.post(url, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 60000,
    });

    const candidate = response.data?.candidates?.[0];
    if (!candidate) {
      return res.status(502).json({ error: 'No response from Gemini' });
    }

    const content = candidate.content;
    const text = content?.parts?.find(p => p.text)?.text || null;
    const functionCalls = content?.parts
      ?.filter(p => p.functionCall)
      ?.map(p => ({ name: p.functionCall.name, args: p.functionCall.args })) || [];

    return res.json({ text, functionCalls });
  } catch (err) {
    console.error('[AI proxy] Gemini function-response error:', err?.response?.data || err.message);
    return res.status(502).json({
      error: 'Gemini API request failed',
      details: err?.response?.data?.error?.message || err.message,
    });
  }
});

module.exports = router;
