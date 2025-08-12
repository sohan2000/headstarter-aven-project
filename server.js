require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { PineconeClient } = require('@pinecone-database/pinecone');

const app = express();
const PORT = process.env.SERVER_PORT || 5001;
const LLAMA_PORT = process.env.LLAMA_PORT || 5002;

app.use(cors({ 
  origin: ['http://localhost:3000', 'https://headstarter-aven-project.vercel.app'],
  credentials: true 
}));
app.use(express.json());

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_ENV = process.env.PINECONE_ENVIRONMENT;
const PINECONE_INDEX = process.env.PINECONE_INDEX_NAME;
const HF_TOKEN = process.env.HF_TOKEN;

async function getEmbedding(text) {
  const response = await axios.post(
    'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2',
    { inputs: text },
    { headers: { Authorization: `Bearer ${HF_TOKEN}` } }
  );
  return response.data[0];
}

async function callLlamaModel(prompt) {
  try {
    if (process.env.NODE_ENV !== 'production') {
      const response = await axios.post(`http://localhost:${LLAMA_PORT}/generate`, { prompt });
      return response.data.answer;
    } else {
      throw new Error('Using OpenAI fallback in production');
    }
  } catch (error) {
    console.log('Using OpenAI fallback:', error.message);
    const OpenAI = require('openai');
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const completion = await openai.chat.completions.create({
      model: process.env.OPENAI_MODEL || 'gpt-3.5-turbo',
      messages: [
        {
          role: "system",
          content: "You are a helpful customer support agent for Aven. Answer questions based on the provided context."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    return completion.choices[0].message.content;
  }
}

app.post('/api/ask', async (req, res) => {
  const { question } = req.body;
  try {
    const embedding = await getEmbedding(question);

    const pinecone = new PineconeClient();
    await pinecone.init({ apiKey: PINECONE_API_KEY, environment: PINECONE_ENV });
    const index = pinecone.Index(PINECONE_INDEX);

    const pineconeResults = await index.query({
      vector: embedding,
      topK: 3,
      includeMetadata: true
    });

    const context = pineconeResults.matches
      .map(match => match.metadata?.text || '')
      .join('\n');

    const prompt = `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer:`;

    const answer = await callLlamaModel(prompt);

    let safeAnswer = answer;
    if (/ssn|social security|credit card/i.test(answer)) {
      safeAnswer = "Sorry, I can't provide personal or sensitive information.";
    }

    res.json({ answer: safeAnswer });
  } catch (err) {
    console.error(err);
    res.status(500).json({ answer: "Sorry, something went wrong on the server." });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});

process.on('uncaughtException', function (err) {
  console.error('Uncaught Exception:', err);
});
process.on('unhandledRejection', function (reason, promise) {
  console.error('Unhandled Rejection:', reason);
});
