const SITES = [
  { id: "oydisplay", name: "OYDisplay", domain: "oydisplay.com", propertyId: "484489968", color: "#00d4ff" },
  { id: "ouyedisplay", name: "OUYEE Display", domain: "ouyedisplay.com", propertyId: "358897531", color: "#1dff9b" },
  { id: "focusstoredisplay", name: "Focus Store Display", domain: "focusstoredisplay.com", propertyId: "", color: "#ffd166" }
];

const CHANNEL_KEYS = ["Organic Search", "Direct", "Referral", "Organic Social", "Paid Search"];
const DEVICE_KEYS = ["desktop", "mobile", "tablet"];

const state = {
  selectedSites: new Set(SITES.map((s) => s.id)),
  focusSiteId: localStorage.getItem("focus_site_id") || "oydisplay",
  allDates: [],
  store: Object.fromEntries(
    SITES.map((s) => [
      s.id,
      {
        ga4: { source: "none", dataByDate: {}, channels: {}, devices: {}, topPages: [] },
        leads: { total: 0, daily: {}, countries: {}, storeTypes: {}, owners: {} },
        gsc: { siteUrl: null, error: null, kpi: { clicks: 0, impressions: 0, ctr: 0, position: 0 }, topQueries: [], topPages: [] }
      }
    ])
  ),
  charts: { trend: null, country: null, storeType: null, owner: null }
};

function formatDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseDate(s) {
  return new Date(`${s}T00:00:00`);
}

function addDays(date, delta) {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
}

function makeDateSpan(days = 150) {
  const now = new Date();
  const out = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(formatDate(addDays(now, -i)));
  return out;
}

function diffDays(start, end) {
  return Math.floor((end - start) / 86400000) + 1;
}

function fmtNum(n) {
  return new Intl.NumberFormat("zh-CN").format(Math.round(n || 0));
}

function fmtPct(v, digits = 2) {
  return `${((v || 0) * 100).toFixed(digits)}%`;
}

function fmtDuration(sec) {
  const m = Math.floor((sec || 0) / 60);
  const s = Math.round((sec || 0) % 60);
  return `${m}m ${s}s`;
}

function delta(current, prev, inverse = false) {
  if (!prev) return { text: "No baseline", cls: "" };
  const raw = ((current - prev) / prev) * 100;
  const adj = inverse ? -raw : raw;
  const cls = adj >= 0 ? "up" : "down";
  return { text: `${adj >= 0 ? "+" : ""}${adj.toFixed(1)}% vs previous`, cls };
}

function setStatus(msg, isError = false) {
  const el = document.getElementById("ga4Status");
  el.textContent = msg;
  el.style.color = isError ? "#ff7b72" : "#a8b8d8";
}

function getFocusSite() {
  return SITES.find((s) => s.id === state.focusSiteId) || SITES[0];
}

function setFocusSite(siteId) {
  state.focusSiteId = siteId;
  localStorage.setItem("focus_site_id", siteId);
  const site = getFocusSite();
  document.getElementById("propertyIdInput").value = site.propertyId || "(sheet-only)";
}

function setupDateRange() {
  const end = state.allDates[state.allDates.length - 1];
  const start = state.allDates[Math.max(0, state.allDates.length - 30)];
  document.getElementById("startDate").value = start;
  document.getElementById("endDate").value = end;
}

function getRangeDates() {
  const start = parseDate(document.getElementById("startDate").value);
  const end = parseDate(document.getElementById("endDate").value);
  return state.allDates.filter((d) => {
    const day = parseDate(d);
    return day >= start && day <= end;
  });
}

function topNEntries(map, n = 8) {
  return Object.entries(map || {})
    .sort((a, b) => Number(b[1]) - Number(a[1]))
    .slice(0, n);
}

function sumMaps(maps) {
  const out = {};
  maps.forEach((m) => {
    Object.entries(m || {}).forEach(([k, v]) => {
      out[k] = (out[k] || 0) + Number(v || 0);
    });
  });
  return out;
}

async function loadGa4ForProperty(propertyId) {
  const endDate = new Date();
  const startDate = addDays(endDate, -149);
  const url = `/api/ga4/dashboard?propertyId=${encodeURIComponent(propertyId)}&startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}`;
  const res = await fetch(url);
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "GA4 request failed");

  const dataByDate = {};
  (payload.perDay || []).forEach((r) => {
    dataByDate[r.date] = {
      sessions: Number(r.sessions) || 0,
      users: Number(r.users) || 0,
      pageviews: Number(r.pageviews) || 0,
      conversions: Number(r.conversions) || 0,
      bounceRate: Number(r.bounceRate) || 0,
      avgDuration: Number(r.avgDuration) || 0,
      revenue: Number(r.revenue) || 0
    };
  });

  return {
    source: "ga4",
    dataByDate,
    channels: payload.channels || {},
    devices: payload.devices || {},
    topPages: payload.topPages || []
  };
}

async function loadLeadsSheet() {
  const res = await fetch("/api/leads/sheet");
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "Sheet request failed");
  return payload;
}

async function discoverProperties() {
  const res = await fetch("/api/ga4/discover");
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "Discover failed");
  return payload.properties || [];
}

async function loadGscSummary(startDate, endDate, siteIds) {
  const sites = siteIds.join(",");
  const url = `/api/gsc/summary?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&sites=${encodeURIComponent(sites)}`;
  const res = await fetch(url);
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "GSC request failed");
  return payload;
}

function renderSiteList() {
  const root = document.getElementById("siteList");
  root.innerHTML = "";

  SITES.forEach((site) => {
    const selected = state.selectedSites.has(site.id);
    const focused = site.id === state.focusSiteId;
    const el = document.createElement("div");
    el.className = `site-item ${selected ? "active" : ""} ${focused ? "focused" : ""}`;
    el.innerHTML = `
      <div>
        <strong>${site.name}</strong>
        <div class="site-domain">${site.domain}</div>
        <div class="site-domain">Property: ${site.propertyId || "Sheet only"}</div>
      </div>
      <span class="site-dot" style="background:${site.color};"></span>
    `;
    el.addEventListener("click", () => {
      if (selected && state.selectedSites.size > 1) state.selectedSites.delete(site.id);
      else state.selectedSites.add(site.id);
      setFocusSite(site.id);
      renderSiteList();
      renderDashboard();
    });
    root.appendChild(el);
  });
}

function aggregateForSelected(siteIds, dates) {
  const out = {
    sessions: 0,
    users: 0,
    pageviews: 0,
    conversions: 0,
    revenue: 0,
    avgDurationWeighted: 0,
    bounceWeighted: 0,
    leads: 0,
    leadRate: 0,
    conversionRate: 0,
    bounceRate: 0,
    avgDuration: 0,
    trendBySite: {},
    countries: {},
    storeTypes: {},
    owners: {}
    ,
    gscClicks: 0,
    gscImpressions: 0,
    gscCtrWeighted: 0,
    gscPositionWeighted: 0,
    gscCtr: 0,
    gscPosition: 0
  };

  const countryMaps = [];
  const storeTypeMaps = [];
  const ownerMaps = [];

  siteIds.forEach((siteId) => {
    const item = state.store[siteId];
    out.trendBySite[siteId] = [];

    dates.forEach((d) => {
      const row = item.ga4.dataByDate[d];
      if (!row) {
        out.trendBySite[siteId].push(0);
      } else {
        out.trendBySite[siteId].push(row.sessions);
        out.sessions += row.sessions;
        out.users += row.users;
        out.pageviews += row.pageviews;
        out.conversions += row.conversions;
        out.revenue += row.revenue;
        out.avgDurationWeighted += row.avgDuration * row.sessions;
        out.bounceWeighted += row.bounceRate * row.sessions;
      }
      out.leads += Number(item.leads.daily[d] || 0);
    });

    countryMaps.push(item.leads.countries);
    storeTypeMaps.push(item.leads.storeTypes);
    ownerMaps.push(item.leads.owners);

    const gsc = item.gsc?.kpi || {};
    out.gscClicks += Number(gsc.clicks || 0);
    out.gscImpressions += Number(gsc.impressions || 0);
    out.gscCtrWeighted += Number(gsc.ctr || 0) * Number(gsc.impressions || 0);
    out.gscPositionWeighted += Number(gsc.position || 0) * Number(gsc.impressions || 0);
  });

  out.countries = sumMaps(countryMaps);
  out.storeTypes = sumMaps(storeTypeMaps);
  out.owners = sumMaps(ownerMaps);
  out.conversionRate = out.sessions ? out.conversions / out.sessions : 0;
  out.leadRate = out.sessions ? out.leads / out.sessions : 0;
  out.bounceRate = out.sessions ? out.bounceWeighted / out.sessions : 0;
  out.avgDuration = out.sessions ? out.avgDurationWeighted / out.sessions : 0;
  out.gscCtr = out.gscImpressions ? out.gscCtrWeighted / out.gscImpressions : 0;
  out.gscPosition = out.gscImpressions ? out.gscPositionWeighted / out.gscImpressions : 0;

  return out;
}

function pickPreviousDates(currentDates) {
  if (!currentDates.length) return [];
  const start = parseDate(currentDates[0]);
  const end = parseDate(currentDates[currentDates.length - 1]);
  const len = diffDays(start, end);
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -(len - 1));
  return state.allDates.filter((d) => {
    const day = parseDate(d);
    return day >= prevStart && day <= prevEnd;
  });
}

function renderKpis(current, previous) {
  const items = [
    { name: "Leads (Sheet)", value: fmtNum(current.leads), delta: delta(current.leads, previous.leads) },
    { name: "Lead Rate", value: fmtPct(current.leadRate), delta: delta(current.leadRate, previous.leadRate) },
    { name: "GSC Clicks", value: fmtNum(current.gscClicks), delta: delta(current.gscClicks, previous.gscClicks) },
    { name: "GSC Impressions", value: fmtNum(current.gscImpressions), delta: delta(current.gscImpressions, previous.gscImpressions) },
    { name: "GSC CTR", value: fmtPct(current.gscCtr), delta: delta(current.gscCtr, previous.gscCtr) },
    { name: "GSC Position", value: current.gscPosition.toFixed(2), delta: delta(current.gscPosition, previous.gscPosition, true) }
  ];

  document.getElementById("kpiGrid").innerHTML = items
    .map(
      (k) => `
      <article class="panel kpi-card">
        <p class="kpi-name">${k.name}</p>
        <div class="kpi-value">${k.value}</div>
        <div class="kpi-delta ${k.delta.cls || ""}">${k.delta.text}</div>
      </article>`
    )
    .join("");
}

function upsertChart(name, config, canvasId) {
  if (state.charts[name]) state.charts[name].destroy();
  state.charts[name] = new Chart(document.getElementById(canvasId), config);
}

function renderTrendChart(dates, agg, selectedIds) {
  const datasets = selectedIds.map((siteId) => {
    const site = SITES.find((s) => s.id === siteId);
    return {
      label: site.domain,
      data: agg.trendBySite[siteId],
      borderColor: site.color,
      backgroundColor: `${site.color}55`,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.35,
      fill: false
    };
  });

  upsertChart(
    "trend",
    {
      type: "line",
      data: { labels: dates.map((d) => d.slice(5)), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: "#dce7ff" } } },
        scales: {
          x: { ticks: { color: "#9fb3d1" }, grid: { color: "rgba(255,255,255,0.05)" } },
          y: { ticks: { color: "#9fb3d1" }, grid: { color: "rgba(255,255,255,0.05)" } }
        }
      }
    },
    "trendChart"
  );
}

function renderHorizontalBar(canvasId, chartName, titleMap, colors) {
  const entries = topNEntries(titleMap, 8);
  upsertChart(
    chartName,
    {
      type: "bar",
      data: {
        labels: entries.map((e) => e[0]),
        datasets: [{ data: entries.map((e) => e[1]), backgroundColor: colors }]
      },
      options: {
        indexAxis: "y",
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { ticks: { color: "#9fb3d1" }, grid: { color: "rgba(255,255,255,0.04)" } },
          y: { ticks: { color: "#9fb3d1" }, grid: { color: "rgba(255,255,255,0.04)" } }
        }
      }
    },
    canvasId
  );
}

function renderLeadSummaryTable(siteIds, dates) {
  const tbody = document.getElementById("leadSummaryTable");
  tbody.innerHTML = siteIds
    .map((siteId) => {
      const site = SITES.find((s) => s.id === siteId);
      const leads = state.store[siteId].leads;
      const total = dates.reduce((a, d) => a + Number(leads.daily[d] || 0), 0);
      const topCountry = topNEntries(leads.countries, 1)[0]?.[0] || "-";
      const topStore = topNEntries(leads.storeTypes, 1)[0]?.[0] || "-";
      const topOwner = topNEntries(leads.owners, 1)[0]?.[0] || "-";
      return `<tr>
        <td>${site.domain}</td>
        <td>${fmtNum(total)}</td>
        <td>${topCountry}</td>
        <td>${topStore}</td>
        <td>${topOwner}</td>
      </tr>`;
    })
    .join("");
}

function renderGscTables(siteIds) {
  const queryRows = [];
  const pageRows = [];
  siteIds.forEach((siteId) => {
    const site = SITES.find((s) => s.id === siteId);
    const gsc = state.store[siteId].gsc || {};
    (gsc.topQueries || []).slice(0, 8).forEach((r) => {
      queryRows.push({
        site: site.domain,
        key: r.query || "(not set)",
        clicks: Number(r.clicks || 0),
        impressions: Number(r.impressions || 0),
        ctr: Number(r.ctr || 0),
        position: Number(r.position || 0)
      });
    });
    (gsc.topPages || []).slice(0, 8).forEach((r) => {
      pageRows.push({
        site: site.domain,
        key: r.page || "(not set)",
        clicks: Number(r.clicks || 0),
        impressions: Number(r.impressions || 0),
        ctr: Number(r.ctr || 0),
        position: Number(r.position || 0)
      });
    });
  });

  queryRows.sort((a, b) => b.clicks - a.clicks);
  pageRows.sort((a, b) => b.clicks - a.clicks);

  document.getElementById("gscKeywordTable").innerHTML = queryRows
    .slice(0, 20)
    .map(
      (r) =>
        `<tr><td>${r.site}</td><td>${r.key}</td><td>${fmtNum(r.clicks)}</td><td>${fmtNum(r.impressions)}</td><td>${fmtPct(r.ctr)}</td><td>${r.position.toFixed(2)}</td></tr>`
    )
    .join("");

  document.getElementById("gscPageTable").innerHTML = pageRows
    .slice(0, 20)
    .map(
      (r) =>
        `<tr><td>${r.site}</td><td>${r.key}</td><td>${fmtNum(r.clicks)}</td><td>${fmtNum(r.impressions)}</td><td>${fmtPct(r.ctr)}</td><td>${r.position.toFixed(2)}</td></tr>`
    )
    .join("");
}

function renderHeader(siteIds, dates) {
  document.getElementById("selectedSummary").textContent = `${siteIds.length} sites`;
  document.getElementById("rangeSummary").textContent = `${dates[0] || "-"} to ${dates[dates.length - 1] || "-"}`;
}

function renderDashboard() {
  const siteIds = Array.from(state.selectedSites);
  const dates = getRangeDates();
  const prevDates = pickPreviousDates(dates);
  const current = aggregateForSelected(siteIds, dates);
  const previous = aggregateForSelected(siteIds, prevDates);

  renderHeader(siteIds, dates);
  renderKpis(current, previous);
  renderTrendChart(dates, current, siteIds);
  renderHorizontalBar("countryChart", "country", current.countries, "#00d4ff");
  renderHorizontalBar("storeTypeChart", "storeType", current.storeTypes, "#1dff9b");
  renderHorizontalBar("ownerChart", "owner", current.owners, "#ffd166");
  renderLeadSummaryTable(siteIds, dates);
  renderGscTables(siteIds);
}

async function refreshAllData() {
  setStatus("Syncing GA4 + Sheet...");

  const selected = SITES.filter((s) => state.selectedSites.has(s.id));

  await Promise.all(
    selected.map(async (site) => {
      if (!site.propertyId) return;
      try {
        const ga4 = await loadGa4ForProperty(site.propertyId);
        state.store[site.id].ga4 = ga4;
      } catch (err) {
        state.store[site.id].ga4 = { source: "error", dataByDate: {}, channels: {}, devices: {}, topPages: [] };
      }
    })
  );

  try {
    const leadsPayload = await loadLeadsSheet();
    Object.entries(leadsPayload.perSite || {}).forEach(([siteId, bucket]) => {
      if (!state.store[siteId]) return;
      state.store[siteId].leads = {
        total: Number(bucket.total || 0),
        daily: bucket.daily || {},
        countries: bucket.countries || {},
        storeTypes: bucket.storeTypes || {},
        owners: bucket.owners || {}
      };
    });
    setStatus("Data synced: GA4 + Google Sheets.");
  } catch (err) {
    setStatus(`GA4 synced, Sheet failed: ${err.message}`, true);
  }

  try {
    const startDate = document.getElementById("startDate").value;
    const endDate = document.getElementById("endDate").value;
    const gscPayload = await loadGscSummary(startDate, endDate, selected.map((s) => s.id));
    Object.entries(gscPayload.perSite || {}).forEach(([siteId, info]) => {
      if (!state.store[siteId]) return;
      state.store[siteId].gsc = {
        siteUrl: info.siteUrl || null,
        error: info.error || null,
        kpi: info.kpi || { clicks: 0, impressions: 0, ctr: 0, position: 0 },
        topQueries: info.topQueries || [],
        topPages: info.topPages || []
      };
    });
    setStatus("Data synced: GA4 + Google Sheets + GSC.");
  } catch (err) {
    setStatus(`GA4/Sheet synced, GSC failed: ${err.message}`, true);
  }
}

async function checkMapping() {
  try {
    const list = await discoverProperties();
    const ids = new Set(list.map((x) => String(x.propertyId)));
    const missing = SITES.filter((s) => s.propertyId && !ids.has(s.propertyId)).map((s) => s.propertyId);
    if (!missing.length) setStatus("Fixed GA4 mapping check passed.");
    else setStatus(`Mapping warning: missing property ${missing.join(", ")}`, true);
  } catch (err) {
    setStatus(`Discover check failed: ${err.message}`, true);
  }
}

function wireEvents() {
  document.getElementById("startDate").addEventListener("change", renderDashboard);
  document.getElementById("endDate").addEventListener("change", renderDashboard);

  document.querySelectorAll(".quick-range button[data-days]").forEach((btn) => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".quick-range button[data-days]").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const days = Number(btn.dataset.days);
      const end = parseDate(state.allDates[state.allDates.length - 1]);
      const start = addDays(end, -(days - 1));
      document.getElementById("startDate").value = formatDate(start);
      document.getElementById("endDate").value = formatDate(end);
      renderDashboard();
    });
  });

  document.getElementById("connectGa4Btn").addEventListener("click", async () => {
    await refreshAllData();
    renderDashboard();
  });

  document.getElementById("discoverGa4Btn").addEventListener("click", async () => {
    await checkMapping();
  });

  const propertyInput = document.getElementById("propertyIdInput");
  propertyInput.readOnly = true;
  propertyInput.title = "Fixed mapping mode";
}

async function init() {
  state.allDates = makeDateSpan(150);
  setupDateRange();
  setFocusSite(state.focusSiteId);
  renderSiteList();
  wireEvents();
  renderDashboard();
  await refreshAllData();
  renderDashboard();
}

init();
