const SITES = [
  {
    id: "oydisplay",
    name: "OYDisplay",
    domain: "oydisplay.com",
    propertyId: "484489968",
    color: "#00d4ff"
  },
  {
    id: "ouyedisplay",
    name: "OUYEE Display",
    domain: "ouyedisplay.com",
    propertyId: "358897531",
    color: "#1dff9b"
  }
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
        source: "mock",
        loaded: false,
        dataByDate: {},
        channels: {},
        devices: {},
        topPages: [],
        error: null
      }
    ])
  ),
  charts: { trend: null, channel: null, device: null }
};

function pad(n) {
  return String(n).padStart(2, "0");
}

function formatDate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function parseDate(str) {
  return new Date(`${str}T00:00:00`);
}

function addDays(date, delta) {
  const d = new Date(date);
  d.setDate(d.getDate() + delta);
  return d;
}

function diffDays(start, end) {
  return Math.floor((end - start) / 86400000) + 1;
}

function seededRandom(seed) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function setStatus(msg, isError = false) {
  const el = document.getElementById("ga4Status");
  el.textContent = msg;
  el.style.color = isError ? "#ff7b72" : "#a8b8d8";
}

function makeDateSpan(days = 150) {
  const today = new Date();
  const arr = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    arr.push(formatDate(addDays(today, -i)));
  }
  return arr;
}

function generateMockForSite(siteId, days = 150) {
  const dates = makeDateSpan(days);
  const siteBias = siteId === "oydisplay" ? 1.0 : 0.25;
  const siteData = {};

  dates.forEach((dateStr, dayIdx) => {
    const seed = hash(`${siteId}-${dateStr}`);
    const r1 = seededRandom(seed);
    const r2 = seededRandom(seed + 13);
    const r3 = seededRandom(seed + 29);
    const weekly = 0.82 + Math.sin((dayIdx / 7) * Math.PI * 2) * 0.15;
    const trend = 0.94 + dayIdx / days / 4;
    const sessions = Math.max(30, Math.round(1200 * siteBias * weekly * trend * (0.82 + r1 * 0.42)));
    const users = Math.round(sessions * (0.68 + r2 * 0.14));
    const pageviews = Math.round(sessions * (1.8 + r3 * 0.9));
    const conversions = Math.round(sessions * (0.02 + r1 * 0.03));
    const bounceRate = 0.36 + r2 * 0.32;
    const avgDuration = 80 + Math.round(r3 * 180);
    const revenue = Math.round(conversions * (120 + r1 * 180));

    siteData[dateStr] = { sessions, users, pageviews, conversions, bounceRate, avgDuration, revenue };
  });

  return {
    dataByDate: siteData,
    channels: {
      "Organic Search": 4500 * siteBias,
      Direct: 2600 * siteBias,
      Referral: 1200 * siteBias,
      "Organic Social": 900 * siteBias,
      "Paid Search": 700 * siteBias
    },
    devices: {
      desktop: 4700 * siteBias,
      mobile: 5100 * siteBias,
      tablet: 300 * siteBias
    },
    topPages: [
      { path: "/", sessions: 2600 * siteBias, conversions: 68 * siteBias },
      { path: "/products", sessions: 1600 * siteBias, conversions: 43 * siteBias },
      { path: "/about-us", sessions: 740 * siteBias, conversions: 11 * siteBias }
    ],
    source: "mock"
  };
}

async function loadGa4Data(propertyId) {
  const endDate = new Date();
  const startDate = addDays(endDate, -149);
  const url = `/api/ga4/dashboard?propertyId=${encodeURIComponent(propertyId)}&startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}`;
  const res = await fetch(url);
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || "GA4 request failed");
  }
  const rows = payload.perDay || [];
  if (!rows.length) {
    throw new Error("GA4 returned empty rows");
  }

  const dataByDate = {};
  rows.forEach((row) => {
    dataByDate[row.date] = {
      sessions: Number(row.sessions) || 0,
      users: Number(row.users) || 0,
      pageviews: Number(row.pageviews) || 0,
      conversions: Number(row.conversions) || 0,
      bounceRate: Number(row.bounceRate) || 0,
      avgDuration: Number(row.avgDuration) || 0,
      revenue: Number(row.revenue) || 0
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

async function discoverProperties() {
  const res = await fetch("/api/ga4/discover");
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || "Discover failed");
  }
  return payload.properties || [];
}

async function loadSheetLeads() {
  const res = await fetch("/api/leads/sheet");
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || "Sheet leads request failed");
  }
  return payload.perSite || {};
}

function getFocusSite() {
  return SITES.find((s) => s.id === state.focusSiteId) || SITES[0];
}

function setFocusSite(siteId) {
  state.focusSiteId = siteId;
  localStorage.setItem("focus_site_id", siteId);
  const site = getFocusSite();
  document.getElementById("propertyIdInput").value = site.propertyId;
}

function setupDateRange() {
  const end = state.allDates[state.allDates.length - 1];
  const start = state.allDates[Math.max(0, state.allDates.length - 30)];
  document.getElementById("startDate").value = start;
  document.getElementById("endDate").value = end;
}

function renderSiteList() {
  const container = document.getElementById("siteList");
  container.innerHTML = "";
  SITES.forEach((site) => {
    const div = document.createElement("div");
    const isSelected = state.selectedSites.has(site.id);
    const isFocus = state.focusSiteId === site.id;
    div.className = `site-item ${isSelected ? "active" : ""} ${isFocus ? "focused" : ""}`;
    div.innerHTML = `
      <div>
        <strong>${site.name}</strong>
        <div class="site-domain">${site.domain}</div>
        <div class="site-domain">GA4 Property: ${site.propertyId}</div>
      </div>
      <span class="site-dot" style="background:${site.color};"></span>
    `;

    div.addEventListener("click", () => {
      if (state.selectedSites.has(site.id) && state.selectedSites.size > 1) {
        state.selectedSites.delete(site.id);
      } else {
        state.selectedSites.add(site.id);
      }
      setFocusSite(site.id);
      renderSiteList();
      renderDashboard();
    });
    container.appendChild(div);
  });
}

function getRangeDates() {
  const start = parseDate(document.getElementById("startDate").value);
  const end = parseDate(document.getElementById("endDate").value);
  return state.allDates.filter((d) => {
    const day = parseDate(d);
    return day >= start && day <= end;
  });
}

function aggregateMetrics(siteIds, dates) {
  const total = {
    sessions: 0,
    users: 0,
    pageviews: 0,
    conversions: 0,
    revenue: 0,
    avgDurationWeighted: 0,
    bounceWeighted: 0,
    channels: Object.fromEntries(CHANNEL_KEYS.map((k) => [k, 0])),
    devices: Object.fromEntries(DEVICE_KEYS.map((k) => [k, 0])),
    topPages: {},
    trendBySite: {},
    leads: 0
  };

  siteIds.forEach((siteId) => {
    const item = state.store[siteId];
    total.trendBySite[siteId] = [];
    dates.forEach((date) => {
      const day = item.dataByDate[date];
      if (!day) {
        total.trendBySite[siteId].push(0);
        return;
      }
      total.sessions += day.sessions;
      total.users += day.users;
      total.pageviews += day.pageviews;
      total.conversions += day.conversions;
      total.revenue += day.revenue;
      total.avgDurationWeighted += day.avgDuration * day.sessions;
      total.bounceWeighted += day.bounceRate * day.sessions;
      total.trendBySite[siteId].push(day.sessions);
    });

    const leadsDaily = state.store[siteId].leadsDaily || {};
    dates.forEach((d) => {
      total.leads += Number(leadsDaily[d] || 0);
    });

    CHANNEL_KEYS.forEach((k) => {
      total.channels[k] += Number(item.channels[k] || 0);
    });
    DEVICE_KEYS.forEach((k) => {
      total.devices[k] += Number(item.devices[k] || 0);
    });
    (item.topPages || []).forEach((p) => {
      const pageKey = `${siteId}__${p.path}`;
      if (!total.topPages[pageKey]) {
        total.topPages[pageKey] = { siteId, path: p.path, sessions: 0, conversions: 0 };
      }
      total.topPages[pageKey].sessions += Number(p.sessions || 0);
      total.topPages[pageKey].conversions += Number(p.conversions || 0);
    });
  });

  total.avgDuration = total.sessions ? total.avgDurationWeighted / total.sessions : 0;
  total.bounceRate = total.sessions ? total.bounceWeighted / total.sessions : 0;
  total.conversionRate = total.sessions ? total.conversions / total.sessions : 0;
  total.leadRate = total.sessions ? total.leads / total.sessions : 0;
  total.topPages = Object.values(total.topPages).sort((a, b) => b.sessions - a.sessions).slice(0, 12);
  return total;
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

function formatNum(num) {
  return new Intl.NumberFormat("zh-CN").format(Math.round(num));
}

function formatPercent(value, digits = 2) {
  return `${(value * 100).toFixed(digits)}%`;
}

function formatDuration(sec) {
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}m ${s}s`;
}

function formatDelta(current, previous, inverse = false) {
  if (!previous) return { text: "No baseline", cls: "" };
  const raw = ((current - previous) / previous) * 100;
  const adjusted = inverse ? -raw : raw;
  const cls = adjusted >= 0 ? "up" : "down";
  const prefix = adjusted >= 0 ? "+" : "";
  return { text: `${prefix}${adjusted.toFixed(1)}% vs previous`, cls };
}

function renderKpis(current, previous) {
  const items = [
    { name: "Sessions", value: formatNum(current.sessions), delta: formatDelta(current.sessions, previous.sessions) },
    { name: "Users", value: formatNum(current.users), delta: formatDelta(current.users, previous.users) },
    { name: "Leads (Sheet)", value: formatNum(current.leads), delta: formatDelta(current.leads, previous.leads) },
    { name: "Lead Rate", value: formatPercent(current.leadRate), delta: formatDelta(current.leadRate, previous.leadRate) },
    { name: "Bounce Rate", value: formatPercent(current.bounceRate), delta: formatDelta(current.bounceRate, previous.bounceRate, true) },
    { name: "Avg. Duration", value: formatDuration(current.avgDuration), delta: formatDelta(current.avgDuration, previous.avgDuration) },
    { name: "Revenue (GA4)", value: `¥${formatNum(current.revenue)}`, delta: formatDelta(current.revenue, previous.revenue) }
  ];

  document.getElementById("kpiGrid").innerHTML = items
    .map(
      (kpi) => `
      <article class="panel kpi-card">
        <p class="kpi-name">${kpi.name}</p>
        <div class="kpi-value">${kpi.value}</div>
        <div class="kpi-delta ${kpi.delta.cls || ""}">${kpi.delta.text}</div>
      </article>`
    )
    .join("");
}

function upsertChart(chartKey, config) {
  if (state.charts[chartKey]) state.charts[chartKey].destroy();
  const ctx =
    chartKey === "trend"
      ? document.getElementById("trendChart")
      : chartKey === "channel"
      ? document.getElementById("channelChart")
      : document.getElementById("deviceChart");
  state.charts[chartKey] = new Chart(ctx, config);
}

function renderTrendChart(dates, current, selectedIds) {
  const datasets = selectedIds.map((siteId) => {
    const site = SITES.find((s) => s.id === siteId);
    return {
      label: `${site.name} (${site.domain})`,
      data: current.trendBySite[siteId],
      borderColor: site.color,
      backgroundColor: `${site.color}55`,
      fill: false,
      tension: 0.35,
      pointRadius: 0,
      borderWidth: 2
    };
  });

  upsertChart("trend", {
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
  });
}

function renderChannelChart(current) {
  upsertChart("channel", {
    type: "bar",
    data: {
      labels: CHANNEL_KEYS,
      datasets: [
        {
          label: "Sessions",
          data: CHANNEL_KEYS.map((k) => current.channels[k] || 0),
          backgroundColor: ["#00d4ff", "#1dff9b", "#ffd166", "#ff7b72", "#7aa2ff"]
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { color: "#9fb3d1" }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { ticks: { color: "#9fb3d1" }, grid: { color: "rgba(255,255,255,0.04)" } }
      }
    }
  });
}

function renderDeviceChart(current) {
  upsertChart("device", {
    type: "doughnut",
    data: {
      labels: DEVICE_KEYS.map((d) => d[0].toUpperCase() + d.slice(1)),
      datasets: [
        {
          data: DEVICE_KEYS.map((k) => current.devices[k] || 0),
          backgroundColor: ["#00d4ff", "#1dff9b", "#ffd166"],
          borderWidth: 0
        }
      ]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#dce7ff" } } } }
  });
}

function renderTopPages(current) {
  const tbody = document.getElementById("topPageTable");
  tbody.innerHTML = current.topPages
    .map((item) => {
      const site = SITES.find((s) => s.id === item.siteId);
      return `<tr><td>${site.domain}</td><td>${item.path}</td><td>${formatNum(item.sessions)}</td><td>${formatNum(item.conversions)}</td></tr>`;
    })
    .join("");
}

function renderAlerts(dates, selectedIds) {
  const alerts = [];
  const latestDate = dates[dates.length - 1];
  const prevDate = dates[dates.length - 2];

  selectedIds.forEach((siteId) => {
    const site = SITES.find((s) => s.id === siteId);
    const item = state.store[siteId];
    const latest = item.dataByDate[latestDate];
    const prev = item.dataByDate[prevDate];

    if (latest?.bounceRate > 0.66) {
      alerts.push(`${site.domain} high bounce: ${formatPercent(latest.bounceRate, 1)}`);
    }
    if (latest && prev && prev.sessions > 0) {
      const drop = ((latest.sessions - prev.sessions) / prev.sessions) * 100;
      if (drop <= -18) {
        alerts.push(`${site.domain} sessions dropped ${drop.toFixed(1)}% day-over-day`);
      }
    }
  });

  if (!alerts.length) {
    alerts.push("No high-risk alert in current range.");
  }
  document.getElementById("alertList").innerHTML = alerts.map((a) => `<li>${a}</li>`).join("");
}

function renderHeader(selectedIds, dates) {
  document.getElementById("selectedSummary").textContent = `${selectedIds.length} sites`;
  document.getElementById("rangeSummary").textContent = `${dates[0] || "-"} to ${dates[dates.length - 1] || "-"}`;
}

function renderDashboard() {
  const selectedIds = Array.from(state.selectedSites);
  const dates = getRangeDates();
  const previousDates = pickPreviousDates(dates);
  const current = aggregateMetrics(selectedIds, dates);
  const previous = aggregateMetrics(selectedIds, previousDates);

  renderHeader(selectedIds, dates);
  renderKpis(current, previous);
  renderTrendChart(dates, current, selectedIds);
  renderChannelChart(current);
  renderDeviceChart(current);
  renderTopPages(current);
  renderAlerts(dates, selectedIds);
}

async function connectSite(site) {
  try {
    const loaded = await loadGa4Data(site.propertyId);
    state.store[site.id] = { ...state.store[site.id], ...loaded, loaded: true, error: null };
    return { ok: true, siteId: site.id };
  } catch (err) {
    const fallback = generateMockForSite(site.id, 150);
    state.store[site.id] = { ...state.store[site.id], ...fallback, loaded: true, error: err.message };
    return { ok: false, siteId: site.id, error: err.message };
  }
}

async function connectSelectedSites() {
  setStatus("Connecting fixed GA4 properties...");
  const sitesToConnect = SITES.filter((s) => state.selectedSites.has(s.id));
  const results = await Promise.all(sitesToConnect.map((s) => connectSite(s)));
  const fails = results.filter((r) => !r.ok);
  if (fails.length) {
    setStatus(`Connected ${results.length - fails.length}/${results.length}. Fallback mock used for failed sites.`, true);
  } else {
    setStatus(`Connected ${results.length} sites with fixed GA4 IDs.`);
  }

  // Sheet leads are optional; if unavailable, keep leads as 0.
  try {
    const leads = await loadSheetLeads();
    Object.keys(leads || {}).forEach((siteId) => {
      if (!state.store[siteId]) return;
      state.store[siteId].leadsDaily = leads[siteId]?.daily || {};
      state.store[siteId].leadsTotal = Number(leads[siteId]?.total || 0);
    });
    setStatus(`Connected ${results.length} sites + Sheet leads sync.`);
  } catch (err) {
    setStatus(`GA4 ok, Sheet leads not connected: ${err.message}`, true);
  }
}

async function checkFixedMapping() {
  setStatus("Checking GA4 discover list...");
  try {
    const discovered = await discoverProperties();
    const ids = new Set(discovered.map((p) => String(p.propertyId)));
    const missing = SITES.filter((s) => !ids.has(s.propertyId));
    if (!missing.length) {
      setStatus("Mapping check passed: both fixed property IDs are visible.");
    } else {
      setStatus(`Mapping warning: missing in discover -> ${missing.map((m) => m.propertyId).join(", ")}`, true);
    }
  } catch (err) {
    setStatus(`Discover failed: ${err.message}`, true);
  }
}

function setupEvents() {
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
    await connectSelectedSites();
    renderDashboard();
  });

  document.getElementById("refreshGa4Btn").addEventListener("click", async () => {
    await connectSelectedSites();
    renderDashboard();
  });

  document.getElementById("discoverGa4Btn").addEventListener("click", async () => {
    await checkFixedMapping();
  });

  const propertyInput = document.getElementById("propertyIdInput");
  propertyInput.readOnly = true;
  propertyInput.title = "Fixed mapping mode. Property ID is bound to selected site.";
}

async function init() {
  state.allDates = makeDateSpan(150);
  setupDateRange();
  setFocusSite(state.focusSiteId);
  renderSiteList();
  setupEvents();

  // Default fallback data first to keep UI responsive.
  SITES.forEach((site) => {
    const fallback = generateMockForSite(site.id, 150);
    state.store[site.id] = { ...state.store[site.id], ...fallback, loaded: true };
  });
  renderDashboard();

  // Then replace with real GA4 for selected sites.
  await connectSelectedSites();
  renderSiteList();
  renderDashboard();
}

init();
