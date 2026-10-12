import { timingSafeEqual } from "crypto";
import { armBracket, BracketError, quantity, resolveBar, tradePnl } from "./broker";
import { defaultSettings } from "./defaults";
import { formatPx, reasonLabel, sideLabel } from "./format";
import { atr, round2 } from "./indicators";
import { buildSession } from "./market";
import { buildOverlay } from "./overlay";
import { signalAt } from "./strategy";
import type {
  ClosedTrade,
  DeskState,
  ExitReason,
  LogLine,
  Position,
  PublicDesk,
  Settings,
  Side,
  Source,
  WebhookEvent,
} from "./types";

const START_CURSOR = 48;

export function createInitial(partial?: Partial<Settings>): DeskState {
  const settings = sanitizeSettings({ ...defaultSettings, ...partial });
  const candles = buildSession();
  const cursor = Math.min(START_CURSOR, candles.length - 1);
  return {
    settings,
    candles,
    cursor,
    running: false,
    equity: settings.startingEquity,
    position: null,
    trades: [],
    logs: [
      {
        at: candles[cursor].time,
        text: "Paper session loaded. A trade cannot open unless a take-profit is armed.",
      },
    ],
    events: [],
    lastSignalBar: -999,
    seq: 0,
  };
}

export function present(state: DeskState): PublicDesk {
  const lastIndex = Math.max(0, Math.min(state.cursor, state.candles.length - 1));
  const candles = state.candles.slice(0, lastIndex + 1);
  const last = candles[candles.length - 1];
  const overlay = buildOverlay(
    state.candles,
    lastIndex,
    state.settings,
    state.position,
    state.trades,
  );
  const unrealized = state.position && last ? markPnl(state.position, last.close) : 0;
  return {
    settings: state.settings,
    candles,
    cursor: lastIndex,
    candleCount: state.candles.length,
    markers: overlay.markers,
    lines: overlay.lines,
    position: state.position,
    trades: state.trades,
    equity: round2(state.equity + unrealized),
    realized: round2(state.equity - state.settings.startingEquity),
    unrealized,
    running: state.running,
    logs: state.logs,
    events: state.events,
    lastPrice: last?.close ?? 0,
    lastTime: last?.time ?? 0,
    done: lastIndex >= state.candles.length - 1,
  };
}

export function step(state: DeskState): DeskState {
  if (state.cursor >= state.candles.length - 1) {
    return { ...state, running: false };
  }

  const cursor = state.cursor + 1;
  const bar = state.candles[cursor];
  let position = state.position;
  let trades = state.trades;
  let equity = state.equity;
  let logs = state.logs;
  let lastSignalBar = state.lastSignalBar;

  if (position && position.source === "strategy" && position.openedAt < bar.time) {
    const resolved = resolveBar(position, bar, state.settings.breakevenAtR);
    if (resolved.movedToBreakeven && !resolved.exit) {
      logs = pushLog(
        logs,
        bar.time,
        `Stop locked at ${formatPx(resolved.position.stop)} after ${state.settings.breakevenAtR}R. Take profit stays at ${formatPx(resolved.position.takeProfit)}.`,
      );
    }
    if (resolved.exit) {
      const closed = closePosition(position, resolved.exit.price, resolved.exit.reason, bar.time);
      trades = [...trades, closed];
      equity = round2(equity + closed.pnl);
      logs = pushLog(logs, bar.time, closeText(closed));
      position = null;
    } else {
      position = resolved.position;
    }
  }

  if (!position) {
    const signal = signalAt(state.candles, cursor, state.settings);
    if (signal && cursor - lastSignalBar >= state.settings.minBarsBetween) {
      const opened = openPosition(state, {
        side: signal.side,
        entry: signal.entry,
        stop: signal.stop,
        takeProfit: signal.takeProfit,
        atr: signal.atr,
        time: bar.time,
        source: "strategy",
        symbol: state.settings.symbol,
        seq: state.seq,
      });
      if (opened.ok) {
        position = opened.position;
        logs = pushLog(logs, bar.time, opened.message);
        lastSignalBar = cursor;
        return finishStep(state, {
          cursor,
          position,
          trades,
          equity,
          logs,
          lastSignalBar,
          seq: opened.seq,
        });
      }
    }
  }

  return finishStep(state, { cursor, position, trades, equity, logs, lastSignalBar, seq: state.seq });
}

export function playAll(state: DeskState): DeskState {
  let next: DeskState = { ...state, running: true };
  let guard = 0;
  while (next.cursor < next.candles.length - 1 && guard < 10000) {
    next = step(next);
    guard += 1;
  }
  return { ...next, running: false };
}

export function applySettings(state: DeskState, patch: Partial<Settings>): DeskState {
  return { ...state, settings: sanitizeSettings({ ...state.settings, ...patch }, state.settings) };
}

export type WebhookResult = {
  state: DeskState;
  status: number;
  body: { ok: boolean; message: string; position?: Position | null };
};

export function applyWebhook(state: DeskState, payload: unknown): WebhookResult {
  if (!payload || typeof payload !== "object") {
    return reject(state, 400, "unknown", "Webhook body must be a JSON object.");
  }
  const record = payload as Record<string, unknown>;
  const secret = typeof record.secret === "string" ? record.secret : "";
  if (!secretsMatch(secret, state.settings.webhookSecret)) {
    return reject(state, 401, "unauthorized", "Webhook secret does not match this desk.");
  }

  const action = String(record.action ?? record.side ?? "")
    .trim()
    .toLowerCase();
  const symbol = String(record.symbol ?? state.settings.symbol).trim() || state.settings.symbol;
  const time = parseTime(record.time, state.candles[state.cursor]?.time ?? Math.floor(Date.now() / 1000));

  if (action === "close" || action === "flat" || action === "exit") {
    if (!state.position) {
      return reject(state, 409, action, "No open position to close.");
    }
    const reason = parseReason(record.reason);
    const price = parseNumber(record.price);
    const fill =
      price ??
      (reason === "take_profit"
        ? state.position.takeProfit
        : reason === "stop" || reason === "breakeven"
          ? state.position.stop
          : state.candles[state.cursor]?.close);
    if (fill == null) {
      return reject(state, 400, action, "Close alert needs a price.");
    }
    const closed = closePosition(state.position, fill, reason, time);
    const next: DeskState = {
      ...state,
      position: null,
      equity: round2(state.equity + closed.pnl),
      trades: [...state.trades, closed],
      logs: pushLog(state.logs, time, closeText(closed)),
      events: pushEvent(state.events, {
        at: time,
        ok: true,
        status: 200,
        action,
        message: closeText(closed),
      }),
    };
    return { state: next, status: 200, body: { ok: true, message: closeText(closed), position: null } };
  }

  const side = parseSide(action);
  if (!side) {
    return reject(
      state,
      400,
      action || "unknown",
      "Action must be buy, sell, or close.",
    );
  }
  if (state.position) {
    return reject(
      state,
      409,
      action,
      "A bracket is already open. Close it before the next entry.",
    );
  }

  const price = parseNumber(record.price) ?? state.candles[state.cursor]?.close;
  if (price == null) {
    return reject(state, 400, action, "Entry alert needs a price.");
  }
  const prefix = state.candles.slice(0, state.cursor + 1);
  const averages = atr(prefix, state.settings.atrPeriod);
  const average = averages[averages.length - 1];

  try {
    const opened = openPosition(state, {
      side,
      entry: price,
      stop: parseNumber(record.sl ?? record.stop ?? record.stopLoss),
      takeProfit: parseNumber(record.tp ?? record.takeProfit ?? record.take_profit),
      atr: Number.isFinite(average) ? average : null,
      time,
      source: "tradingview",
      symbol,
      seq: state.seq,
    });
    if (!opened.ok) {
      return reject(state, 422, action, opened.message);
    }
    const next: DeskState = {
      ...state,
      seq: opened.seq,
      position: opened.position,
      logs: pushLog(state.logs, time, opened.message),
      events: pushEvent(state.events, {
        at: time,
        ok: true,
        status: 200,
        action,
        message: opened.message,
      }),
    };
    return {
      state: next,
      status: 200,
      body: { ok: true, message: opened.message, position: opened.position },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not arm a bracket.";
    return reject(state, 422, action, message);
  }
}

export function closeManual(state: DeskState): DeskState {
  if (!state.position) return state;
  const time = state.candles[state.cursor]?.time ?? Math.floor(Date.now() / 1000);
  const price = state.candles[state.cursor]?.close ?? state.position.entry;
  const closed = closePosition(state.position, price, "manual", time);
  return {
    ...state,
    position: null,
    equity: round2(state.equity + closed.pnl),
    trades: [...state.trades, closed],
    logs: pushLog(state.logs, time, closeText(closed)),
  };
}

function finishStep(
  state: DeskState,
  patch: {
    cursor: number;
    position: Position | null;
    trades: ClosedTrade[];
    equity: number;
    logs: LogLine[];
    lastSignalBar: number;
    seq: number;
  },
): DeskState {
  const done = patch.cursor >= state.candles.length - 1;
  let logs = patch.logs;
  if (done && state.cursor < patch.cursor) {
    logs = pushLog(logs, state.candles[patch.cursor].time, "Session tape finished. Reset to replay it.");
  }
  return {
    ...state,
    ...patch,
    logs: logs.slice(-100),
    running: state.running && !done,
  };
}

type OpenRequest = {
  side: Side;
  entry: number;
  stop?: number | null;
  takeProfit?: number | null;
  atr?: number | null;
  time: number;
  source: Source;
  symbol: string;
  seq: number;
};

function openPosition(
  state: DeskState,
  request: OpenRequest,
): { ok: true; position: Position; seq: number; message: string } | { ok: false; message: string } {
  try {
    const bracket = armBracket(
      {
        side: request.side,
        entry: request.entry,
        stop: request.stop,
        takeProfit: request.takeProfit,
        atr: request.atr,
      },
      state.settings,
    );
    const qty = quantity(state.equity, state.settings.riskPercent, bracket.riskPerUnit);
    if (qty <= 0) {
      return { ok: false, message: "Equity is too small to size a position." };
    }
    const seq = request.seq + 1;
    const position: Position = {
      id: `pos-${seq}`,
      symbol: request.symbol,
      side: request.side,
      qty,
      entry: bracket.entry,
      stop: bracket.stop,
      initialStop: bracket.stop,
      takeProfit: bracket.takeProfit,
      openedAt: request.time,
      source: request.source,
      breakevenArmed: false,
      riskPerUnit: bracket.riskPerUnit,
      peak: bracket.entry,
    };
    const reward = Math.abs(bracket.takeProfit - bracket.entry);
    const multiple = (reward / bracket.riskPerUnit).toFixed(2);
    const message = `Opened ${sideLabel(request.side).toLowerCase()} ${request.symbol} at ${formatPx(bracket.entry)}. Stop ${formatPx(bracket.stop)}. Take profit ${formatPx(bracket.takeProfit)} armed (${multiple}R).`;
    return { ok: true, position, seq, message };
  } catch (error) {
    if (error instanceof BracketError) return { ok: false, message: error.message };
    throw error;
  }
}

function closePosition(
  position: Position,
  price: number,
  reason: ExitReason,
  time: number,
): ClosedTrade {
  const exit = round2(price);
  const pnl = tradePnl(position.side, position.entry, exit, position.qty);
  const riskCash = position.riskPerUnit * position.qty;
  const r = riskCash === 0 ? 0 : round2(pnl / riskCash);
  return { ...position, exit, closedAt: time, reason, pnl, r };
}

function closeText(trade: ClosedTrade): string {
  return `${reasonLabel(trade.reason)} on ${sideLabel(trade.side).toLowerCase()} ${trade.symbol} at ${formatPx(trade.exit)}. Result ${trade.pnl >= 0 ? "+" : ""}${trade.pnl.toFixed(2)} (${trade.r >= 0 ? "+" : ""}${trade.r.toFixed(2)}R).`;
}

function markPnl(position: Position, price: number): number {
  return tradePnl(position.side, position.entry, price, position.qty);
}

function pushLog(logs: LogLine[], at: number, text: string): LogLine[] {
  return [...logs, { at, text }].slice(-100);
}

function pushEvent(events: WebhookEvent[], event: WebhookEvent): WebhookEvent[] {
  return [...events, event].slice(-40);
}

function reject(state: DeskState, status: number, action: string, message: string): WebhookResult {
  const at = state.candles[state.cursor]?.time ?? Math.floor(Date.now() / 1000);
  return {
    state: {
      ...state,
      events: pushEvent(state.events, { at, ok: false, status, action, message }),
      logs: pushLog(state.logs, at, message),
    },
    status,
    body: { ok: false, message },
  };
}

function parseSide(action: string): Side | null {
  if (action === "buy" || action === "long") return "long";
  if (action === "sell" || action === "short") return "short";
  return null;
}

function parseReason(value: unknown): ExitReason {
  const reason = String(value ?? "").toLowerCase();
  if (reason === "take_profit" || reason === "tp" || reason === "target") return "take_profit";
  if (reason === "breakeven" || reason === "be") return "breakeven";
  if (reason === "stop" || reason === "sl" || reason === "stop_loss") return "stop";
  return "manual";
}

function parseNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function parseTime(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 10_000_000_000 ? Math.floor(value / 1000) : Math.floor(value);
  }
  if (typeof value === "string" && value.trim()) {
    const asNumber = Number(value);
    if (Number.isFinite(asNumber)) return parseTime(asNumber, fallback);
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return Math.floor(parsed / 1000);
  }
  return fallback;
}

function secretsMatch(given: string, expected: string): boolean {
  const left = Buffer.from(given);
  const right = Buffer.from(expected);
  if (left.length === 0 || left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function sanitizeSettings(input: Settings, previous?: Settings): Settings {
  return {
    symbol: cleanSymbol(input.symbol),
    rewardRisk: clamp(input.rewardRisk, 1, 8),
    atrPeriod: Math.round(clamp(input.atrPeriod, 5, 50)),
    atrStopMult: clamp(input.atrStopMult, 0.3, 5),
    swing: Math.round(clamp(input.swing, 2, 8)),
    emaPeriod: Math.round(clamp(input.emaPeriod, 3, 50)),
    emaSlope: Math.round(clamp(input.emaSlope, 1, 10)),
    riskPercent: clamp(input.riskPercent, 0.1, 5),
    breakevenAtR: clamp(input.breakevenAtR, 0, 5),
    startingEquity: defaultSettings.startingEquity,
    webhookSecret: cleanSecret(input.webhookSecret, previous?.webhookSecret ?? defaultSettings.webhookSecret),
    minBarsBetween: Math.round(clamp(input.minBarsBetween, 1, 40)),
  };
}

function cleanSymbol(value: string): string {
  const symbol = value.trim().toUpperCase().replace(/[^A-Z0-9.]/g, "");
  return symbol.slice(0, 16) || defaultSettings.symbol;
}

function cleanSecret(value: string, fallback: string): string {
  const secret = value.trim();
  if (secret.length < 4 || /["\\\s]/.test(secret)) return fallback;
  return secret.slice(0, 64);
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
