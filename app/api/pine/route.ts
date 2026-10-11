import fs from "fs";
import path from "path";
import { connection } from "next/server";

export async function GET() {
  await connection();
  const file = path.join(process.cwd(), "pine", "diamond-tp.pine");
  const source = fs.readFileSync(file, "utf8");
  return new Response(source, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
