import type { Settings } from "./types";

export const defaultSettings: Settings = {
  symbol: "XAUUSD",
  rewardRisk: 2,
  atrPeriod: 14,
  atrStopMult: 1.15,
  swing: 3,
  emaPeriod: 8,
  emaSlope: 3,
  riskPercent: 1,
  breakevenAtR: 1,
  startingEquity: 10000,
  webhookSecret: "diamond-tp-local",
  minBarsBetween: 6,
};

export const SESSION_SYMBOL = "XAUUSD";
