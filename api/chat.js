// ShopFlow AI — POST /api/chat { message, context } -> { intent, entities, reply }
// Understands Roman Urdu + English shop commands and returns strict JSON.
// The Gemini key lives only in the GEMINI_API_KEY env var — never in the page.
// Model: gemini-3.5-flash-lite (proven working for Nexora AI on the free tier).
var MODEL = "gemini-3.5-flash-lite";

var SYSTEM = [
"You are ShopFlow AI, the assistant inside a small shop management app in Pakistan.",
"Understand the user's message (Roman Urdu or English) and return STRICT JSON only — no markdown, no extra text.",
"Intents (pick exactly one):",
"- add_product: user wants to add a new product. entities: {name, unit, salePrice, purchasePrice, quantity, categoryName}",
"- create_category: user wants a new category. entities: {name}",
"- check_stock: user asks about stock. entities: {productName} (empty string if asking in general)",
"- record_sale: user sold something. entities: {productName, quantity, customerName}",
"- add_customer: user wants to add a customer. entities: {name, phone}",
"- todays_sales: user asks about today's sales. entities: {}",
"- general: anything else. entities: {}",
"Rules:",
"1. A number + unit directly after the product name is part of the name (e.g. 'Atta 5kg', 'Sugar 1kg', 'Oil 1L') — never treat it as the stock quantity.",
"2. Stock quantity is the separate count (e.g. '20 packets', '10 boxes'). Unit is the word after that count (packet, box, piece, kg, litre). Default unit is 'piece', default quantity is 0.",
"3. Prices are in PKR. 'Rs 450' means salePrice 450. Never invent a price — if the selling price is missing for add_product, set salePrice to null.",
"4. Roman Urdu: 'add karo' = add, 'becho' = sell, 'banao' = create, 'kitna hai' / 'kitna stock hai' = how much stock, 'aaj ki sale' = today's sales.",
"5. reply: one short English sentence that confirms what you understood. All replies must be in English, never Urdu.",
"6. If a required field is missing, still return the intent with what you have and say in the reply what is missing."
].join("\n");

module.exports = async function (req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method not allowed." } });
    return;
  }
  var key = process.env.GEMINI_API_KEY;
  if (!key) {
    res.status(200).json({ setupNeeded: true, intent: "general", entities: {}, reply: "AI is not set up yet. Add GEMINI_API_KEY in the Vercel project settings." });
    return;
  }
  var data = req.body || {};
  var message = String(data.message || "").slice(0, 1000).trim();
  if (!message) {
    res.status(400).json({ error: { message: "Empty message." } });
    return;
  }
  var ctx = data.context || {};
  var prompt = SYSTEM + "\n\nSHOP CONTEXT (JSON):\n" + JSON.stringify(ctx).slice(0, 6000) + "\n\nUSER MESSAGE:\n" + message;
  try {
    var upstream = await fetch("https://generativelanguage.googleapis.com/v1beta/models/" + MODEL + ":generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, responseMimeType: "application/json" }
      })
    });
    if (!upstream.ok) {
      res.status(200).json({ intent: "general", entities: {}, reply: "The AI service is unavailable right now. Please try again in a moment." });
      return;
    }
    var gj = await upstream.json();
    var text = "";
    try { text = gj.candidates[0].content.parts.map(function (p) { return p.text || ""; }).join(""); } catch (e) {}
    var out = null;
    try { out = JSON.parse(text); } catch (e) {
      var m = text.match(/\{[\s\S]*\}/);
      if (m) { try { out = JSON.parse(m[0]); } catch (e2) {} }
    }
    var valid = ["add_product", "create_category", "check_stock", "record_sale", "add_customer", "todays_sales", "general"];
    if (!out || valid.indexOf(out.intent) === -1) {
      res.status(200).json({ intent: "general", entities: {}, reply: "Sorry, I could not understand that. Please try again." });
      return;
    }
    res.status(200).json({ intent: out.intent, entities: out.entities || {}, reply: String(out.reply || "How can I help with your shop?").slice(0, 500) });
  } catch (e) {
    res.status(200).json({ intent: "general", entities: {}, reply: "The AI service is unavailable right now. Please try again in a moment." });
  }
};
