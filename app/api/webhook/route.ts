import { connection } from "next/server";
import { applyWebhook, present, type WebhookResult } from "@/lib/session";
import { updateDesk } from "@/lib/store";

export async function POST(request: Request) {
  await connection();
  const payload = await request.json().catch(() => null);
  let outcome: WebhookResult | null = null;
  const next = await updateDesk((state) => {
    const result = applyWebhook(state, payload);
    outcome = result;
    return result.state;
  });
  const result = outcome ?? {
    status: 500,
    body: { ok: false, message: "Webhook was not processed." },
  };
  return Response.json(
    { ok: result.body.ok, message: result.body.message, desk: present(next) },
    { status: result.status },
  );
}
