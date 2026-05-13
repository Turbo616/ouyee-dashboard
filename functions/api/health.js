import { json } from "../_lib/ga4.js";

export const onRequestGet = async (context) => {
  const env = context.env || {};
  return json({
    ok: true,
    runtime: "cloudflare-pages-functions",
    hasClientEmail: Boolean(env.GA4_CLIENT_EMAIL),
    hasPrivateKey: Boolean(env.GA4_PRIVATE_KEY)
  });
};
