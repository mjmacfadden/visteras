/**
 * Visteras Firebase Cloud Functions - Pixabay Search Proxy
 * Proxies requests to Pixabay API while protecting the API key in Firebase Secret Manager.
 */

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");

const pixabayApiKey = defineSecret("PIXABAY_API_KEY");

exports.pixabaySearch = onRequest(
  {
    secrets: [pixabayApiKey],
    cors: [/visteras\.com$/, /localhost(:\d+)?$/, /127\.0\.0\.1(:\d+)?$/],
    maxInstances: 10,
  },
  async (req, res) => {
    // Only allow GET requests
    if (req.method !== "GET") {
      return res.status(405).json({ error: "Method Not Allowed" });
    }

    const key = pixabayApiKey.value();
    if (!key) {
      return res.status(500).json({ error: "Pixabay API key is not configured in Firebase secrets." });
    }

    const query = req.query.q || "vintage";
    const imageType = req.query.image_type || "all";
    const category = req.query.category || "";
    const colors = req.query.colors || ""; // Comma-separated (e.g. red,orange,yellow)
    const editorsChoice = req.query.editors_choice === "true" ? "&editors_choice=true" : "";
    const orientation = req.query.orientation || "all";
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = Math.min(200, Math.max(3, parseInt(req.query.per_page, 10) || 40));

    let targetUrl = `https://pixabay.com/api/?key=${key}` +
      `&q=${encodeURIComponent(query)}` +
      `&image_type=${encodeURIComponent(imageType)}` +
      `&orientation=${encodeURIComponent(orientation)}` +
      `&safesearch=true` +
      `&per_page=${perPage}` +
      `&page=${page}` +
      editorsChoice;

    if (category) {
      targetUrl += `&category=${encodeURIComponent(category)}`;
    }
    if (colors) {
      targetUrl += `&colors=${encodeURIComponent(colors)}`;
    }

    try {
      const response = await fetch(targetUrl);
      if (!response.ok) {
        return res.status(response.status).json({ error: `Pixabay API returned HTTP ${response.status}` });
      }
      const data = await response.json();
      
      // Cache response for 1 hour on CDN / client
      res.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
      return res.json(data);
    } catch (err) {
      console.error("Pixabay proxy error:", err);
      return res.status(500).json({ error: "Failed to fetch images from Pixabay proxy." });
    }
  }
);
