export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }

  const { message, history, profile, mode } = req.body || {};
  const isRoadmap = mode === "roadmap";

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required." });
  }

  if (!process.env.GEMINI_API_KEY) {
    return res.status(500).json({ error: "API key is missing in Vercel." });
  }

  // Only accept known level/goal values
  const LEVELS = ["Beginner", "Intermediate", "Professional"];
  const GOALS = ["Learn from scratch", "Get a job", "Build projects"];
  const level = LEVELS.includes(profile?.level) ? profile.level : "Beginner";
  const goal = GOALS.includes(profile?.goal) ? profile.goal : "Learn from scratch";

  const levelGuide = {
    Beginner:
      "Use plain words, explain any jargon, and use simple examples. " +
      "Go step by step.",
    Intermediate:
      "Assume they know the basics. Skip definitions of common terms and " +
      "focus on how and why things work.",
    Professional:
      "Assume strong background knowledge. Be technical and concise, " +
      "mention trade-offs and best practices, and skip the basics."
  };

  const goalGuide = {
    "Learn from scratch":
      "Build their understanding from the ground up before going deeper.",
    "Get a job":
      "Focus on what employers expect, common interview topics, and " +
      "practical skills.",
    "Build projects":
      "Focus on hands-on examples they can use in a real project."
  };

  const system =
    "You are a patient tutor for people learning technology. " +
    `The learner's level is ${level} and their goal is: ${goal}. ` +
    levelGuide[level] + " " + goalGuide[goal] + " " +
    "Ask what they've tried before explaining. Give hints first and a full " +
    "answer only if they're still stuck. Keep replies short and clear. " +
    "Use the earlier messages in this conversation so the learner never " +
    "has to repeat themselves.";

  const roadmapSystem =
    "You design learning roadmaps for technology learners. " +
    "Reply with only a JSON array of 6 to 8 objects, each with " +
    "\"title\", \"desc\" (one sentence) and \"type\" (\"theory\" or \"practical\"). " +
    "No questions, no extra text.";

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

  // A roadmap request never uses the chat history
  if (isRoadmap) past = [];

  const contents = [
    ...past,
    { role: "user", parts: [{ text: message.slice(0, 2000) }] }
  ];

  const models = ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.5-flash-lite"];
  const errors = [];
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  for (const model of models) {
    for (let attempt = 0; attempt < 2; attempt++) {
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
              systemInstruction: {
                parts: [{ text: isRoadmap ? roadmapSystem : system }]
              },
              contents,
              ...(isRoadmap
                ? { generationConfig: { responseMimeType: "application/json" } }
                : {})
            })
          }
        );
        const data = await r.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (text) {
          return res.status(200).json({ reply: text });
        }
        errors.push(model + ": " + (data?.error?.message || "no text"));
        // retry only when Google is busy
        if (r.status !== 503 && r.status !== 429) break;
        await wait(1000);
      } catch (err) {
        errors.push(model + ": " + err.message);
        await wait(1000);
      }
    }
  }

  console.error("Gemini failed:", errors.join(" | "));
  return res.status(500).json({ error: errors.join(" | ") });
}
