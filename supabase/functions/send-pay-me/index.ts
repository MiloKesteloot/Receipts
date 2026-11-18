// Supabase Edge Function: sends a "Pay me" push to everyone who still owes
// the uploader on a finalized receipt, at most once an hour (User Story 3.5).
//
// Body: { "receiptId": "<uuid>" }, with the signed-in user's JWT.
// Secrets: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by
// Supabase. Optional EXPO_ACCESS_TOKEN, only if "enhanced push security" is
// turned on in the Expo dashboard.
//
// All rules live in the start_pay_me RPC; the logic here is in pay-me.ts.

import { createClient } from "npm:@supabase/supabase-js@2";

import { handlePayMe, type PushMessage, type PushTicket } from "./pay-me.ts";

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Native clients do not send an Origin. For web, set APP_ORIGIN to the exact
// deployed web origin so the function does not answer every browser origin.
const CORS = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_ORIGIN") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ status: "error", error: "METHOD", message: "Use POST" }, 405);

  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) {
    return json({ status: "error", error: "SERVER_ERROR", message: "Supabase secrets are not set" }, 500);
  }
  const admin = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const expoToken = Deno.env.get("EXPO_ACCESS_TOKEN");

  let body: unknown = null;
  try {
    body = await req.json();
  } catch {
    // handlePayMe reports the missing receipt id
  }

  const result = await handlePayMe(req.headers.get("Authorization"), body, {
    async getUserId(authHeader) {
      const jwt = authHeader?.replace(/^Bearer\s+/i, "").trim();
      if (!jwt) return null;
      const { data, error } = await admin.auth.getUser(jwt);
      return error || !data.user ? null : data.user.id;
    },
    async startPayMe(receiptId, userId) {
      const { data, error } = await admin.rpc("start_pay_me", {
        p_receipt_id: receiptId,
        p_user_id: userId,
      });
      return { data, error };
    },
    async sendPush(messages: PushMessage[]): Promise<PushTicket[]> {
      const res = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          accept: "application/json",
          "content-type": "application/json",
          ...(expoToken ? { authorization: `Bearer ${expoToken}` } : {}),
        },
        body: JSON.stringify(messages),
      });
      if (!res.ok) throw new Error(`Expo push failed (${res.status}): ${await res.text()}`);
      const payload = await res.json();
      return Array.isArray(payload?.data) ? payload.data : [];
    },
    async deleteTokens(tokens) {
      await admin.from("push_tokens").delete().in("token", tokens);
    },
    async clearCooldown(receiptId) {
      await admin.from("pay_me_nudges").delete().eq("receipt_id", receiptId);
    },
  });

  return json(result.body, result.httpStatus);
});
