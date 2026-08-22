import { createHmac, timingSafeEqual } from "crypto";
import { callRpcServer } from "@/lib/supabase/callRpcServer";

// Meta calls this endpoint with NO Supabase session - it authenticates via
// WHATSAPP_WEBHOOK_VERIFY_TOKEN (the one-time GET verification handshake)
// and an X-Hub-Signature-256 HMAC on every POST body after that. Both
// secrets are server-only env vars, never exposed to the client.

// GET: Meta's one-time webhook verification handshake when the URL is first
// registered in the Meta App Dashboard.
export async function GET(request: Request) {
  const url = new URL(request.url);
  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;

  if (!expectedToken) {
    return new Response("Webhook not configured", { status: 503 });
  }

  if (mode === "subscribe" && token === expectedToken && challenge) {
    return new Response(challenge, { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

function verifySignature(rawBody: string, signatureHeader: string | null, appSecret: string): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) return false;

  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const provided = signatureHeader.slice("sha256=".length);

  const expectedBuf = Buffer.from(expected, "hex");
  const providedBuf = Buffer.from(provided, "hex");

  // Buffers must be equal length before timingSafeEqual, and length itself
  // isn't secret, so this early-return doesn't weaken the comparison.
  if (expectedBuf.length !== providedBuf.length) return false;

  return timingSafeEqual(expectedBuf, providedBuf);
}

type MetaStatusEntry = {
  id: string;
  status: string;
  timestamp: string;
};

// POST: delivery/read status callbacks (and inbound messages, ignored here -
// this route only updates outbound send status, it doesn't build a
// two-way chat feature).
export async function POST(request: Request) {
  const appSecret = process.env.WHATSAPP_META_APP_SECRET;

  if (!appSecret) {
    return new Response("Webhook not configured", { status: 503 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get("x-hub-signature-256");

  if (!verifySignature(rawBody, signature, appSecret)) {
    // Deliberately do not distinguish "missing signature" from "bad
    // signature" in the response - both are just a rejected request.
    return new Response("Invalid signature", { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const entries = (payload as { entry?: unknown[] })?.entry;
  if (!Array.isArray(entries)) {
    return new Response("OK", { status: 200 }); // nothing to process, still ack so Meta doesn't retry
  }

  for (const entry of entries) {
    const changes = (entry as { changes?: unknown[] })?.changes;
    if (!Array.isArray(changes)) continue;

    for (const change of changes) {
      const statuses = (change as { value?: { statuses?: MetaStatusEntry[] } })?.value?.statuses;
      if (!Array.isArray(statuses)) continue;

      for (const status of statuses) {
        if (!status?.id || !status?.status) continue;

        // Recorded first (idempotent on provider+event id) so a duplicate
        // callback for the exact same status update is a safe no-op -
        // "found" is false when this event id was already recorded.
        const isNewEvent = await callRpcServer<boolean>(
          "record_communication_webhook_event",
          {
            p_provider: "meta_whatsapp",
            p_provider_event_id: `${status.id}:${status.status}:${status.timestamp}`,
            p_payload: status,
          }
        ).catch(() => false);

        if (!isNewEvent) continue; // already processed this exact event

        // Guard against a non-numeric/out-of-range timestamp: the event was
        // already marked "recorded" above, so a thrown error here would
        // make Meta's automatic retry of this exact same webhook look like
        // an already-processed duplicate (skipped at the isNewEvent check)
        // and permanently lose the status update instead of degrading to
        // "now" and still applying it.
        const parsedMs = Number(status.timestamp) * 1000;
        const parsedDate = status.timestamp && Number.isFinite(parsedMs) ? new Date(parsedMs) : null;
        const timestamp =
          parsedDate && !Number.isNaN(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString();

        await callRpcServer("apply_whatsapp_delivery_status", {
          p_provider_message_id: status.id,
          p_status: status.status,
          p_timestamp: timestamp,
        }).catch(() => {
          // A malformed/unrecognized status update should not make Meta
          // retry-storm this endpoint - it's already been recorded above
          // for manual investigation via communication_webhook_events.
        });
      }
    }
  }

  return new Response("OK", { status: 200 });
}
