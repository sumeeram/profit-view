export type Side = "long" | "short";

export type Source = "strategy" | "tradingview";

export type ExitReason = "take_profit" | "stop" | "breakeven" | "manual";

export type Candle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
};

export type Settings = {
  symbol: string;
  rewardRisk: number;
  atrPeriod: number;
  atrStopMult: number;
  swing: number;
  emaPeriod: number;
  emaSlope: number;
  riskPercent: number;
  breakevenAtR: number;
  startingEquity: number;
  webhookSecret: string;
  minBarsBetween: number;
};

export type Position = {
  id: string;
  symbol: string;
  side: Side;
  qty: number;
  entry: number;
  stop: number;
  initialStop: number;
  takeProfit: number;
  openedAt: number;
  source: Source;
  breakevenArmed: boolean;
  riskPerUnit: number;
  /** Best price since the fill. The trail is measured from this, not from the close. */
  peak: number;
};

export type ClosedTrade = Position & {
  exit: number;
  closedAt: number;
  reason: ExitReason;
  pnl: number;
  r: number;
};

export type LogLine = {
  at: number;
  text: string;
};

export type WebhookEvent = {
  at: number;
  ok: boolean;
  status: number;
  message: string;
  action: string;
};

export type OverlayMarker = {
  time: number;
  price: number;
  kind: "diamond" | "triangle";
  tone: "blue" | "red";
  size: "sm" | "md";
};

export type OverlayLine = {
  points: { time: number; price: number }[];
  color: string;
  width: number;
  dash?: number[];
};

export type DeskState = {
  settings: Settings;
  candles: Candle[];
  cursor: number;
  running: boolean;
  equity: number;
  position: Position | null;
  trades: ClosedTrade[];
  logs: LogLine[];
  events: WebhookEvent[];
  lastSignalBar: number;
  seq: number;
};

export type PublicDesk = {
  settings: Settings;
  candles: Candle[];
  cursor: number;
  candleCount: number;
  markers: OverlayMarker[];
  lines: OverlayLine[];
  position: Position | null;
  trades: ClosedTrade[];
  equity: number;
  realized: number;
  unrealized: number;
  running: boolean;
  logs: LogLine[];
  events: WebhookEvent[];
  lastPrice: number;
  lastTime: number;
  done: boolean;
};
