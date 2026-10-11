import { connection } from "next/server";
import { present } from "@/lib/session";
import { readDesk } from "@/lib/store";

export async function GET() {
  await connection();
  return Response.json(present(readDesk()));
}
