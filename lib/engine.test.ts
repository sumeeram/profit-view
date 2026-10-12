import assert from "node:assert/strict";
import test from "node:test";
import { armBracket, BracketError, resolveBar } from "./broker";
import { defaultSettings } from "./defaults";
import { signalRules } from "./signal-rules";
import { createInitial, applyWebhook, playAll } from "./session";
import { signalAt } from "./strategy";
import type { Candle, Position } from "./types";

const settings = { ...defaultSettings, rewardRisk: 2, atrStopMult: 1 };

test("a missing take profit is armed at the reward multiple", () => {
  const bracket = armBracket({ side: "long", entry: 100, stop: 95 }, settings);
  assert.equal(bracket.takeProfit, 110);
  assert.equal(bracket.riskPerUnit, 5);
});

test("a long with the target below the entry is refused", () => {
  assert.throws(
    () =>
      armBracket(
        { side: "long", entry: 100, stop: 95, takeProfit: 99 },
        settings,
      ),
    (error: unknown) =>
      error instanceof BracketError && /take profit/i.test(error.message),
  );
});

test("a long with the stop above the entry is refused", () => {
  assert.throws(
    () =>
      armBracket(
        { side: "long", entry: 100, stop: 101, takeProfit: 110 },
        settings,
      ),
    BracketError,
  );
});

test("a short target is armed below the entry when omitted", () => {
  const bracket = armBracket(
    { side: "short", entry: 100, stop: 104 },
    settings,
  );
  assert.equal(bracket.takeProfit, 92);
});

test("the target fills when price trades through it", () => {
  const position = samplePosition();
  const bar: Candle = { time: 2, open: 100, high: 112, low: 99, close: 111 };
  const resolved = resolveBar(position, bar, 1);
  assert.equal(resolved.exit?.reason, "take_profit");
  assert.equal(resolved.exit?.price, 110);
});

test("a bar that touches the stop and the target fills the stop", () => {
  const position = samplePosition();
  const bar: Candle = { time: 2, open: 100, high: 112, low: 94, close: 108 };
  const resolved = resolveBar(position, bar, 0);
  assert.equal(resolved.exit?.reason, "stop");
  assert.equal(resolved.exit?.price, 95);
});

test("reaching 1R locks a quarter-R and a later tag exits there", () => {
  const position = samplePosition();
  const push: Candle = {
    time: 2,
    open: 100,
    high: 106,
    low: 100.5,
    close: 105,
  };
  const armed = resolveBar(position, push, 1);
  assert.equal(armed.exit, undefined);
  assert.equal(armed.position.stop, 101.25);
  assert.equal(armed.position.breakevenArmed, true);
  const back: Candle = {
    time: 3,
    open: 105,
    high: 105.5,
    low: 99.5,
    close: 101,
  };
  const resolved = resolveBar(armed.position, back, 1);
  assert.equal(resolved.exit?.reason, "breakeven");
  assert.equal(resolved.exit?.price, 101.25);
});

test("a push past 1R trails the stop one R behind the best price", () => {
  const position = samplePosition();
  const push: Candle = { time: 2, open: 100, high: 109, low: 104, close: 108 };
  const armed = resolveBar(position, push, 1);
  assert.equal(armed.exit, undefined);
  assert.equal(armed.position.stop, 104);
  assert.equal(armed.position.peak, 109);
});

test("the 15-minute sample skips chase swings and never opens without a target", () => {
  const initial = createInitial();
  for (let index = 0; index < initial.candles.length; index += 1) {
    const signal = signalAt(initial.candles, index, initial.settings);
    assert.equal(signal, null);
  }
  const played = playAll(initial);
  assert.equal(played.trades.length, 0);
  assert.equal(played.position, null);
});

test("a pullback that stays inside the trend is a long, and a chase or a closed session is not", () => {
  const pullback = buildPullback(0.45, 12);
  const signal = signalAt(pullback, 85, defaultSettings);
  assert.ok(signal);
  assert.equal(signal.side, "long");
  assert.equal(signal.barIndex, 85);
  assert.ok(signal.stop < signal.entry);
  assert.ok(signal.takeProfit > signal.entry);
  const risk = signal.entry - signal.stop;
  assert.ok(risk > signal.atr * signalRules.minRiskAtr);
  assert.ok(risk < signal.atr * signalRules.maxRiskAtr);

  const chase = buildPullback(1.6, 12);
  for (let index = 0; index < chase.length; index += 1) {
    assert.equal(signalAt(chase, index, defaultSettings), null);
  }

  const overnight = buildPullback(0.45, 2);
  assert.equal(signalAt(overnight, 85, defaultSettings), null);
});

test("a webhook buy without a target still opens with a take profit", () => {
  const initial = createInitial();
  const result = applyWebhook(initial, {
    secret: initial.settings.webhookSecret,
    action: "buy",
    symbol: "XAUUSD",
    price: initial.candles[initial.cursor].close,
  });
  assert.equal(result.status, 200);
  assert.ok(result.state.position);
  assert.ok(result.state.position.takeProfit > result.state.position.entry);
  assert.equal(result.state.position.source, "tradingview");
});

test("a webhook target on the wrong side does not open a trade", () => {
  const initial = createInitial();
  const price = initial.candles[initial.cursor].close;
  const result = applyWebhook(initial, {
    secret: initial.settings.webhookSecret,
    action: "buy",
    symbol: "XAUUSD",
    price,
    sl: price - 2,
    tp: price - 1,
  });
  assert.equal(result.status, 422);
  assert.equal(result.state.position, null);
});

test("the tape does not invent a fill for a TradingView bracket", () => {
  let state = createInitial();
  const opened = applyWebhook(state, {
    secret: state.settings.webhookSecret,
    action: "buy",
    price: state.candles[state.cursor].close,
  });
  state = opened.state;
  const before = state.position?.id;
  state = playAll(state);
  assert.equal(state.position?.id, before);
  assert.equal(state.position?.source, "tradingview");
});

function buildPullback(bounce: number, hour: number): Candle[] {
  const candles: Candle[] = [];
  let price = 2300;
  const start = Date.UTC(2026, 0, 1, hour, 0, 0) / 1000;
  for (let i = 0; i < 100; i += 1) {
    let drift = 0.25 + Math.sin(i / 3) * 0.9;
    if (i >= 80 && i <= 82) drift = -0.45;
    if (i >= 83) drift = bounce;
    const open = Math.round(price * 100) / 100;
    const close = Math.round((price + drift) * 100) / 100;
    const high = Math.round((Math.max(open, close) + 0.25) * 100) / 100;
    let low = Math.round((Math.min(open, close) - 0.18) * 100) / 100;
    if (i === 82) low = Math.round((low - 0.08) * 100) / 100;
    candles.push({ time: start + i * 86400, open, high, low, close });
    price = close;
  }
  return candles;
}

function samplePosition(): Position {
  return {
    id: "pos-1",
    symbol: "XAUUSD",
    side: "long",
    qty: 2,
    entry: 100,
    stop: 95,
    initialStop: 95,
    takeProfit: 110,
    openedAt: 1,
    source: "strategy",
    breakevenArmed: false,
    riskPerUnit: 5,
    peak: 100,
  };
}
