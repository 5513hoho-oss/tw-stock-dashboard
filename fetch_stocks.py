import json
import urllib.request
import urllib.parse
from datetime import datetime, timezone, timedelta

# 台灣時間 (UTC+8)
TW_TZ = timezone(timedelta(hours=8))

# 9 檔台灣熱門 ETF 與個股清單（可隨時自行增減）
STOCKS = [
    {"code": "0050",   "yahoo": "0050.TW",   "name": "元大台灣50",     "style": "steady",   "yield": 3.4, "tag": "市值型龍頭", "desc": "一次買進台灣前 50 大上市公司，跟著台灣經濟長期成長，最適合新手當作第一檔核心配置。"},
    {"code": "006208", "yahoo": "006208.TW", "name": "富邦台50",       "style": "steady",   "yield": 3.3, "tag": "低內扣市值型", "desc": "追蹤指數與 0050 相同，但內扣管理費更低、單價更親民，小資族定期定額首選。"},
    {"code": "00878",  "yahoo": "00878.TW",  "name": "國泰永續高股息", "style": "dividend", "yield": 6.8, "tag": "季配息人氣王", "desc": "結合 ESG 與高股息選股，波動度相對溫和，每季穩定配息，適合想建立現金流的新手。"},
    {"code": "0056",   "yahoo": "0056.TW",   "name": "元大高股息",     "style": "dividend", "yield": 7.2, "tag": "老牌高股息", "desc": "台灣歷史最悠久的高股息 ETF，預測未來一年殖利率最高的 50 檔成分股。"},
    {"code": "00919",  "yahoo": "00919.TW",  "name": "群益台灣精選高息", "style": "dividend", "yield": 8.5, "tag": "高殖利率季配", "desc": "精準鎖定已宣告高股利之企業，近年配息表現亮眼，適合追求較高息收的族群。"},
    {"code": "00713",  "yahoo": "00713.TW",  "name": "元大台灣高息低波", "style": "steady",   "yield": 6.1, "tag": "抗跌低波動", "desc": "兼具高股息與低波動特性，大盤下跌時通常較抗跌，適合保守型投資人。"},
    {"code": "2330",   "yahoo": "2330.TW",   "name": "台積電",         "style": "growth",   "yield": 1.6, "tag": "護國神山", "desc": "全球晶圓代工龍頭，受惠 AI 與高效能運算長期趨勢，波動較 ETF 大，建議用零股分批買進。"},
    {"code": "2884",   "yahoo": "2884.TW",   "name": "玉山金",         "style": "dividend", "yield": 4.8, "tag": "存股族愛用金融", "desc": "經營穩健且股利政策透明，單價親民，是許多小資族每月存零股的入門金融股。"},
    {"code": "00679B", "yahoo": "00679B.TWO","name": "元大美債20年",   "style": "steady",   "yield": 4.3, "tag": "避險資產配置", "desc": "投資美國政府長天期公債，通常與股市呈負相關，適合用來平衡股票部位的波動風險。"}
]

def fetch_yahoo_chart(symbol, interval="5m", range_str="1d"):
    encoded = urllib.parse.quote(symbol)
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}?interval={interval}&range={range_str}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req, timeout=15) as resp:
        data = json.loads(resp.read().decode("utf-8"))
        return data["chart"]["result"][0]

def main():
    now_tw = datetime.now(TW_TZ)
    output = {
        "updated_at": now_tw.strftime("%Y-%m-%d %H:%M"),
        "market": {},
        "stocks": []
    }

    # 1. 抓取台灣加權指數 (^TWII) 盤中走勢與開盤/現價
    try:
        twii = fetch_yahoo_chart("^TWII", interval="5m", range_str="1d")
        meta = twii["meta"]
        timestamps = twii.get("timestamp", [])
        closes = twii["indicators"]["quote"][0]["close"]

        prev_close = meta.get("chartPreviousClose") or meta.get("previousClose")
        current_price = meta.get("regularMarketPrice")
        open_price = None

        labels = []
        points = []
        for ts, val in zip(timestamps, closes):
            if val is not None:
                if open_price is None:
                    open_price = round(val, 2)
                t_str = datetime.fromtimestamp(ts, TW_TZ).strftime("%H:%M")
                labels.append(t_str)
                points.append(round(val, 2))

        if open_price is None:
            open_price = current_price

        change = round(current_price - prev_close, 2)
        change_pct = round((change / prev_close) * 100, 2) if prev_close else 0

        output["market"] = {
            "prev_close": round(prev_close, 2),
            "open": open_price,
            "current": round(current_price, 2),
            "change": change,
            "change_pct": change_pct,
            "labels": labels,
            "points": points
        }
    except Exception as e:
        print(f"抓取大盤失敗: {e}")

    # 2. 抓取 9 檔股票/ETF 最新報價
    for item in STOCKS:
        try:
            res = fetch_yahoo_chart(item["yahoo"], interval="1d", range_str="1d")
            meta = res["meta"]
            price = round(meta.get("regularMarketPrice", 0), 2)
            prev = meta.get("chartPreviousClose") or meta.get("previousClose") or price
            chg_pct = round(((price - prev) / prev) * 100, 2) if prev else 0

            output["stocks"].append({
                "code": item["code"],
                "name": item["name"],
                "style": item["style"],
                "price": price,
                "change_pct": chg_pct,
                "yield": item["yield"],
                "tag": item["tag"],
                "desc": item["desc"]
            })
        except Exception as e:
            print(f"抓取 {item['code']} 失敗: {e}")

    with open("stock_data.json", "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, indent=2)
    print("stock_data.json 更新完成！")

if __name__ == "__main__":
    main()
