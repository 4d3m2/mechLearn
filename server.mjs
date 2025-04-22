import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';

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
  origin: '*',
  credentials: true
}));

app.use(bodyParser.json());

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

    const prompt = `You are an AI assistant. Answer the following question clearly and concisely in a JSON format:

User: ${question}

Respond in this JSON format:
{
  "answer": "..."
}

Return only the JSON object. Do not include markdown, code fences, or explanations.`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt
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

    res.json({ question, answer: parsedJson });

  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to generate chat response.', details: error.message });
  }
});


app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
