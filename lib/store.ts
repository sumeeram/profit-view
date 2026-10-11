import fs from "fs";
import path from "path";
import { createInitial } from "./session";
import type { DeskState } from "./types";

const file = path.join(process.cwd(), "data", "desk.json");

let memory: DeskState | null = null;
let chain: Promise<unknown> = Promise.resolve();

function persist(state: DeskState) {
  memory = state;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(state));
}

function load(): DeskState {
  if (memory) return memory;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, "utf8")) as DeskState;
    if (!parsed?.candles?.length || !parsed.settings?.webhookSecret) {
      throw new Error("Desk file is incomplete.");
    }
    memory = parsed;
    return parsed;
  } catch {
    const fresh = createInitial();
    persist(fresh);
    return fresh;
  }
}

export function readDesk(): DeskState {
  return load();
}

export function updateDesk(mutator: (state: DeskState) => DeskState): Promise<DeskState> {
  const run = chain.then(() => {
    const next = mutator(load());
    persist(next);
    return next;
  });
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}
