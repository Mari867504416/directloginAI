

fetch("https://api.openai.com/v1/models", {
  method: "GET",
  headers: {
    "Authorization": `Bearer ${API_KEY}`
  }
})
  .then(response => {
    console.log("Status:", response.status);
    return response.json();
  })
  .then(data => {
    console.log("Response:", JSON.stringify(data, null, 2));
    if (data.data && data.data.length > 0) {
      console.log("✅ API key வேலை செய்கிறது!");
      console.log("Available models:", data.data.map(m => m.id).slice(0, 5));
    } else {
      console.log("⚠️ Response வந்தது ஆனால் models இல்லை");
    }
  })
  .catch(error => {
    console.error("❌ Error:", error.message);
  });
