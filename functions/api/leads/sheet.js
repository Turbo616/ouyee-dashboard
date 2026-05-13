import { getAccessToken, googleApiRequest, json, simplifyApiError } from "../../_lib/ga4.js";

const DEFAULT_SPREADSHEET_ID = "1YQIJ7jHgiJi0YtXJKMSYhuqhbILwmN38KfTpvTWmW90";

const TAB_RULES = [
  { siteId: "ouyedisplay", domain: "ouyedisplay.com", mode: "exact", key: "\u6b27\u91ce1", minDate: "2025-01-01" },
  { siteId: "ouyedisplay", domain: "ouyedisplay.com", mode: "contains", key: "whatsapp", minDate: "2025-01-01" },
  { siteId: "oydisplay", domain: "oydisplay.com", mode: "exact", key: "\u6b27\u91ce2" },
  { siteId: "focusstoredisplay", domain: "focusstoredisplay.com", mode: "exact", key: "\u89c2\u7b51" }
];

// A channel, B date, C name, D email, E phone, F country, G store type, H message, I owner, J source URL
const IDX_DATE = 1;
const IDX_COUNTRY = 5;
const IDX_STORE = 6;
const IDX_OWNER = 8;
const IDX_SOURCE_URL = 9;

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function parseDateToIso(input) {
  const s = String(input || "").trim();
  if (!s) return null;
  const m1 = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (m1) return `${m1[1]}-${String(m1[2]).padStart(2, "0")}-${String(m1[3]).padStart(2, "0")}`;
  const m2 = s.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (m2) return `${m2[1]}-${String(m2[2]).padStart(2, "0")}-${String(m2[3]).padStart(2, "0")}`;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function newBucket(domain) {
  return { domain, total: 0, daily: {}, countries: {}, storeTypes: {}, owners: {} };
}

function canonicalKey(value) {
  const raw = String(value || "").trim();
  if (!raw) return "(Unknown)";
  if (/^[A-Za-z][A-Za-z\s\-()]*$/.test(raw)) {
    return raw
      .toLowerCase()
      .replace(/\s+/g, " ")
      .replace(/\b[a-z]/g, (m) => m.toUpperCase());
  }
  return raw;
}

function addCount(map, key) {
  const k = canonicalKey(key);
  map[k] = (map[k] || 0) + 1;
}

function applyRow(bucket, date, country, storeType, owner) {
  bucket.total += 1;
  addCount(bucket.daily, date);
  addCount(bucket.countries, country);
  addCount(bucket.storeTypes, storeType);
  addCount(bucket.owners, owner);
}

function inferSiteByUrl(url) {
  const t = String(url || "").toLowerCase();
  if (t.includes("ouyedisplay.com")) return { siteId: "ouyedisplay", domain: "ouyedisplay.com" };
  if (t.includes("oydisplay.com")) return { siteId: "oydisplay", domain: "oydisplay.com" };
  if (t.includes("focusstoredisplay.com")) return { siteId: "focusstoredisplay", domain: "focusstoredisplay.com" };
  return null;
}

function matchRuleForTab(title) {
  const t = normalize(title);
  return TAB_RULES.find((r) => (r.mode === "exact" ? t === normalize(r.key) : t.includes(normalize(r.key))));
}

export const onRequestGet = async (context) => {
  const { request, env } = context;
  const u = new URL(request.url);
  const spreadsheetId = u.searchParams.get("spreadsheetId") || env.LEADS_SPREADSHEET_ID || DEFAULT_SPREADSHEET_ID;
  const maxRows = Number(u.searchParams.get("maxRows") || "100000");

  try {
    const token = await getAccessToken(env, "https://www.googleapis.com/auth/spreadsheets.readonly");
    const meta = await googleApiRequest({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}?fields=sheets(properties(title,sheetId))`,
      token
    });

    const allTitles = (meta.sheets || []).map((s) => s.properties?.title).filter(Boolean);
    const selectedTabs = [];
    const tabToSite = {};
    const tabMinDate = {};
    allTitles.forEach((title) => {
      const rule = matchRuleForTab(title);
      if (!rule) return;
      selectedTabs.push(title);
      tabToSite[title] = { siteId: rule.siteId, domain: rule.domain };
      tabMinDate[title] = rule.minDate || null;
    });

    const perSite = {
      ouyedisplay: newBucket("ouyedisplay.com"),
      oydisplay: newBucket("oydisplay.com"),
      focusstoredisplay: newBucket("focusstoredisplay.com")
    };
    const all = newBucket("all");

    if (!selectedTabs.length) {
      return json({ spreadsheetId, matchedTabs: [], parsedRows: 0, skippedRows: 0, perSite, all });
    }

    const ranges = selectedTabs.map((t) => `${t}!A:J`);
    const q = ranges.map((r) => `ranges=${encodeURIComponent(r)}`).join("&");
    const batch = await googleApiRequest({
      url: `https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values:batchGet?majorDimension=ROWS&${q}`,
      token
    });

    let parsedRows = 0;
    let skippedRows = 0;

    for (const vr of batch.valueRanges || []) {
      const range = String(vr.range || "");
      const tabTitle = range.split("!")[0].replace(/^'/, "").replace(/'$/, "");
      const fallbackSite = tabToSite[tabTitle] || null;
      const minDate = tabMinDate[tabTitle] || null;
      const rows = vr.values || [];
      if (rows.length <= 1) continue;

      for (let i = 1; i < rows.length && i <= maxRows; i += 1) {
        const row = rows[i];
        const date = parseDateToIso(row[IDX_DATE]);
        if (!date) {
          skippedRows += 1;
          continue;
        }
        if (minDate && date < minDate) {
          skippedRows += 1;
          continue;
        }

        const inferred = inferSiteByUrl(row[IDX_SOURCE_URL] || "");
        const site = inferred || fallbackSite;
        if (!site || !perSite[site.siteId]) {
          skippedRows += 1;
          continue;
        }

        applyRow(perSite[site.siteId], date, row[IDX_COUNTRY] || "", row[IDX_STORE] || "", row[IDX_OWNER] || "");
        applyRow(all, date, row[IDX_COUNTRY] || "", row[IDX_STORE] || "", row[IDX_OWNER] || "");
        parsedRows += 1;
      }
    }

    return json({ spreadsheetId, matchedTabs: selectedTabs, parsedRows, skippedRows, perSite, all });
  } catch (err) {
    const details = simplifyApiError(err);
    return json({ error: details.message, details }, details.status || 500);
  }
};
