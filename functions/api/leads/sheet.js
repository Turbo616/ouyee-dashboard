import { getAccessToken, googleApiRequest, json, simplifyApiError } from "../../_lib/ga4.js";

const DEFAULT_SPREADSHEET_ID = "1YQIJ7jHgiJi0YtXJKMSYhuqhbILwmN38KfTpvTWmW90";

const TAB_RULES = [
  { siteId: "ouyedisplay", domain: "ouyedisplay.com", mode: "exact", key: "欧野1", minDate: "2025-01-01" },
  { siteId: "ouyedisplay", domain: "ouyedisplay.com", mode: "contains", key: "whatsapp", minDate: "2025-01-01" },
  { siteId: "oydisplay", domain: "oydisplay.com", mode: "exact", key: "欧野2" },
  { siteId: "focusstoredisplay", domain: "focusstoredisplay.com", mode: "exact", key: "观筑" }
];

// Legacy fallback indexes for A:J (some tabs have shifted columns)
const LEGACY_IDX_DATE = 1;
const LEGACY_IDX_COUNTRY = 5;
const LEGACY_IDX_STORE = 6;
const LEGACY_IDX_OWNER = 8;
const LEGACY_IDX_SOURCE_URL = 9;

function normalize(s) {
  return String(s || "").trim().toLowerCase();
}

function normalizeHeader(s) {
  return normalize(s).replace(/\s+/g, "").replace(/[：:]/g, "");
}

function findHeaderIndex(headerRow, aliases) {
  const normalizedAliases = aliases.map((x) => normalizeHeader(x));
  const normalizedCells = (headerRow || []).map((x) => normalizeHeader(x));

  for (let i = 0; i < normalizedCells.length; i += 1) {
    const cell = normalizedCells[i];
    if (!cell) continue;
    if (normalizedAliases.some((a) => cell === a || cell.includes(a))) return i;
  }
  return -1;
}

function detectColumns(headerRow) {
  return {
    date: findHeaderIndex(headerRow, ["日期", "date"]),
    country: findHeaderIndex(headerRow, ["国家", "country"]),
    store: findHeaderIndex(headerRow, ["店铺", "店铺类型", "店铺类目", "类目", "品类", "store", "storetype", "category", "shoptype"]),
    owner: findHeaderIndex(headerRow, ["跟进人", "跟进", "跟进人员", "业务员", "owner", "sales", "followup", "followupowner"]),
    sourceUrl: findHeaderIndex(headerRow, ["询盘来源url", "来源url", "sourceurl", "source", "url", "website"])
  };
}

function getCell(row, idx, fallbackIdx = -1) {
  if (idx >= 0 && idx < row.length) return row[idx];
  if (fallbackIdx >= 0 && fallbackIdx < row.length) return row[fallbackIdx];
  return "";
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
  return {
    domain,
    total: 0,
    daily: {},
    countries: {},
    storeTypes: {},
    owners: {},
    countryDaily: {},
    storeTypeDaily: {},
    ownerDaily: {}
  };
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

function addCount(map, key, increment = 1) {
  const k = canonicalKey(key);
  map[k] = (map[k] || 0) + increment;
}

function addDailyDimension(dailyMap, date, key) {
  const d = String(date || "");
  if (!d) return;
  if (!dailyMap[d]) dailyMap[d] = {};
  addCount(dailyMap[d], key);
}

function applyRow(bucket, date, country, storeType, owner) {
  bucket.total += 1;
  addCount(bucket.daily, date);
  addCount(bucket.countries, country);
  addCount(bucket.storeTypes, storeType);
  addCount(bucket.owners, owner);
  addDailyDimension(bucket.countryDaily, date, country);
  addDailyDimension(bucket.storeTypeDaily, date, storeType);
  addDailyDimension(bucket.ownerDaily, date, owner);
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
      const header = rows[0] || [];
      const cols = detectColumns(header);

      for (let i = 1; i < rows.length && i <= maxRows; i += 1) {
        const row = rows[i];
        const date = parseDateToIso(getCell(row, cols.date, LEGACY_IDX_DATE));
        if (!date) {
          skippedRows += 1;
          continue;
        }
        if (minDate && date < minDate) {
          skippedRows += 1;
          continue;
        }

        const inferred = inferSiteByUrl(getCell(row, cols.sourceUrl, LEGACY_IDX_SOURCE_URL) || "");
        const site = inferred || fallbackSite;
        if (!site || !perSite[site.siteId]) {
          skippedRows += 1;
          continue;
        }

        const country = getCell(row, cols.country, LEGACY_IDX_COUNTRY);
        const storeType = getCell(row, cols.store, LEGACY_IDX_STORE);
        const owner = getCell(row, cols.owner, LEGACY_IDX_OWNER);
        applyRow(perSite[site.siteId], date, country, storeType, owner);
        applyRow(all, date, country, storeType, owner);
        parsedRows += 1;
      }
    }

    return json({ spreadsheetId, matchedTabs: selectedTabs, parsedRows, skippedRows, perSite, all });
  } catch (err) {
    const details = simplifyApiError(err);
    return json({ error: details.message, details }, details.status || 500);
  }
};
