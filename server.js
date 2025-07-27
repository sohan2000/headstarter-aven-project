require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { PineconeClient } = require('@pinecone-database/pinecone');

const app = express();
const PORT = process.env.SERVER_PORT || 5001;
const LLAMA_PORT = process.env.LLAMA_PORT || 5002;

app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

const PINECONE_API_KEY = process.env.PINECONE_API_KEY;
const PINECONE_ENV = process.env.PINECONE_ENVIRONMENT;
const PINECONE_INDEX = process.env.PINECONE_INDEX_NAME;
const HF_TOKEN = process.env.HF_TOKEN;

// Helper: Get embedding from Hugging Face
async function getEmbedding(text) {
  const response = await axios.post(
    'https://api-inference.huggingface.co/pipeline/feature-extraction/sentence-transformers/all-MiniLM-L6-v2',
    { inputs: text },
    { headers: { Authorization: `Bearer ${HF_TOKEN}` } }
  );
  return response.data[0];
}

// Helper: Call Llama-3 8B (Python microservice)
async function callLlamaModel(prompt) {
  const response = await axios.post(`http://localhost:${LLAMA_PORT}/generate`, { prompt });
  return response.data.answer;
}

app.post('/api/ask', async (req, res) => {
  const { question } = req.body;
  try {
    // 1. Get embedding for the question
    const embedding = await getEmbedding(question);

    // 2. Query Pinecone for relevant context
    const pinecone = new PineconeClient();
    await pinecone.init({ apiKey: PINECONE_API_KEY, environment: PINECONE_ENV });
    const index = pinecone.Index(PINECONE_INDEX);

    const pineconeResults = await index.query({
      vector: embedding,
      topK: 3,
      includeMetadata: true
    });

    // 3. Build context string
    const context = pineconeResults.matches
      .map(match => match.metadata?.text || '')
      .join('\n');

    // 4. Build prompt for Llama-3
    const prompt = `Context:\n${context}\n\nQuestion: ${question}\n\nAnswer:`;

    // 5. Get answer from Llama-3
    const answer = await callLlamaModel(prompt);

    // 6. Guardrails
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
