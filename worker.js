export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // 專屬台股即時報價與走勢轉發 API
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

    // 其餘網址正常回傳靜態網頁檔案
    return env.ASSETS.fetch(request);
  }
};
