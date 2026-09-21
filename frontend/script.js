const API_BASE = 'http://localhost:3000/api';

// OpenAI test
document.getElementById('testOpenAI').addEventListener('click', async () => {
  const resultDiv = document.getElementById('openAIResult');
  
  resultDiv.className = 'result show loading';
  resultDiv.textContent = '⏳ Testing...';

  try {
    const response = await fetch(`${API_BASE}/test-openai`);
    const data = await response.json();

    if (data.success) {
      resultDiv.className = 'result show success';
      resultDiv.innerHTML = `
        <strong>${data.message}</strong><br>
        <small>Available models: ${data.models.join(', ')}</small>
      `;
    } else {
      resultDiv.className = 'result show error';
      resultDiv.textContent = `❌ ${data.error} (Status: ${data.status})`;
    }
  } catch (error) {
    resultDiv.className = 'result show error';
    resultDiv.textContent = `❌ Network error: ${error.message}`;
  }
});

// Gemini test
document.getElementById('testGemini').addEventListener('click', async () => {
  const resultDiv = document.getElementById('geminiResult');
  
  resultDiv.className = 'result show loading';
  resultDiv.textContent = '⏳ Testing...';

  try {
    const response = await fetch(`${API_BASE}/test-gemini`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    });
    const data = await response.json();

    if (data.success) {
      resultDiv.className = 'result show success';
      resultDiv.innerHTML = `
        <strong>${data.message}</strong><br>
        <small>Response: "${data.response}"</small>
      `;
    } else {
      resultDiv.className = 'result show error';
      resultDiv.textContent = `❌ ${data.error} (Status: ${data.status})`;
    }
  } catch (error) {
    resultDiv.className = 'result show error';
    resultDiv.textContent = `❌ Network error: ${error.message}`;
  }
});
