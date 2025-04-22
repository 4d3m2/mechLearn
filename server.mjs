import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import session from 'express-session';

dotenv.config();

if (!process.env.GEMINI_API_KEY) {
  console.error('GEMINI_API_KEY environment variable is not set');
  process.exit(1);
}

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  options: {
    auth: {
      useApiKey: true
    }
  }
});

const app = express();
const port = 5000;

app.use(cors({
  origin: 'https://v0-educational-web-platform-gilt.vercel.app/',
  credentials: true
}));

app.use(bodyParser.json());
app.use(session({
  secret: process.env.SECRET_KEY,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: false }
}));

function cleanJsonOutput(text) {
  return text
    .replace(/^```json/, '')
    .replace(/^```/, '')
    .replace(/```$/, '')
    .trim();
}

app.post('/description', async (req, res) => {
  try {
    const { partName } = req.body;

    if (!partName) return res.status(400).json({ error: 'Please provide a part name.' });

    const descriptionPrompt = `You are a strict JSON API. Describe the mechanical part "${partName}" in exactly this format:

{
  "description": "Short general description (max 4 lines)",
  "technicalDetails": "Technical details (max 4 lines)",
  "functionSummary": "1-line function summary"
}

Return only the pure JSON object with double quotes. No markdown, no extra text, no explanations.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: descriptionPrompt
    });

    const rawText = response.text;
    const cleaned = cleanJsonOutput(rawText);

    let parsedJson;
    try {
      parsedJson = JSON.parse(cleaned);
    } catch (err) {
      console.warn('Failed to parse JSON. Returning raw text.');
      return res.json({ partName, raw: rawText });
    }

    req.session.partDescription = cleaned;
    req.session.conversationHistory = [`System: Description of ${partName}: ${cleaned}`];

    res.json({ partName, description: parsedJson });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate description.', details: error.message });
  }
});

app.post('/chat', async (req, res) => {
  try {
    const { question } = req.body;

    if (!question) return res.status(400).json({ error: 'Please provide a question.' });
    if (!req.session.partDescription) return res.status(400).json({ error: 'No part description found in session. Generate one first.' });

    req.session.conversationHistory = req.session.conversationHistory || [];
    req.session.conversationHistory.push(`User: ${question}`);

    const fullPrompt = `${req.session.conversationHistory.join('\n')}

Answer in this strict JSON format:

{
  "answer": "..."
}

Return only the JSON object. Do not include markdown, code fences, or explanations.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: fullPrompt
    });

    const rawText = response.text;
    const cleaned = cleanJsonOutput(rawText);

    let parsedJson;
    try {
      parsedJson = JSON.parse(cleaned);
    } catch (err) {
      console.warn('Failed to parse chat JSON. Returning raw text.');
      return res.json({ question, raw: rawText });
    }

    req.session.conversationHistory.push(`AI: ${cleaned}`);
    res.json({ question, answer: parsedJson });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate chat response.', details: error.message });
  }
});

app.post('/reset', (req, res) => {
  req.session.destroy(() => {
    res.json({ message: 'Session reset successfully.' });
  });
});

app.get('/session', (req, res) => {
  if (req.session.conversationHistory) {
    res.json({ conversationHistory: req.session.conversationHistory });
  } else {
    res.status(400).json({ error: 'No conversation history found.' });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
