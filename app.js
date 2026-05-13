const SITES = [{ id: "oydisplay", name: "OYDisplay 主站", domain: "oydisplay.com", color: "#00d4ff" }];
const CHANNEL_KEYS = ["Organic Search", "Direct", "Referral", "Organic Social", "Paid Search"];
const DEVICE_KEYS = ["desktop", "mobile", "tablet"];

const state = {
  selectedSites: new Set(SITES.map((s) => s.id)),
  data: {},
  allDates: [],
  source: "mock",
  propertyId: localStorage.getItem("ga4_property_id") || "484489968",
  ga4Channels: null,
  ga4Devices: null,
  ga4TopPages: null,
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

function generateMockData(days = 150) {
  const today = new Date();
  const allDates = [];
  for (let i = days - 1; i >= 0; i -= 1) allDates.push(formatDate(addDays(today, -i)));

  const data = { oydisplay: {} };
  allDates.forEach((dateStr, dayIdx) => {
    const seed = hash(`oydisplay-${dateStr}`);
    const r1 = seededRandom(seed);
    const r2 = seededRandom(seed + 13);
    const r3 = seededRandom(seed + 29);
    const weekly = 0.82 + Math.sin((dayIdx / 7) * Math.PI * 2) * 0.15;
    const trend = 0.94 + dayIdx / days / 4;
    const sessions = Math.max(60, Math.round(1200 * weekly * trend * (0.82 + r1 * 0.42)));
    const users = Math.round(sessions * (0.68 + r2 * 0.14));
    const pageviews = Math.round(sessions * (1.8 + r3 * 0.9));
    const conversions = Math.round(sessions * (0.02 + r1 * 0.03));
    const bounceRate = 0.36 + r2 * 0.32;
    const avgDuration = 80 + Math.round(r3 * 180);
    const revenue = Math.round(conversions * (120 + r1 * 180));

    const channels = {
      "Organic Search": Math.round(sessions * (0.35 + r1 * 0.08)),
      Direct: Math.round(sessions * (0.22 + r2 * 0.06)),
      Referral: Math.round(sessions * (0.14 + r3 * 0.06)),
      "Organic Social": Math.round(sessions * (0.12 + r1 * 0.04)),
      "Paid Search": Math.round(sessions * (0.1 + r2 * 0.05))
    };

    const devices = {
      desktop: Math.round(sessions * (0.42 + r2 * 0.15)),
      mobile: Math.round(sessions * (0.5 + r1 * 0.12)),
      tablet: Math.round(sessions * (0.05 + r3 * 0.04))
    };

    const topPages = [
      "/", "/products", "/about-us", "/contact-us", "/blog", "/product-display-rack"
    ].map((path, idx) => {
      const w = 0.6 / (idx + 1) + seededRandom(seed + idx + 200) * 0.09;
      const s = Math.max(8, Math.round(w * sessions * (0.4 + r2 * 0.55)));
      return { path, sessions: s, conversions: Math.round(s * (0.01 + seededRandom(seed + idx + 300) * 0.05)) };
    });

    data.oydisplay[dateStr] = {
      sessions,
      users,
      pageviews,
      conversions,
      bounceRate,
      avgDuration,
      revenue,
      channels,
      devices,
      topPages
    };
  });

  state.ga4Channels = null;
  state.ga4Devices = null;
  state.ga4TopPages = null;
  return { data, allDates };
}

async function loadGa4Data(propertyId) {
  const endDate = new Date();
  const startDate = addDays(endDate, -149);
  const url =
    `/api/ga4/dashboard?propertyId=${encodeURIComponent(propertyId)}&startDate=${formatDate(startDate)}&endDate=${formatDate(endDate)}`;
  const res = await fetch(url);
  const payload = await res.json();
  if (!res.ok) {
    throw new Error(payload.error || "GA4 请求失败");
  }

  const rows = payload.perDay || [];
  if (!rows.length) {
    throw new Error("GA4 返回空数据");
  }

  const data = { oydisplay: {} };
  rows.forEach((row) => {
    data.oydisplay[row.date] = {
      sessions: row.sessions,
      users: row.users,
      pageviews: row.pageviews,
      conversions: row.conversions,
      bounceRate: row.bounceRate,
      avgDuration: row.avgDuration,
      revenue: row.revenue,
      channels: {},
      devices: {},
      topPages: []
    };
  });

  state.ga4Channels = payload.channels || {};
  state.ga4Devices = payload.devices || {};
  state.ga4TopPages = payload.topPages || [];
  return { data, allDates: rows.map((r) => r.date) };
}

async function discoverPropertyId() {
  const res = await fetch("/api/ga4/discover");
  const payload = await res.json();
  if (!res.ok) throw new Error(payload.error || "Property 自动识别失败");
  const list = payload.properties || [];
  if (!list.length) throw new Error("未发现可访问的 GA4 Property");
  const matched =
    list.find((p) => /oydisplay|ouyee|display/i.test(`${p.propertyName} ${p.account || ""}`)) || list[0];
  return { picked: matched, all: list };
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
    div.className = `site-item ${state.selectedSites.has(site.id) ? "active" : ""}`;
    div.innerHTML = `
      <div>
        <strong>${site.name}</strong>
        <div class="site-domain">${site.domain}</div>
      </div>
      <span class="site-dot" style="background:${site.color};"></span>
    `;
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
    trendBySite: {}
  };

  siteIds.forEach((siteId) => {
    total.trendBySite[siteId] = [];
    dates.forEach((date) => {
      const day = state.data[siteId][date];
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
      CHANNEL_KEYS.forEach((key) => {
        total.channels[key] += day.channels?.[key] || 0;
      });
      DEVICE_KEYS.forEach((key) => {
        total.devices[key] += day.devices?.[key] || 0;
      });
      (day.topPages || []).forEach((page) => {
        const pageKey = `${siteId}__${page.path}`;
        if (!total.topPages[pageKey]) total.topPages[pageKey] = { siteId, path: page.path, sessions: 0, conversions: 0 };
        total.topPages[pageKey].sessions += page.sessions;
        total.topPages[pageKey].conversions += page.conversions;
      });
      total.trendBySite[siteId].push(day.sessions);
    });
  });

  total.avgDuration = total.sessions ? total.avgDurationWeighted / total.sessions : 0;
  total.bounceRate = total.sessions ? total.bounceWeighted / total.sessions : 0;
  total.conversionRate = total.sessions ? total.conversions / total.sessions : 0;
  total.topPages = Object.values(total.topPages).sort((a, b) => b.sessions - a.sessions).slice(0, 12);
  return total;
}

function pickPreviousDates(currentDates) {
  if (currentDates.length === 0) return [];
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
  if (!previous) return { text: "无对比基线", cls: "" };
  const raw = ((current - previous) / previous) * 100;
  const adjusted = inverse ? -raw : raw;
  const cls = adjusted >= 0 ? "up" : "down";
  const prefix = adjusted >= 0 ? "+" : "";
  return { text: `${prefix}${adjusted.toFixed(1)}% vs 上期`, cls };
}

function renderKpis(current, previous) {
  const items = [
    { name: "Sessions", value: formatNum(current.sessions), delta: formatDelta(current.sessions, previous.sessions) },
    { name: "Users", value: formatNum(current.users), delta: formatDelta(current.users, previous.users) },
    { name: "Conversion Rate", value: formatPercent(current.conversionRate), delta: formatDelta(current.conversionRate, previous.conversionRate) },
    { name: "Bounce Rate", value: formatPercent(current.bounceRate), delta: formatDelta(current.bounceRate, previous.bounceRate, true) },
    { name: "Avg. Duration", value: formatDuration(current.avgDuration), delta: formatDelta(current.avgDuration, previous.avgDuration) },
    { name: "Revenue", value: `¥${formatNum(current.revenue)}`, delta: formatDelta(current.revenue, previous.revenue) }
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
      label: site.name,
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
  const sourceData = state.source === "ga4" && state.ga4Channels ? state.ga4Channels : current.channels;
  upsertChart("channel", {
    type: "bar",
    data: {
      labels: CHANNEL_KEYS,
      datasets: [{ label: "Sessions", data: CHANNEL_KEYS.map((k) => sourceData[k] || 0), backgroundColor: ["#00d4ff", "#1dff9b", "#ffd166", "#ff7b72", "#7aa2ff"] }]
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
  const sourceData = state.source === "ga4" && state.ga4Devices ? state.ga4Devices : current.devices;
  upsertChart("device", {
    type: "doughnut",
    data: {
      labels: DEVICE_KEYS.map((d) => d[0].toUpperCase() + d.slice(1)),
      datasets: [{ data: DEVICE_KEYS.map((k) => sourceData[k] || 0), backgroundColor: ["#00d4ff", "#1dff9b", "#ffd166"], borderWidth: 0 }]
    },
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { labels: { color: "#dce7ff" } } } }
  });
}

function renderTopPages(current) {
  const top = state.source === "ga4" && state.ga4TopPages ? state.ga4TopPages : current.topPages;
  const tbody = document.getElementById("topPageTable");
  tbody.innerHTML = top
    .map((item) => {
      const site = SITES[0];
      return `<tr><td>${site.name}</td><td>${item.path}</td><td>${formatNum(item.sessions)}</td><td>${formatNum(item.conversions)}</td></tr>`;
    })
    .join("");
}

function renderAlerts(dates) {
  const alerts = [];
  const site = SITES[0];
  const latestDate = dates[dates.length - 1];
  const prevDate = dates[dates.length - 2];
  const latest = state.data.oydisplay?.[latestDate];
  const prev = state.data.oydisplay?.[prevDate];

  if (latest?.bounceRate > 0.66) alerts.push(`${site.name} 跳出率偏高 (${formatPercent(latest.bounceRate, 1)})`);
  if (latest && prev && prev.sessions > 0) {
    const drop = ((latest.sessions - prev.sessions) / prev.sessions) * 100;
    if (drop <= -18) alerts.push(`${site.name} 单日流量下降 ${drop.toFixed(1)}%，建议排查投放/SEO`);
  }
  if (!alerts.length) alerts.push("当前无高风险预警，关键指标在可控范围。");

  document.getElementById("alertList").innerHTML = alerts.map((a) => `<li>${a}</li>`).join("");
}

function renderHeader(selectedIds, dates) {
  document.getElementById("selectedSummary").textContent = `${selectedIds.length} 个站点`;
  document.getElementById("rangeSummary").textContent = `${dates[0] || "-"} 至 ${dates[dates.length - 1] || "-"}`;
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
  renderAlerts(dates);
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
    const propertyId = document.getElementById("propertyIdInput").value.trim();
    if (!/^\d+$/.test(propertyId)) {
      setStatus("Property ID 格式不正确（应为纯数字）", true);
      return;
    }
    await connectGa4(propertyId);
  });

  document.getElementById("refreshGa4Btn").addEventListener("click", async () => {
    if (!state.propertyId) {
      setStatus("请先输入并连接 Property ID", true);
      return;
    }
    await connectGa4(state.propertyId);
  });

  document.getElementById("discoverGa4Btn").addEventListener("click", async () => {
    setStatus("正在自动识别 Property...");
    try {
      const { picked, all } = await discoverPropertyId();
      document.getElementById("propertyIdInput").value = picked.propertyId;
      setStatus(`已识别到 ${all.length} 个 Property，已选：${picked.propertyName} (${picked.propertyId})`);
    } catch (err) {
      setStatus(`自动识别失败：${err.message}`, true);
    }
  });
}

async function connectGa4(propertyId) {
  setStatus("GA4 连接中...");
  try {
    const loaded = await loadGa4Data(propertyId);
    state.data = loaded.data;
    state.allDates = loaded.allDates;
    state.source = "ga4";
    state.propertyId = propertyId;
    localStorage.setItem("ga4_property_id", propertyId);
    setupDateRange();
    renderDashboard();
    setStatus(`GA4 已连接：Property ${propertyId}（真实数据）`);
  } catch (err) {
    setStatus(`GA4 连接失败：${err.message}，已回退模拟数据`, true);
    const mock = generateMockData(150);
    state.data = mock.data;
    state.allDates = mock.allDates;
    state.source = "mock";
    setupDateRange();
    renderDashboard();
  }
}

async function init() {
  document.getElementById("propertyIdInput").value = state.propertyId;
  renderSiteList();
  setupEvents();

  if (state.propertyId) {
    await connectGa4(state.propertyId);
    return;
  }

  const mock = generateMockData(150);
  state.data = mock.data;
  state.allDates = mock.allDates;
  state.source = "mock";
  setupDateRange();
  renderDashboard();
  setStatus("未配置 Property ID，当前为模拟数据");
}

init();
