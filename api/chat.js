export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "POST only" });
  }
  const { message } = req.body;
  res.status(200).json({ reply: "Server heard: " + message });
}
