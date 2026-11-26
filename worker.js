export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 1. 台股即時報價與走勢轉發 API
    if (url.pathname === "/api/quote") {
      const symbol = url.searchParams.get("symbol");
      const interval = url.searchParams.get("interval") || "1d";
      const range = url.searchParams.get("range") || "1mo";

      if (!symbol) {
        return new Response(JSON.stringify({ error: "Missing symbol" }), {
          status: 400,
          headers: { "Content-Type": "application/json" }
        });
      }

      const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
      try {
        const res = await fetch(yahooUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Accept": "application/json"
          }
        });
        const data = await res.text();
        return new Response(data, {
          status: res.status,
          headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Cache-Control": "public, max-age=60"
          }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 502,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // 2. Gemini AI 個股白話來歷與買前體檢接口（自動偵測金鑰可用模型）
    if (url.pathname === "/api/ai-intro") {
      const code = url.searchParams.get("code") || "";
      const name = url.searchParams.get("name") || "";
      const price = url.searchParams.get("price") || "";
      const monthPct = url.searchParams.get("monthPct") || "0";
      const posRatio = url.searchParams.get("posRatio") || "50";
      const charId = url.searchParams.get("char") || "fish";

      const apiKey = (env.GEMINI_API_KEY || "").trim();
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "GEMINI_API_KEY not configured" }), {
          status: 500,
          headers: { "Content-Type": "application/json" }
        });
      }

      const persona = charId === "hakimi"
        ? "你現在是『星光貓娘哈基米』，自稱『本貓』，稱呼使用者為『你』，語氣聰明、俏皮帶點傲嬌可愛（偶爾在句尾加『喵～』），擅長用生活化比喻幫投資小白看懂台股。"
        : "你現在是『大肥魚女僕』，自稱『本魚』，稱呼使用者為『主人』，語氣溫柔體貼、從容穩健，擅長用喝茶看海的生活化比喻幫投資小白解釋台股。";

      const prompt = `${persona}
請針對台股代號「${code}」（市場名稱：${name}，目前股價 NT$${price}，近30日漲跌幅 ${monthPct}%，目前處於近30日高低區間的 ${posRatio}% 位置），寫一段給股市小白看的白話介紹與買前小提醒。

請嚴格遵守以下 JSON 格式輸出（不要加 markdown 標記，直接輸出純 JSON）：
{
  "chineseName": "這支股票或ETF最正確的繁體中文簡稱（例如 91APP*-KY 或 友達）",
  "category": "所屬產業或ETF類型（限8字以內，例如：數位雲端軟體服務、面板光電業、季配高股息ETF）",
  "suitable": "適合族群：一句話說明適合什麼樣的投資人",
  "bio": "約110～140字的白話公司來歷與賺錢模式介紹，要用你設定的角色自稱（本魚/本貓）與口吻，讓完全不懂財報的新手一看就懂它是做什麼生意的！",
  "advice": "約80～110字的買前冷靜小提醒，結合它近一個月漲跌幅（${monthPct}%）與高低位階（${posRatio}%），提醒新手該用零股分批試水溫還是注意追高風險。"
}`;

      // 先動態向 Google 查詢此金鑰目前開通的可用模型清單
      let candidateModels = ["models/gemini-3.8-flash", "models/gemini-2.5-flash"];
      try {
        const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`);
        if (listRes.ok) {
          const listJson = await listRes.json();
          const valid = (listJson.models || [])
            .filter(m => (m.supportedGenerationMethods || []).includes("generateContent") && m.name.includes("flash"))
            .map(m => m.name);
          if (valid.length > 0) {
            candidateModels = [...new Set([...valid, ...candidateModels])];
          }
        }
      } catch (e) {}

      let errorsLog = [];

      for (const fullModelName of candidateModels) {
        try {
          const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/${fullModelName}:generateContent?key=${encodeURIComponent(apiKey)}`;
          const aiRes = await fetch(geminiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "x-goog-api-key": apiKey
            },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                temperature: 0.7,
                responseMimeType: "application/json"
              }
            })
          });

          const aiJson = await aiRes.json();
          const rawText = aiJson?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (rawText) {
            const cleaned = rawText.replace(/^```json\s*/i, "").replace(/```\s*$/i, "").trim();
            return new Response(cleaned, {
              status: 200,
              headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Access-Control-Allow-Origin": "*",
                "Cache-Control": "public, max-age=3600"
              }
            });
          }
          errorsLog.push({ model: fullModelName, error: aiJson?.error?.message || aiJson });
        } catch (err) {
          errorsLog.push({ model: fullModelName, error: err.message });
        }
      }

      return new Response(JSON.stringify({ error: "All models failed", tried: errorsLog }), {
        status: 502,
        headers: { "Content-Type": "application/json" }
      });
    }

    // 3. 其餘網址正常回傳靜態網頁檔案
    return env.ASSETS.fetch(request);
  }
};
