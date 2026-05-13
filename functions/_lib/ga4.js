export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store"
    }
  });
}

function base64urlFromText(text) {
  const bytes = new TextEncoder().encode(text);
  return base64urlFromBytes(bytes);
}

function base64urlFromBytes(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function decodeBase64ToBytes(base64) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    bytes[i] = bin.charCodeAt(i);
  }
  return bytes;
}

function pemToArrayBuffer(pem) {
  const clean = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, "")
    .replace(/-----END PRIVATE KEY-----/g, "")
    .replace(/\s+/g, "");
  return decodeBase64ToBytes(clean).buffer;
}

async function importPrivateKey(privateKeyPem) {
  return crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKeyPem),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  );
}

async function signJwt(unsignedToken, privateKeyPem) {
  const key = await importPrivateKey(privateKeyPem);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsignedToken));
  return base64urlFromBytes(new Uint8Array(signature));
}

function getEnvValue(env, key) {
  const value = env[key];
  if (!value || typeof value !== "string") {
    throw new Error(`Missing env secret: ${key}`);
  }
  return value;
}

export async function getAccessToken(env, scope) {
  const clientEmail = getEnvValue(env, "GA4_CLIENT_EMAIL");
  const privateKey = getEnvValue(env, "GA4_PRIVATE_KEY");

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: "RS256", typ: "JWT" };
  const payload = {
    iss: clientEmail,
    scope,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600
  };

  const unsigned = `${base64urlFromText(JSON.stringify(header))}.${base64urlFromText(JSON.stringify(payload))}`;
  const sig = await signJwt(unsigned, privateKey);
  const assertion = `${unsigned}.${sig}`;

  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });

  const res = await fetch("https://oauth2.googleapis.com/token", { method: "POST", body: form });
  const body = await res.json();
  if (!res.ok) {
    throw new Error(body?.error_description || body?.error || "OAuth token request failed");
  }
  return body.access_token;
}

export async function googleApiRequest({ url, token, method = "GET", body }) {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  const payload = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(payload?.error?.message || `Google API error: ${res.status}`);
    err.status = res.status;
    err.payload = payload;
    throw err;
  }
  return payload;
}

export function simplifyApiError(err) {
  const payload = err.payload || {};
  const error = payload.error || {};
  const details = error.details || [];
  const info = details.find((d) => d["@type"] === "type.googleapis.com/google.rpc.ErrorInfo");
  const help = details.find((d) => d["@type"] === "type.googleapis.com/google.rpc.Help");
  const localized = details.find((d) => d["@type"] === "type.googleapis.com/google.rpc.LocalizedMessage");
  return {
    status: err.status || 500,
    message: error.message || err.message,
    reason: info?.reason || null,
    service: info?.metadata?.service || null,
    activationUrl: info?.metadata?.activationUrl || help?.links?.[0]?.url || null,
    localizedMessage: localized?.message || null
  };
}

export function num(v) {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
}

export function normalizeDate(yyyymmdd) {
  const s = String(yyyymmdd || "");
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}
