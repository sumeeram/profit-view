# Diamond TP

Paper trading desk for a TradingView signal chart. Every entry is refused unless a take-profit sits on the profit side of the fill. The built-in tape can run with no broker and no TradingView login. A webhook accepts the same JSON an alert would send.

This is a research desk, not a promise of profit. The sample session fills targets and stops. When one bar trades through both prices, the stop is the fill.

## What the screenshots are

The two reference shots are a TradingView-style chart posted with the Sinhala caption අලුත්ම එක, “the newest one.” That caption is a social label, not a setting.

Visible on the chart:

- Hollow up candles and filled down candles.
- Blue diamonds on bullish bars and up swings, red triangles on bearish bars and down swings.
- Gray lines through swing pivots. On the 7 Oct view, a fan of those lines converges on a spike low around 14:00.
- A bottom strip labeled Price, S/L, T/P, Price.

The pictures do not name the indicator. Diamond TP does not try to clone a closed script. It trades the rule that is actually visible: a confirmed swing in the direction of a short EMA, a stop beyond that swing, and a take-profit sized as a multiple of the risk. Diamonds and triangles on every bar are the map. They are not all orders.

## Run

```bash
npm install
npm test
npm run dev
```

Open [http://127.0.0.1:38471](http://127.0.0.1:38471).

Choose **Run tape**. The session is a synthetic XAUUSD 15-minute path shaped like the 7 Oct screenshots. Reset replays the same path. Bracket settings apply to the next entry.

## TradingView

1. Pine Editor → paste `pine/diamond-tp.pine` → Add to chart. The script is also on the TradingView tab in the desk.
2. Set the script’s webhook secret to the desk secret (`diamond-tp-local` until you change it).
3. Create an alert on **Diamond TP**. Condition: **Any alert() function call**. Leave the message box empty. Do not also enable order-fill alerts, or each event is posted twice.
4. Put the desk’s `/api/webhook` URL in the alert. TradingView only calls a public HTTPS URL, so `http://127.0.0.1` works for the test buttons in the app and not for TradingView’s servers.

Entry body:

```json
{
  "secret": "diamond-tp-local",
  "action": "buy",
  "symbol": "XAUUSD",
  "price": 2650.25,
  "sl": 2642.1,
  "tp": 2666.55
}
```

`action` may be `buy`, `sell`, or `close`. `sl` / `stop` and `tp` / `takeProfit` are optional. A missing target is computed from the stop, or from ATR when the stop is missing too. A target on the wrong side of the entry returns 422 and opens nothing.

Close body:

```json
{
  "secret": "diamond-tp-local",
  "action": "close",
  "reason": "take_profit"
}
```

`reason` may be `take_profit`, `stop`, `breakeven`, or omitted. A TradingView bracket is not marked against the synthetic tape. It waits for this close alert. Strategy trades on the paper tape are managed by the tape.

## Rules

- One open position.
- Size is `equity × risk percent / stop distance`. Default risk is 1% of 10,000.
- Default target is 2R. After price travels 1R, the stop moves to entry and the target stays put.
- Same-bar stop and target: stop fills. The path inside the bar is unknown.

## Resources

- [Pine Script alerts](https://www.tradingview.com/pine-script-docs/faq/alerts/)
- [`strategy.exit`](https://www.tradingview.com/pine-script-reference/v6/#fun_strategy.exit) for the stop and limit
- [Webhook alerts](https://www.tradingview.com/support/solutions/43000529348-how-to-configure-webhook-alerts/)
- [Average true range](https://www.investopedia.com/terms/a/atr.asp), used when an alert has no stop of its own

## Tests

```bash
npm test
```

The engine tests cover a missing target, a target on the wrong side, a same-bar stop-and-target collision, and a full replay that both takes profit and hits a stop.
