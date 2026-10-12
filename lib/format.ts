import type { ExitReason, Side } from "./types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function formatTime(unixSeconds: number): string {
  const date = new Date(unixSeconds * 1000);
  const hours = String(date.getUTCHours()).padStart(2, "0");
  const minutes = String(date.getUTCMinutes()).padStart(2, "0");
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${hours}:${minutes}`;
}

export function formatPx(value: number): string {
  return value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export function formatMoney(value: number): string {
  const sign = value < 0 ? "-" : "";
  const body = Math.abs(value).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}$${body}`;
}

export function formatR(value: number): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}R`;
}

export function sideLabel(side: Side): string {
  return side === "long" ? "Long" : "Short";
}

export function reasonLabel(reason: ExitReason): string {
  switch (reason) {
    case "take_profit":
      return "Take profit";
    case "stop":
      return "Stop";
    case "breakeven":
      return "Locked stop";
    case "manual":
      return "Closed";
  }
}
