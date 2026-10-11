import { connection } from "next/server";
import { applySettings, closeManual, createInitial, present, step } from "@/lib/session";
import { updateDesk } from "@/lib/store";
import type { Settings } from "@/lib/types";

type BotBody = {
  action?: string;
  steps?: number;
  settings?: Partial<Settings>;
};

export async function POST(request: Request) {
  await connection();
  const body = (await request.json().catch(() => null)) as BotBody | null;
  if (!body || typeof body !== "object") {
    return Response.json({ error: "JSON body required." }, { status: 400 });
  }
  const action = String(body.action ?? "");
  const known = ["start", "pause", "step", "reset", "close", "settings"];
  if (!known.includes(action)) {
    return Response.json({ error: "Unknown action." }, { status: 400 });
  }

  const next = await updateDesk((state) => {
    if (action === "start") {
      if (state.cursor >= state.candles.length - 1) return { ...state, running: false };
      return step({ ...state, running: true });
    }
    if (action === "pause") return { ...state, running: false };
    if (action === "step") {
      const count = clampSteps(body.steps);
      let cursor = state;
      for (let i = 0; i < count; i += 1) {
        if (cursor.cursor >= cursor.candles.length - 1) break;
        cursor = step(cursor);
      }
      return cursor;
    }
    if (action === "reset") return createInitial(state.settings);
    if (action === "close") return closeManual(state);
    return applySettings(state, body.settings ?? {});
  });

  return Response.json(present(next));
}

function clampSteps(value: number | undefined): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(12, Math.max(1, Math.round(value ?? 1)));
}
