require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// OpenAI API key test endpoint
app.get('/api/test-openai', async (req, res) => {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'OPENAI_API_KEY not set in .env file'
    });
  }

  try {
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    const data = await response.json();

    if (response.ok && data.data && data.data.length > 0) {
      res.json({
        success: true,
        message: '✅ OpenAI API key வேலை செய்கிறது!',
        models: data.data.slice(0, 5).map(m => m.id)
      });
    } else {
      res.status(response.status).json({
        success: false,
        error: data.error?.message || 'API test failed',
        status: response.status
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Gemini API key test endpoint (தேவைப்பட்டால்)
app.post('/api/test-gemini', async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({
      success: false,
      error: 'GEMINI_API_KEY not set in .env file'
    });
  }

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: 'Hello' }] }]
      })
    });

    const data = await response.json();

    if (response.ok && data.candidates && data.candidates.length > 0) {
      res.json({
        success: true,
        message: '✅ Gemini API key வேலை செய்கிறது!',
        response: data.candidates[0].content?.parts[0]?.text
      });
    } else {
      res.status(response.status).json({
        success: false,
        error: data.error?.message || 'API test failed',
        status: response.status
      });
    }
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
