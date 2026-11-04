export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { message } = req.body;

  if (!process.env.GEMINI_API_KEY) {
    return res.status(200).json({ reply: "Error: API key is missing in Vercel." });
  }

  const system =
    "You are a patient tutor for beginners learning software development. " +
    "Ask what they've tried before explaining. Give hints first and a full " +
    "answer only if they're still stuck. Keep replies short and clear.";

  const models = ["gemini-2.5-flash", "gemini-2.5-flash-lite"];
  let lastError = "";

  for (const model of models) {
    try {
      const r = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": process.env.GEMINI_API_KEY
          },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: system }] },
            contents: [{ role: "user", parts: [{ text: message }] }]
          })
        }
      );
      const data = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return res.status(200).json({ reply: text });
      }
      lastError = data?.error?.message || JSON.stringify(data);
    } catch (err) {
      lastError = err.message;
    }
  }

  return res.status(200).json({ reply: "Error: " + lastError });
          }
