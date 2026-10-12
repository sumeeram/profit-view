/**
 * Entry and stop numbers shared by the paper tape.
 * pine/diamond-tp.pine repeats them as input defaults. Change both together.
 *
 * The bounds come from how this kind of gold trend-pullback loses money:
 * a stop inside one ATR is noise, a stop past about two ATR is a chase,
 * and a breakeven parked on the exact entry gives the profit back.
 */
export const signalRules = {
  slowEmaPeriod: 34,
  adxPeriod: 14,
  adxMin: 20,
  rsiPeriod: 14,
  rsiLongMin: 48,
  rsiLongMax: 70,
  rsiShortMin: 30,
  rsiShortMax: 52,
  minRiskAtr: 0.8,
  maxRiskAtr: 2.2,
  stopBufferAtr: 0.5,
  maxChaseAtr: 1.35,
  pullbackAtr: 1.6,
  pullbackSlackAtr: 0.5,
  minBodyRatio: 0.4,
  sessionStartHour: 7,
  sessionEndHour: 20,
  lockR: 0.25,
} as const;
