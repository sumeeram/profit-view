import assert from "node:assert/strict";
import test from "node:test";
import { armBracket, BracketError, resolveBar } from "./broker";
import { defaultSettings } from "./defaults";
import { createInitial, applyWebhook, playAll } from "./session";
import type { Candle, Position } from "./types";

const settings = { ...defaultSettings, rewardRisk: 2, atrStopMult: 1 };

test("a missing take profit is armed at the reward multiple", () => {
  const bracket = armBracket({ side: "long", entry: 100, stop: 95 }, settings);
  assert.equal(bracket.takeProfit, 110);
  assert.equal(bracket.riskPerUnit, 5);
});

test("a long with the target below the entry is refused", () => {
  assert.throws(
    () => armBracket({ side: "long", entry: 100, stop: 95, takeProfit: 99 }, settings),
    (error: unknown) => error instanceof BracketError && /take profit/i.test(error.message),
  );
});

test("a long with the stop above the entry is refused", () => {
  assert.throws(
    () => armBracket({ side: "long", entry: 100, stop: 101, takeProfit: 110 }, settings),
    BracketError,
  );
});

test("a short target is armed below the entry when omitted", () => {
  const bracket = armBracket({ side: "short", entry: 100, stop: 104 }, settings);
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

test("reaching 1R moves the stop to entry and a later tag exits flat", () => {
  const position = samplePosition();
  const push: Candle = { time: 2, open: 100, high: 106, low: 100.5, close: 105 };
  const armed = resolveBar(position, push, 1);
  assert.equal(armed.exit, undefined);
  assert.equal(armed.position.stop, 100);
  assert.equal(armed.position.breakevenArmed, true);
  const back: Candle = { time: 3, open: 105, high: 105.5, low: 99.5, close: 101 };
  const resolved = resolveBar(armed.position, back, 1);
  assert.equal(resolved.exit?.reason, "breakeven");
  assert.equal(resolved.exit?.price, 100);
});

test("the paper session books at least one take-profit and never opens without one", () => {
  const played = playAll(createInitial());
  for (const trade of played.trades) {
    if (trade.side === "long") {
      assert.ok(trade.takeProfit > trade.entry);
      assert.ok(trade.initialStop < trade.entry);
    } else {
      assert.ok(trade.takeProfit < trade.entry);
      assert.ok(trade.initialStop > trade.entry);
    }
  }
  const targets = played.trades.filter((trade) => trade.reason === "take_profit");
  const stops = played.trades.filter((trade) => trade.reason === "stop");
  assert.ok(stops.length >= 1, "the tape should include a stop, so a target is not guaranteed");
  assert.ok(
    targets.length >= 1,
    `expected a take-profit fill, got ${JSON.stringify(
      played.trades.map((trade) => ({
        side: trade.side,
        reason: trade.reason,
        entry: trade.entry,
        exit: trade.exit,
        r: trade.r,
      })),
    )}`,
  );
  assert.ok(played.position === null || played.position.takeProfit !== played.position.entry);
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
  };
}
