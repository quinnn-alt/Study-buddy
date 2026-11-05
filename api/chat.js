export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { message, history } = req.body || {};

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "API key is missing in Vercel." });
  }

  const system =
    "You are a patient tutor for beginners learning software development. " +
    "Ask what they've tried before explaining. Give hints first and a full " +
    "answer only if they're still stuck. Keep replies short and clear. " +
    "Use the earlier messages in this conversation so the learner never " +
    "has to repeat themselves.";

  // Clean the history: valid roles only, last 10, must start with a user message
  let past = Array.isArray(history) ? history : [];
  past = past
    .filter(
      (m) =>
        m &&
        (m.role === "user" || m.role === "model") &&
        typeof m.text === "string" &&
        m.text.trim()
    )
    .slice(-10)
    .map((m) => ({
      role: m.role,
      parts: [{ text: m.text.slice(0, 2000) }]
    }));

  while (past.length && past[0].role !== "user") {
    past.shift();
  }

  const contents = [
    ...past,
    { role: "user", parts: [{ text: message.slice(0, 2000) }] }
  ];

  const models = ["gemini-3.8-flash", "gemini-3.5-flash"];
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
            contents
          })
        }
      );
      const data = await r.json();
      const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (text) {
        return res.status(200).json({ reply: text });
      }
      lastError = model + ": " + (data?.error?.message || JSON.stringify(data));
    } catch (err) {
      lastError = model + ": " + err.message;
    }
  }

  console.error("Gemini failed:", lastError);
  return res.status(200).json({ reply: "Error: " + lastError });
}
