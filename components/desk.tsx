"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatMoney, formatPx, formatR, formatTime, reasonLabel, sideLabel } from "@/lib/format";
import type { PublicDesk, Settings } from "@/lib/types";
import { PriceChart } from "@/components/price-chart";

type Draft = {
  rewardRisk: string;
  riskPercent: string;
  atrStopMult: string;
  breakevenAtR: string;
  webhookSecret: string;
};

export function Desk() {
  const [desk, setDesk] = useState<PublicDesk | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pace, setPace] = useState(1);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [pine, setPine] = useState("");
  const [copied, setCopied] = useState("");
  const busy = useRef(false);

  async function load() {
    const response = await fetch("/api/state", { cache: "no-store" });
    if (!response.ok) throw new Error("The desk did not respond.");
    const body = (await response.json()) as PublicDesk;
    setDesk(body);
    setDraft((current) => current ?? draftFrom(body.settings));
    setError(null);
    return body;
  }

  useEffect(() => {
    let cancelled = false;
    fetch("/api/state", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("The desk did not respond.");
        return (await response.json()) as PublicDesk;
      })
      .then((body) => {
        if (cancelled) return;
        setDesk(body);
        setDraft((current) => current ?? draftFrom(body.settings));
        setError(null);
      })
      .catch((cause: unknown) => {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : "The desk did not respond.");
      });
    fetch("/api/pine")
      .then((response) => response.text())
      .then((source) => {
        if (!cancelled) setPine(source);
      })
      .catch(() => {
        if (!cancelled) setPine("");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!desk?.running) return;
    const timer = window.setInterval(() => {
      if (busy.current) return;
      busy.current = true;
      fetch("/api/bot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "step", steps: pace }),
      })
        .then(async (response) => {
          const body = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(typeof body.error === "string" ? body.error : "The tape stopped.");
          }
          setDesk(body as PublicDesk);
        })
        .catch((cause: unknown) => {
          setError(cause instanceof Error ? cause.message : "The tape stopped.");
        })
        .finally(() => {
          busy.current = false;
        });
    }, 420);
    return () => window.clearInterval(timer);
  }, [desk?.running, pace]);

  async function postBot(action: string, extra?: Record<string, unknown>) {
    const response = await fetch("/api/bot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, ...extra }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof body.error === "string" ? body.error : "The desk could not update.");
    }
    setDesk(body as PublicDesk);
    setError(null);
  }

  async function postWebhook(payload: Record<string, unknown>) {
    const response = await fetch("/api/webhook", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json().catch(() => ({}));
    if (body.desk) setDesk(body.desk as PublicDesk);
    setNotice(typeof body.message === "string" ? body.message : "Webhook failed.");
  }

  async function copy(key: string, value: string) {
    await navigator.clipboard.writeText(value);
    setCopied(key);
    window.setTimeout(() => setCopied(""), 1600);
  }

  if (error && !desk) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold tracking-tight">Diamond TP</h1>
        <p className="text-sm text-[#6b645c]">{error}</p>
        <Button
          onClick={() => {
            load().catch((cause: unknown) => {
              setError(cause instanceof Error ? cause.message : "The desk did not respond.");
            });
          }}
        >
          Retry
        </Button>
      </main>
    );
  }

  if (!desk || !draft) {
    return (
      <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-6">
        <p className="text-sm text-[#6b645c]">Loading the paper session…</p>
      </main>
    );
  }

  const position = desk.position;
  const targets = desk.trades.filter((trade) => trade.reason === "take_profit").length;
  const stops = desk.trades.filter((trade) => trade.reason === "stop" || trade.reason === "breakeven").length;
  const webhookUrl = typeof window === "undefined" ? "/api/webhook" : `${window.location.origin}/api/webhook`;
  const sampleEntry = JSON.stringify(
    {
      secret: desk.settings.webhookSecret,
      action: "buy",
      symbol: desk.settings.symbol,
      price: Number(desk.lastPrice.toFixed(2)),
      sl: Number((desk.lastPrice - 8).toFixed(2)),
      tp: Number((desk.lastPrice + 16).toFixed(2)),
    },
    null,
    2,
  );

  return (
    <main className="min-h-screen bg-[#efeae2] text-[#1c1915]">
      <div className="mx-auto flex max-w-[1240px] flex-col gap-5 px-4 py-5 sm:px-6">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-medium tracking-[0.18em] text-[#6b645c]">TRADINGVIEW DESK</p>
            <h1 className="text-3xl font-semibold tracking-tight">Diamond TP</h1>
            <p className="max-w-xl text-sm leading-6 text-[#5c564e]">
              Signals can come from the built-in tape or a TradingView alert. A position is refused
              unless a take-profit already sits on the profit side of the fill.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-[#1f7a4d]/30 bg-[#e7f6ee] text-[#1f7a4d]">
              Take profit required
            </Badge>
            <Badge variant="outline">{desk.running ? "Tape running" : desk.done ? "Tape finished" : "Tape paused"}</Badge>
          </div>
        </header>

        {error ? <p className="text-sm text-[#a33b32]">{error}</p> : null}
        {notice ? <p className="text-sm text-[#3f4d3a]">{notice}</p> : null}

        <section className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-medium">
                  {desk.settings.symbol} · 15m · synthetic
                </p>
                <p className="text-xs text-[#6b645c]">
                  {formatTime(desk.lastTime)} · bar {desk.cursor + 1} of {desk.candleCount} ·{" "}
                  {formatPx(desk.lastPrice)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {desk.running ? (
                  <Button variant="outline" onClick={() => postBot("pause").catch(showError(setError))}>
                    Pause
                  </Button>
                ) : (
                  <Button disabled={desk.done} onClick={() => postBot("start").catch(showError(setError))}>
                    Run tape
                  </Button>
                )}
                <Button variant="outline" onClick={() => postBot("step", { steps: 1 }).catch(showError(setError))}>
                  Step
                </Button>
                <Button variant="outline" onClick={() => postBot("reset").catch(showError(setError))}>
                  Reset session
                </Button>
                <Button variant={pace === 1 ? "secondary" : "ghost"} onClick={() => setPace(1)}>
                  1×
                </Button>
                <Button variant={pace === 3 ? "secondary" : "ghost"} onClick={() => setPace(3)}>
                  3×
                </Button>
              </div>
            </div>

            <div className="rounded-xl bg-[#d5dee8] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]">
              <div className="overflow-hidden rounded-md bg-[#e7eef6]">
                <PriceChart
                  candles={desk.candles}
                  markers={desk.markers}
                  lines={desk.lines}
                  position={position}
                  symbol={desk.settings.symbol}
                />
              </div>
              <div className="mt-2 grid grid-cols-4 overflow-hidden rounded-md border border-[#d5dbe3] bg-[#f7f9fc] text-center">
                <TicketCell label="Price" value={position ? formatPx(position.entry) : formatPx(desk.lastPrice)} />
                <TicketCell
                  label="S/L"
                  value={position ? formatPx(position.stop) : "—"}
                  hint={position?.breakevenArmed ? "Locked in profit" : undefined}
                  tone="stop"
                />
                <TicketCell
                  label="T/P"
                  value={position ? formatPx(position.takeProfit) : "—"}
                  hint={position ? "Armed" : undefined}
                  tone="target"
                />
                <TicketCell label="Price" value={formatPx(desk.lastPrice)} />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs text-[#5c564e]">
              <Legend swatch="bg-[#2f62d6]" label="Blue diamond · up bar or up swing" />
              <Legend swatch="bg-[#d23b3b]" label="Red triangle · down bar or down swing" />
              <Legend swatch="bg-[#1f7a4d]" label="Take profit" />
              <Legend swatch="bg-[#a33b32]" label="Stop" />
            </div>
          </div>

          <div className="space-y-4">
            <Card className="bg-[#f7f4ef] ring-[#e2dbd1]">
              <CardHeader>
                <CardTitle>Account</CardTitle>
                <CardDescription>Paper fills. One open bracket at a time.</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-3 gap-3 font-mono text-sm">
                <Stat label="Equity" value={formatMoney(desk.equity)} />
                <Stat label="Closed" value={formatMoney(desk.realized)} />
                <Stat label="Open" value={formatMoney(desk.unrealized)} />
              </CardContent>
            </Card>

            <Card className="bg-[#f7f4ef] ring-[#e2dbd1]">
              <CardHeader>
                <CardTitle>{position ? `${sideLabel(position.side)} ${position.symbol}` : "Flat"}</CardTitle>
                <CardDescription>
                  {position
                    ? position.source === "strategy"
                      ? "The tape closes this at the target or the stop, whichever prints first. A bar that hits both fills the stop."
                      : "TradingView owns this bracket. It stays open until a close alert arrives."
                    : "Waiting for a pullback to the fast average, with the slower trend and a stop and target both priced."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {position ? (
                  <>
                    <dl className="grid grid-cols-2 gap-y-2 font-mono">
                      <dt className="text-[#6b645c]">Entry</dt>
                      <dd className="text-right">{formatPx(position.entry)}</dd>
                      <dt className="text-[#6b645c]">Stop</dt>
                      <dd className="text-right text-[#a33b32]">{formatPx(position.stop)}</dd>
                      <dt className="text-[#6b645c]">Take profit</dt>
                      <dd className="text-right text-[#1f7a4d]">{formatPx(position.takeProfit)}</dd>
                      <dt className="text-[#6b645c]">Size</dt>
                      <dd className="text-right">{position.qty.toFixed(2)}</dd>
                      <dt className="text-[#6b645c]">Open result</dt>
                      <dd className={`text-right ${desk.unrealized >= 0 ? "text-[#1f7a4d]" : "text-[#a33b32]"}`}>
                        {formatMoney(desk.unrealized)}
                      </dd>
                    </dl>
                    <Button variant="outline" className="w-full" onClick={() => postBot("close").catch(showError(setError))}>
                      Close at last price
                    </Button>
                  </>
                ) : (
                  <p className="text-[#5c564e]">
                    {targets} target{targets === 1 ? "" : "s"} filled, {stops} stop{stops === 1 ? "" : "s"} filled
                    this session.
                  </p>
                )}
              </CardContent>
            </Card>

            <Card className="bg-[#f7f4ef] ring-[#e2dbd1]">
              <CardHeader>
                <CardTitle>Bracket</CardTitle>
                <CardDescription>Applied to the next entry. Reset to rebuild the tape.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <Field label="Reward multiple" value={draft.rewardRisk} onChange={(value) => setDraft({ ...draft, rewardRisk: value })} />
                <Field label="Risk percent" value={draft.riskPercent} onChange={(value) => setDraft({ ...draft, riskPercent: value })} />
                <Field label="ATR stop multiple" value={draft.atrStopMult} onChange={(value) => setDraft({ ...draft, atrStopMult: value })} />
                <Field label="Lock a profit after R" value={draft.breakevenAtR} onChange={(value) => setDraft({ ...draft, breakevenAtR: value })} />
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    postBot("settings", {
                      settings: {
                        rewardRisk: Number(draft.rewardRisk),
                        riskPercent: Number(draft.riskPercent),
                        atrStopMult: Number(draft.atrStopMult),
                        breakevenAtR: Number(draft.breakevenAtR),
                        webhookSecret: draft.webhookSecret.trim(),
                      },
                    }).catch(showError(setError));
                  }}
                >
                  Save bracket
                </Button>
              </CardContent>
            </Card>
          </div>
        </section>

        <Tabs defaultValue="trades">
          <TabsList>
            <TabsTrigger value="trades">Trades</TabsTrigger>
            <TabsTrigger value="setup">TradingView</TabsTrigger>
            <TabsTrigger value="read">Screenshots</TabsTrigger>
            <TabsTrigger value="log">Log</TabsTrigger>
          </TabsList>

          <TabsContent value="trades" className="pt-3">
            {desk.trades.length === 0 ? (
              <p className="text-sm text-[#5c564e]">
                No closed trades yet. Run the tape. This sample is a fast 15-minute path, and the strategy skips
                swings that are not a pullback in the slower trend. A fill always has its target attached first.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Side</TableHead>
                    <TableHead>Entry</TableHead>
                    <TableHead>S/L</TableHead>
                    <TableHead>T/P</TableHead>
                    <TableHead>Exit</TableHead>
                    <TableHead>Why</TableHead>
                    <TableHead>Result</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...desk.trades].reverse().map((trade) => (
                    <TableRow key={trade.id}>
                      <TableCell>{formatTime(trade.closedAt)}</TableCell>
                      <TableCell>{sideLabel(trade.side)}</TableCell>
                      <TableCell className="font-mono">{formatPx(trade.entry)}</TableCell>
                      <TableCell className="font-mono">{formatPx(trade.initialStop)}</TableCell>
                      <TableCell className="font-mono">{formatPx(trade.takeProfit)}</TableCell>
                      <TableCell className="font-mono">{formatPx(trade.exit)}</TableCell>
                      <TableCell>{reasonLabel(trade.reason)}</TableCell>
                      <TableCell className={trade.pnl >= 0 ? "text-[#1f7a4d]" : "text-[#a33b32]"}>
                        {formatMoney(trade.pnl)} · {formatR(trade.r)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </TabsContent>

          <TabsContent value="setup" className="space-y-4 pt-3">
            <ol className="list-decimal space-y-2 pl-5 text-sm leading-6 text-[#3c3832]">
              <li>In TradingView, open the Pine Editor, paste the script below, then choose Add to chart.</li>
              <li>
                In the script inputs, set the webhook secret to <span className="font-mono">{desk.settings.webhookSecret}</span>.
              </li>
              <li>Create an alert on Diamond TP. Condition: Any alert() function call. Do not also turn on order fills, or each event is sent twice.</li>
              <li>
                Webhook URL: <span className="font-mono">{webhookUrl}</span>. TradingView only delivers to a public HTTPS address, so this local URL works for the test buttons here, not for TradingView&apos;s servers.
              </li>
              <li>Leave the alert message empty. The script puts the JSON in the alert() call, including price, stop, and take profit.</li>
            </ol>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => copy("url", webhookUrl)}>
                {copied === "url" ? "Copied" : "Copy webhook URL"}
              </Button>
              <Button variant="outline" onClick={() => copy("json", sampleEntry)}>
                {copied === "json" ? "Copied" : "Copy sample JSON"}
              </Button>
              <Button variant="outline" onClick={() => copy("pine", pine)} disabled={!pine}>
                {copied === "pine" ? "Copied" : "Copy Pine script"}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() =>
                  postWebhook({
                    secret: desk.settings.webhookSecret,
                    action: "buy",
                    symbol: desk.settings.symbol,
                    price: Number(desk.lastPrice.toFixed(2)),
                  })
                }
              >
                Send test entry
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  postWebhook({
                    secret: desk.settings.webhookSecret,
                    action: "close",
                    reason: "take_profit",
                  })
                }
              >
                Send take-profit fill
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  postWebhook({
                    secret: desk.settings.webhookSecret,
                    action: "close",
                    reason: "stop",
                  })
                }
              >
                Send stop fill
              </Button>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="secret">Webhook secret</Label>
              <Input
                id="secret"
                value={draft.webhookSecret}
                onChange={(event) => setDraft({ ...draft, webhookSecret: event.target.value })}
                autoComplete="off"
                spellCheck={false}
              />
              <p className="text-xs text-[#6b645c]">Save bracket stores this with the other settings. Use letters, numbers, and dashes.</p>
            </div>
            <pre className="max-h-72 overflow-auto rounded-lg bg-[#1c1915] p-4 text-xs leading-5 text-[#f4f1ea]">
              {sampleEntry}
            </pre>
            <pre className="max-h-80 overflow-auto rounded-lg bg-[#1c1915] p-4 text-xs leading-5 text-[#f4f1ea]">
              {pine || "Loading the Pine script…"}
            </pre>
          </TabsContent>

          <TabsContent value="read" className="space-y-4 pt-3">
            <div className="grid gap-4 lg:grid-cols-2">
              <figure className="space-y-2">
                <Image
                  src="/reference/structure.jpg"
                  alt="Candles with blue diamonds, red triangles, and swing lines"
                  width={1080}
                  height={972}
                  className="h-auto w-full rounded-lg border border-[#e2dbd1]"
                />
                <figcaption className="text-xs leading-5 text-[#5c564e]">
                  Wide view. Hollow up candles, filled down candles, markers tracing each swing, and lines joining the pivots.
                </figcaption>
              </figure>
              <figure className="space-y-2">
                <Image
                  src="/reference/session.jpg"
                  alt="7 October session with a spike low and stop-loss take-profit columns"
                  width={1080}
                  height={1338}
                  className="h-auto w-full rounded-lg border border-[#e2dbd1]"
                />
                <figcaption className="text-xs leading-5 text-[#5c564e]">
                  7 Oct session. The fan converges on the spike low. The bottom strip is Price, S/L, T/P, Price.
                </figcaption>
              </figure>
            </div>
            <div className="max-w-3xl space-y-3 text-sm leading-6 text-[#3c3832]">
              <p>
                The caption on both shots, අලුත්ම එක, is Sinhala for “the newest one.” It is a social post label, not a symbol or a setting. The axis format and the candle style are TradingView. The pictures do not name the script that drew the markers.
              </p>
              <p>
                What is actually on the chart: a blue diamond on bullish bars and up swings, a red triangle on bearish bars and down swings, gray structure through the pivots, and a fan of lines into a climax low. The order strip under the second shot is the requirement that matters: every idea has a price, a stop, and a take profit.
              </p>
              <p>
                The desk follows that rule and refuses the trades that were giving the profit back. Diamonds and triangles are the map. A trade prints only when a confirmed swing has pulled back to the fast EMA, the slow EMA and ADX still agree, the stop is beyond that swing but not a chase, and the target is a multiple of that risk. After the trade travels 1R, the stop locks a quarter-R and then trails. If an alert omits the target, the desk calculates it. If the target is on the wrong side of the entry, the desk refuses the order.
              </p>
              <p>
                Nothing in the pictures, or in any public library, can make the exit profit on every trade. When one bar trades through both prices, this desk fills the stop. The sample tape includes targets and at least one stop so that difference stays visible.
              </p>
              <h2 className="pt-2 text-base font-medium text-[#1c1915]">Resources</h2>
              <ul className="list-disc space-y-1 pl-5">
                <li>
                  <a className="underline" href="https://www.tradingview.com/pine-script-docs/faq/alerts/">
                    Pine Script alerts
                  </a>
                  , including alert() and order-fill messages.
                </li>
                <li>
                  <a className="underline" href="https://www.tradingview.com/pine-script-reference/v6/#fun_strategy.exit">
                    strategy.exit
                  </a>{" "}
                  for a stop and a limit on the same position.
                </li>
                <li>
                  <a className="underline" href="https://www.tradingview.com/support/solutions/43000529348-how-to-configure-webhook-alerts/">
                    Webhook alerts
                  </a>
                  . The URL has to be public HTTPS. The secret travels in the JSON body.
                </li>
                <li>
                  <a className="underline" href="https://www.investopedia.com/terms/a/atr.asp">
                    Average true range
                  </a>{" "}
                  is the distance used when an alert arrives without its own stop, and the buffer beyond a swing.
                </li>
                <li>
                  <a className="underline" href="https://ripbacktest.com/posts/ema-9-20-crossover-gold/">
                    Gold EMA test, 15-minute and 1-hour, 2004–2026
                  </a>
                  . After costs, the 15-minute versions lost. The 1-hour versions that capped winners at 1R also lost.
                </li>
              </ul>
            </div>
          </TabsContent>

          <TabsContent value="log" className="pt-3">
            <div className="max-h-80 space-y-1 overflow-auto font-mono text-xs leading-5">
              {[...desk.logs].reverse().map((line, index) => (
                <p key={`${line.at}-${index}`}>
                  <span className="text-[#6b645c]">{formatTime(line.at)}</span> {line.text}
                </p>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </main>
  );
}

function TicketCell({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "stop" | "target";
}) {
  const color = tone === "stop" ? "text-[#a33b32]" : tone === "target" ? "text-[#1f7a4d]" : "text-[#1c1915]";
  return (
    <div className="border-r border-[#d5dbe3] px-2 py-2 last:border-r-0">
      <div className="text-[10px] tracking-[0.14em] text-[#6b645c]">{label}</div>
      <div className={`font-mono text-sm ${color}`}>{value}</div>
      {hint ? <div className="text-[10px] text-[#6b645c]">{hint}</div> : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] tracking-[0.14em] text-[#6b645c]">{label}</div>
      <div>{value}</div>
    </div>
  );
}

function Legend({ swatch, label }: { swatch: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={`inline-block size-2.5 ${swatch}`} />
      {label}
    </span>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} inputMode="decimal" value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

function draftFrom(settings: Settings): Draft {
  return {
    rewardRisk: String(settings.rewardRisk),
    riskPercent: String(settings.riskPercent),
    atrStopMult: String(settings.atrStopMult),
    breakevenAtR: String(settings.breakevenAtR),
    webhookSecret: settings.webhookSecret,
  };
}

function showError(setError: (message: string) => void) {
  return (cause: unknown) => {
    setError(cause instanceof Error ? cause.message : "The desk could not update.");
  };
}
