import { round2, roundPx } from "./indicators";
import { signalRules } from "./signal-rules";
import type { Candle, ExitReason, Position, Settings, Side } from "./types";

export class BracketError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BracketError";
  }
}

export type BracketInput = {
  side: Side;
  entry: number;
  stop?: number | null;
  takeProfit?: number | null;
  atr?: number | null;
};

export type Bracket = {
  entry: number;
  stop: number;
  takeProfit: number;
  riskPerUnit: number;
};

/**
 * No order leaves this function without a take-profit on the profit side
 * of the entry and a stop on the loss side. A missing target is built from
 * the stop and the reward multiple. A target on the wrong side is refused.
 */
export function armBracket(input: BracketInput, settings: Settings): Bracket {
  const entry = roundPx(input.entry);
  if (!Number.isFinite(entry) || entry <= 0) {
    throw new BracketError("Entry price is missing.");
  }

  const atr =
    input.atr != null && Number.isFinite(input.atr) && input.atr > 0
      ? input.atr
      : entry * 0.002;

  let stop = input.stop;
  if (stop == null || !Number.isFinite(stop)) {
    const distance = settings.atrStopMult * atr;
    stop = input.side === "long" ? entry - distance : entry + distance;
  }
  stop = roundPx(stop);

  if (input.side === "long" && stop >= entry) {
    throw new BracketError("Stop must sit below the entry on a long.");
  }
  if (input.side === "short" && stop <= entry) {
    throw new BracketError("Stop must sit above the entry on a short.");
  }

  const risk = roundPx(Math.abs(entry - stop));
  if (risk <= 0) {
    throw new BracketError("Stop distance is zero, so a target cannot be sized.");
  }

  let takeProfit = input.takeProfit;
  if (takeProfit == null || !Number.isFinite(takeProfit)) {
    takeProfit =
      input.side === "long"
        ? entry + risk * settings.rewardRisk
        : entry - risk * settings.rewardRisk;
  }
  takeProfit = roundPx(takeProfit);

  if (input.side === "long" && takeProfit <= entry) {
    throw new BracketError("Refusing to open: take profit is not above the entry.");
  }
  if (input.side === "short" && takeProfit >= entry) {
    throw new BracketError("Refusing to open: take profit is not below the entry.");
  }

  return { entry, stop, takeProfit, riskPerUnit: risk };
}

export function quantity(equity: number, riskPercent: number, riskPerUnit: number): number {
  if (equity <= 0 || riskPercent <= 0 || riskPerUnit <= 0) return 0;
  const budget = equity * (riskPercent / 100);
  return round2(budget / riskPerUnit);
}

export function tradePnl(side: Side, entry: number, exit: number, qty: number): number {
  const direction = side === "long" ? 1 : -1;
  return round2((exit - entry) * direction * qty);
}

export type BarResolution = {
  position: Position;
  exit?: { price: number; reason: ExitReason };
  movedToBreakeven: boolean;
};

/**
 * Manage an open bracket against one bar.
 * When the bar reaches both the stop and the target, the stop fills.
 * Intrabar order is unknown, and booking a profit in that case would be a guess.
 */
export function resolveBar(position: Position, bar: Candle, breakevenAtR: number): BarResolution {
  const long = position.side === "long";
  const peak = long ? Math.max(position.peak, bar.high) : Math.min(position.peak, bar.low);
  const marked = { ...position, peak };
  const hitStop = long ? bar.low <= position.stop : bar.high >= position.stop;
  const hitTarget = long ? bar.high >= position.takeProfit : bar.low <= position.takeProfit;

  if (hitStop) {
    return {
      position: marked,
      movedToBreakeven: false,
      exit: {
        price: position.stop,
        reason: lockedExit(position, position.stop) ? "breakeven" : "stop",
      },
    };
  }
  if (hitTarget) {
    return {
      position: marked,
      movedToBreakeven: false,
      exit: { price: position.takeProfit, reason: "take_profit" },
    };
  }

  if (breakevenAtR <= 0) {
    return { position: marked, movedToBreakeven: false };
  }

  const traveled = long ? peak - position.entry : position.entry - peak;
  const armed = position.breakevenArmed || traveled + 1e-9 >= position.riskPerUnit * breakevenAtR;
  if (!armed) {
    return { position: marked, movedToBreakeven: false };
  }

  const lock = long
    ? position.entry + position.riskPerUnit * signalRules.lockR
    : position.entry - position.riskPerUnit * signalRules.lockR;
  const trail = long ? peak - position.riskPerUnit : peak + position.riskPerUnit;
  const candidate = long ? Math.max(lock, trail) : Math.min(lock, trail);
  let stop = long ? Math.max(position.stop, candidate) : Math.min(position.stop, candidate);
  stop = capStop(long, roundPx(stop), position.takeProfit);
  return {
    position: {
      ...marked,
      stop,
      breakevenArmed: true,
    },
    movedToBreakeven: !position.breakevenArmed,
  };
}

function lockedExit(position: Position, price: number): boolean {
  if (!position.breakevenArmed) return false;
  return position.side === "long" ? price >= position.entry - 1e-9 : price <= position.entry + 1e-9;
}

function capStop(long: boolean, stop: number, takeProfit: number): number {
  if (long && stop >= takeProfit) return roundPx(takeProfit - 0.01);
  if (!long && stop <= takeProfit) return roundPx(takeProfit + 0.01);
  return stop;
}
