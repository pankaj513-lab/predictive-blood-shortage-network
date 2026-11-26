/**
 * PBSN — Complete Multi-Page Interactive Application Controller
 */
(function (global) {
  "use strict";

  const { BLOOD_GROUPS, CITIES, INITIAL_BANKS, INITIAL_DONORS, INITIAL_REQUESTS } = global.PBSN_DATA;
  const { evaluateDashboard, generateInsightsAndTransfers, predictWithOptionalBackend } = global.PBSN_ENGINE;

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function loadStored(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : structuredClone(fallback);
    } catch (_) {
      return structuredClone(fallback);
    }
  }

  function loadBanksWithNewDefaults() {
    const stored = loadStored("pbsn_banks", INITIAL_BANKS);
    const seen = new Set(stored.map((b) => b.id));
    INITIAL_BANKS.forEach((ib) => {
      if (!seen.has(ib.id)) stored.push(structuredClone(ib));
    });
    return stored;
  }

  const state = {
    banks: loadBanksWithNewDefaults(),
    donors: loadStored("pbsn_donors", INITIAL_DONORS),
    requests: loadStored("pbsn_requests", INITIAL_REQUESTS),
    inquiries: loadStored("pbsn_inquiries", []),
    filters: {
      group: "ALL",
      region: "ALL",
      hospitalId: "ALL",
      days: 7,
      seasonKey: "normal"
    },
    trendMode: "weekly",
    searchQuery: "",
    sortBy: "units_desc",
    selectedBankId: "aiims-delhi"
  };

  function saveState() {
    try {
      localStorage.setItem("pbsn_banks", JSON.stringify(state.banks));
      localStorage.setItem("pbsn_donors", JSON.stringify(state.donors));
      localStorage.setItem("pbsn_requests", JSON.stringify(state.requests));
      localStorage.setItem("pbsn_inquiries", JSON.stringify(state.inquiries));
    } catch (_) {}
  }

  async function postInquiry(endpoint, payload) {
    const isLocalHost =
      window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
    if (isLocalHost) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 900);
        const res = await fetch(`http://localhost:8000${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timer);
        if (res.ok) return { storedIn: "FastAPI Backend" };
      } catch (_) {
        // Backend offline — seamlessly persist in demo localStorage store
      }
    }
    return { storedIn: "Demo Data Store" };
  }

  function badgeClass(risk) {
    if (risk === "Critical Risk") return "badge-critical";
    if (risk === "High Risk") return "badge-high";
    if (risk === "Moderate Risk") return "badge-moderate";
    return "badge-low";
  }

  function barColor(risk) {
    if (risk === "Critical Risk") return "#e63946";
    if (risk === "High Risk") return "#ff6b35";
    if (risk === "Moderate Risk") return "#f5a623";
    return "#2ec4b6";
  }

  // ── Landing Page Live Demo Preview ───────────────────────────────────────
  function renderLandingPreview(evalRes) {
    const unitsEl = document.getElementById("prev-units");
    if (!unitsEl) return;
    unitsEl.textContent = evalRes.totalUnits.toLocaleString();
    document.getElementById("prev-hospitals").textContent = `${state.banks.length} Real Hubs`;
    document.getElementById("prev-alerts").textContent = String(evalRes.alerts.length);
  }

  // ── Dashboard Charts & Widgets ───────────────────────────────────────────
  function renderForecastSvg(evalRes) {
    const svg = document.getElementById("forecast-svg");
    if (!svg) return;
    const ns = "http://www.w3.org/2000/svg";
    svg.innerHTML = "";

    const W = 680;
    const H = 220;
    const pad = { top: 20, right: 20, bottom: 30, left: 48 };
    const pts = evalRes.series;
    const maxVal = Math.max(evalRes.safetyTotal * 1.2, ...pts.map((p) => p.inventory));
    const xFor = (i) => pad.left + (i / Math.max(1, pts.length - 1)) * (W - pad.left - pad.right);
    const yFor = (v) => H - pad.bottom - (v / Math.max(1, maxVal)) * (H - pad.top - pad.bottom);

    // Safety Buffer dashed line
    const sy = yFor(evalRes.safetyTotal);
    const safeLine = document.createElementNS(ns, "line");
    safeLine.setAttribute("x1", String(pad.left));
    safeLine.setAttribute("y1", String(sy));
    safeLine.setAttribute("x2", String(W - pad.right));
    safeLine.setAttribute("y2", String(sy));
    safeLine.setAttribute("stroke", "rgba(230,57,70,0.65)");
    safeLine.setAttribute("stroke-dasharray", "5 5");
    svg.appendChild(safeLine);

    const safeTxt = document.createElementNS(ns, "text");
    safeTxt.setAttribute("x", String(W - pad.right));
    safeTxt.setAttribute("y", String(sy - 6));
    safeTxt.setAttribute("text-anchor", "end");
    safeTxt.setAttribute("fill", "#ff6b76");
    safeTxt.setAttribute("font-family", "monospace");
    safeTxt.setAttribute("font-size", "10");
    safeTxt.textContent = `SAFETY THRESHOLD (${evalRes.safetyTotal}u)`;
    svg.appendChild(safeTxt);

    const todayIdx = pts.findIndex((p) => p.label === "Today");
    if (todayIdx >= 0) {
      const div = document.createElementNS(ns, "line");
      div.setAttribute("x1", String(xFor(todayIdx)));
      div.setAttribute("y1", String(pad.top));
      div.setAttribute("x2", String(xFor(todayIdx)));
      div.setAttribute("y2", String(H - pad.bottom));
      div.setAttribute("stroke", "rgba(128,128,128,0.35)");
      svg.appendChild(div);
    }

    const buildD = (arr, offset) =>
      arr.map((p, i) => `${i === 0 ? "M" : "L"} ${xFor(i + offset).toFixed(1)} ${yFor(p.inventory).toFixed(1)}`).join(" ");

    const histPath = document.createElementNS(ns, "path");
    histPath.setAttribute("d", buildD(pts.slice(0, todayIdx + 1), 0));
    histPath.setAttribute("fill", "none");
    histPath.setAttribute("stroke", "#4ea8de");
    histPath.setAttribute("stroke-width", "2.4");
    svg.appendChild(histPath);

    const forePath = document.createElementNS(ns, "path");
    forePath.setAttribute("d", buildD(pts.slice(todayIdx), todayIdx));
    forePath.setAttribute("fill", "none");
    forePath.setAttribute("stroke", "#e63946");
    forePath.setAttribute("stroke-width", "2.5");
    forePath.setAttribute("stroke-dasharray", "6 4");
    svg.appendChild(forePath);

    pts.forEach((p, idx) => {
      if (idx === 0 || idx === todayIdx || idx === pts.length - 1 || idx % 3 === 0) {
        const lbl = document.createElementNS(ns, "text");
        lbl.setAttribute("x", String(xFor(idx)));
        lbl.setAttribute("y", String(H - 9));
        lbl.setAttribute("text-anchor", "middle");
        lbl.setAttribute("fill", p.isForecast ? "#ff6b76" : "#94a3b8");
        lbl.setAttribute("font-family", "monospace");
        lbl.setAttribute("font-size", "10");
        lbl.textContent = p.label;
        svg.appendChild(lbl);
      }
    });

    [maxVal, Math.round(maxVal / 2), 0].forEach((v) => {
      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", String(pad.left - 8));
      t.setAttribute("y", String(yFor(v) + 4));
      t.setAttribute("text-anchor", "end");
      t.setAttribute("fill", "#94a3b8");
      t.setAttribute("font-family", "monospace");
      t.setAttribute("font-size", "10");
      t.textContent = String(Math.round(v));
      svg.appendChild(t);
    });
  }

  function renderTrendSvg(evalRes) {
    const svg = document.getElementById("trend-svg");
    if (!svg) return;
    const ns = "http://www.w3.org/2000/svg";
    svg.innerHTML = "";

    const labels =
      state.trendMode === "weekly"
        ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
        : ["Wk 1", "Wk 2", "Wk 3", "Wk 4"];
    const base = Math.max(12, evalRes.totalDailyDemand * (state.trendMode === "weekly" ? 1 : 7));
    const vals = labels.map((_, i) => Math.round(base * (0.86 + Math.sin(i * 1.1) * 0.14 + i * 0.03)));
    const maxV = Math.max(...vals) * 1.15;

    const W = 520;
    const H = 190;
    const barW = state.trendMode === "weekly" ? 38 : 68;
    const gap = (W - 60) / labels.length;

    vals.forEach((v, i) => {
      const h = (v / maxV) * (H - 50);
      const x = 38 + i * gap + (gap - barW) / 2;
      const y = H - 28 - h;
      const rect = document.createElementNS(ns, "rect");
      rect.setAttribute("x", String(x));
      rect.setAttribute("y", String(y));
      rect.setAttribute("width", String(barW));
      rect.setAttribute("height", String(h));
      rect.setAttribute("rx", "4");
      rect.setAttribute("fill", i === vals.length - 1 ? "#e63946" : "#4ea8de");
      svg.appendChild(rect);

      const t = document.createElementNS(ns, "text");
      t.setAttribute("x", String(x + barW / 2));
      t.setAttribute("y", String(H - 10));
      t.setAttribute("text-anchor", "middle");
      t.setAttribute("fill", "#94a3b8");
      t.setAttribute("font-family", "monospace");
      t.setAttribute("font-size", "10");
      t.textContent = labels[i];
      svg.appendChild(t);

      const vt = document.createElementNS(ns, "text");
      vt.setAttribute("x", String(x + barW / 2));
      vt.setAttribute("y", String(y - 5));
      vt.setAttribute("text-anchor", "middle");
      vt.setAttribute("fill", "#cbd5e1");
      vt.setAttribute("font-family", "monospace");
      vt.setAttribute("font-size", "10");
      vt.textContent = `${v}u`;
      svg.appendChild(vt);
    });
  }

  function renderDashboardPage(evalRes, insightsPack) {
    const kpiUnits = document.getElementById("kpi-units");
    if (!kpiUnits) return;

    kpiUnits.textContent = evalRes.totalUnits.toLocaleString();
    document.getElementById("kpi-demand").textContent = `${evalRes.totalDailyDemand} u/d`;
    document.getElementById("kpi-alerts").textContent = String(evalRes.alerts.length);
    document.getElementById("kpi-banks").textContent = `${evalRes.bankSummaries.length} Hubs`;

    renderForecastSvg(evalRes);
    renderTrendSvg(evalRes);

    // Blood Group Availability Progress Bars
    const bgContainer = document.getElementById("bg-availability-bars");
    if (bgContainer) {
      const maxG = Math.max(100, ...evalRes.groupTotals.map((g) => g.units));
      bgContainer.innerHTML = evalRes.groupTotals
        .map(
          (g) => `
        <div>
          <div class="bg-bar-head">
            <span><strong>${g.group}</strong> · ${g.demand} u/day</span>
            <span>${g.units} units <span class="badge ${badgeClass(g.risk)}" style="margin-left:6px;">${g.risk}</span></span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${Math.min(100, Math.round((g.units / maxG) * 100))}%;background:${barColor(g.risk)};"></div>
          </div>
        </div>`
        )
        .join("");
    }

    // Hospital Demand Comparison + Regional Inventory
    const hospComp = document.getElementById("hospital-comparison-list");
    if (hospComp) {
      const maxD = Math.max(20, ...evalRes.bankSummaries.map((b) => b.totalDemand));
      hospComp.innerHTML = evalRes.bankSummaries
        .map(
          (b) => `
        <div>
          <div class="bg-bar-head">
            <span><strong>${b.bank.name}</strong> (${b.bank.city})</span>
            <span>${b.totalUnits}u stock · ${Math.round(b.totalDemand)}u/d</span>
          </div>
          <div class="progress-track">
            <div class="progress-fill" style="width:${Math.min(100, Math.round((b.totalDemand / maxD) * 100))}%;background:${barColor(b.status)};"></div>
          </div>
        </div>`
        )
        .join("");
    }

    // Critical Shortage Alerts
    const alertList = document.getElementById("dashboard-alerts-list");
    if (alertList) {
      alertList.innerHTML =
        evalRes.alerts.length === 0
          ? `<div class="eyebrow-mono">No critical or high-risk shortages for current filter.</div>`
          : evalRes.alerts
              .slice(0, 6)
              .map(
                (a) => `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:8px;border:1px solid var(--line);margin-bottom:8px;">
            <div>
              <span class="badge ${badgeClass(a.risk)}">${a.risk}</span>
              <strong style="margin-left:8px;font-size:0.88rem;">${a.group} at ${a.bankName} (${a.city})</strong>
              <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">${a.units}u left · ${a.daysCover}d cover · ${a.adjDailyUse}u/day burn</div>
            </div>
            <a href="./network.html" class="btn btn-ghost btn-sm">Match →</a>
          </div>`
              )
              .join("");
    }

    // AI Insights Section (Section G)
    const insightsGrid = document.getElementById("ai-insights-grid");
    if (insightsGrid) {
      insightsGrid.innerHTML = insightsPack.insights
        .map(
          (ins) => `
        <div class="panel" style="gap:8px;">
          <div class="panel-head">
            <span class="eyebrow-mono">${ins.tag}</span>
            <span class="badge ${badgeClass(ins.severity)}">${ins.severity}</span>
          </div>
          <strong style="font-family:var(--font-display);font-size:1.02rem;">${ins.title}</strong>
          <p class="lead-lg" style="font-size:0.85rem;">${ins.detail}</p>
          <span class="demo-tag" style="width:fit-content;">Simulated AI Advisory</span>
        </div>`
        )
        .join("");
    }
  }

  // ── Dedicated AI Shortage Prediction Form (Section C) ────────────────────
  function initPredictorForm() {
    const form = document.getElementById("ai-predictor-form");
    if (!form) return;

    const resultBox = document.getElementById("prediction-output");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      resultBox.innerHTML = `<div class="skeleton-shimmer" style="height:170px;"></div>`;

      const params = {
        group: document.getElementById("pred-group").value,
        region: document.getElementById("pred-region").value,
        currentInventory: Number(document.getElementById("pred-inventory").value),
        historicalDailyDemand: Number(document.getElementById("pred-hist-demand").value),
        expectedDailyDemand: Number(document.getElementById("pred-exp-demand").value),
        periodDays: Number(document.getElementById("pred-period").value)
      };

      await new Promise((r) => setTimeout(r, 320));
      const res = await predictWithOptionalBackend(params);
      let dbStatusNote = "Local Demo Mode (not persisted to Supabase)";

      if (global.PBSN_SVC) {
        try {
          await global.PBSN_SVC.savePredictionResult({
            ...res,
            availableInventory: params.currentInventory,
            isTrainedMLModel: false
          });
          dbStatusNote = "Saved to Supabase (shortage_predictions · model_version: demo-heuristic-v1)";
        } catch (dbErr) {
          dbStatusNote = `Supabase save skipped: ${dbErr.message}`;
        }
      }

      resultBox.innerHTML = `
        <div class="prediction-result">
          <div class="panel-head" style="margin-bottom:12px;">
            <div>
              <div class="eyebrow-mono">${res.source} · ${res.group} IN ${res.region.toUpperCase()} (${res.periodDays}D)</div>
              <h3 class="display-md" style="margin:4px 0 0;">${res.inventoryStatus}</h3>
            </div>
            <span class="badge ${badgeClass(res.riskLevel)}" style="font-size:0.78rem;padding:6px 12px;">${res.riskLevel}</span>
          </div>
          <div class="grid-3" style="margin-bottom:14px;">
            <div><div class="eyebrow-mono">PREDICTED DEMAND</div><strong class="tabular" style="font-size:1.3rem;">${res.predictedDemand} units</strong></div>
            <div><div class="eyebrow-mono">DAYS TO DEPLETION</div><strong class="tabular" style="font-size:1.3rem;">${res.daysToDepletion} days</strong></div>
            <div><div class="eyebrow-mono">SHORTAGE WINDOW</div><strong style="font-size:0.95rem;">${res.shortagePeriod}</strong></div>
          </div>
          <div style="padding:12px;border-radius:8px;border:1px solid var(--line);background:var(--surface);margin-bottom:10px;">
            <div class="eyebrow-mono" style="margin-bottom:4px;">SUGGESTED PREVENTIVE ACTION</div>
            <div style="font-size:0.9rem;">${res.suggestedAction}</div>
          </div>
          <div class="eyebrow-mono">${res.demoModelNote} · ${dbStatusNote}</div>
        </div>
      `;
      global.PBSN_CHROME.showToast(`Prediction complete: ${res.riskLevel} for ${res.group} in ${res.region}`, "success");
    });
  }

  // ── Network Page (Search, Filter, Sort, Leaflet Map & Transfer Dispatch) ─
  function renderNetworkPage(evalRes, insightsPack) {
    const mapContainer = document.getElementById("pbsn-map");
    if (mapContainer && global.PBSN_MAP) {
      global.PBSN_MAP.renderMap("pbsn-map", evalRes.bankSummaries, insightsPack.transfers, (bankId) => {
        state.selectedBankId = bankId;
        renderNetworkPage(evalRes, insightsPack);
      });
    }

    const tableBody = document.getElementById("network-banks-tbody");
    if (!tableBody) return;

    let rows = [...evalRes.bankSummaries];
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      rows = rows.filter((r) => r.bank.name.toLowerCase().includes(q) || r.bank.city.toLowerCase().includes(q));
    }
    if (state.sortBy === "units_desc") rows.sort((a, b) => b.totalUnits - a.totalUnits);
    else if (state.sortBy === "cover_asc") rows.sort((a, b) => a.minCover - b.minCover);
    else rows.sort((a, b) => a.bank.city.localeCompare(b.bank.city));

    tableBody.innerHTML =
      rows.length === 0
        ? `<tr><td colspan="8">No matching blood banks found for "${state.searchQuery}".</td></tr>`
        : rows
            .map(
              (r) => `
      <tr>
        <td><strong>${r.bank.name}</strong><div class="eyebrow-mono">${r.bank.role}</div></td>
        <td>${r.bank.city} (${r.bank.region})</td>
        <td><strong>${r.totalUnits}</strong> / ${r.bank.capacity}</td>
        <td>${r.minCover} days</td>
        <td>${r.bank.lastUpdated}</td>
        <td>${r.bank.contact}</td>
        <td><span class="badge ${badgeClass(r.status)}">${r.status}</span></td>
        <td><button type="button" class="btn btn-red btn-sm bank-inq-open-btn" data-bank-id="${r.bank.id}">Send Inquiry</button></td>
      </tr>`
            )
            .join("");

    tableBody.querySelectorAll(".bank-inq-open-btn").forEach((btn) => {
      btn.addEventListener("click", () => openBankInquiryModal(btn.dataset.bankId));
    });

    const transferList = document.getElementById("network-transfers-list");
    if (transferList) {
      transferList.innerHTML =
        insightsPack.transfers.length === 0
          ? `<div class="eyebrow-mono">No urgent inter-city transfers required.</div>`
          : insightsPack.transfers
              .map(
                (t, idx) => `
          <div style="display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px;border-radius:8px;border:1px solid var(--line);margin-bottom:8px;">
            <div>
              <span class="badge ${badgeClass(t.urgency)}">${t.urgency}</span>
              <strong style="margin-left:6px;font-size:0.88rem;">${t.qty}u ${t.donorGroup}: ${t.fromCity} → ${t.toCity}</strong>
              <div style="font-size:0.78rem;color:var(--text-muted);margin-top:2px;">${t.fromName} → ${t.toName} (${t.distanceKm} km)</div>
            </div>
            <button class="btn btn-red btn-sm dispatch-btn" data-idx="${idx}">Simulate Dispatch</button>
          </div>`
              )
              .join("");

      transferList.querySelectorAll(".dispatch-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
          const t = insightsPack.transfers[Number(btn.dataset.idx)];
          const fromB = state.banks.find((b) => b.id === t.fromId);
          const toB = state.banks.find((b) => b.id === t.toId);
          if (fromB && toB && fromB.inventory[t.donorGroup].units >= t.qty) {
            fromB.inventory[t.donorGroup].units -= t.qty;
            toB.inventory[t.neededGroup].units += t.qty;
            fromB.lastUpdated = "Just now";
            toB.lastUpdated = "Just now";
            saveState();
            global.PBSN_CHROME.showToast(`Dispatched ${t.qty}u ${t.donorGroup} (${t.fromCity} → ${t.toCity})`, "success");
            refreshAll();
          }
        });
      });
    }
  }

  function openBankInquiryModal(bankId) {
    const modal = document.getElementById("bank-inquiry-modal");
    const bank = state.banks.find((b) => b.id === bankId);
    if (!modal || !bank) return;
    document.getElementById("bank-inq-bank-id").value = bank.id;
    document.getElementById("bank-inq-hospital").value = bank.name;
    document.getElementById("bank-inq-city").value = bank.city;
    document.getElementById("bank-inq-title").textContent = `Send Inquiry — ${bank.name}`;
    document.getElementById("bank-inq-error").textContent = "";
    const conf = document.getElementById("bank-inq-confirmation");
    if (conf) conf.style.display = "none";
    modal.classList.add("open");
  }

  // ── Emergency Blood Requests & Donor Network (Sections E & F) ────────────
  function renderRequestsAndDonors() {
    const reqBody = document.getElementById("requests-tbody");
    if (reqBody) {
      reqBody.innerHTML = state.requests
        .map(
          (r) => `
        <tr>
          <td><code>${escapeHtml(r.refId)}</code></td>
          <td><strong>${escapeHtml(r.group)}</strong></td>
          <td>${escapeHtml(r.units)} u</td>
          <td>${escapeHtml(r.hospital)} (${escapeHtml(r.city)})</td>
          <td><span class="badge ${String(r.urgency || "").includes("Critical") ? "badge-critical" : r.urgency === "Urgent" ? "badge-high" : "badge-low"}">${escapeHtml(r.urgency)}</span></td>
          <td>${escapeHtml(r.status)}</td>
          <td>${escapeHtml(r.createdAt)}</td>
        </tr>`
        )
        .join("");
    }

    const donorGrid = document.getElementById("donor-list-grid");
    if (donorGrid) {
      const cityFilter = document.getElementById("donor-filter-city")?.value || "ALL";
      const groupFilter = document.getElementById("donor-filter-group")?.value || "ALL";
      const filtered = state.donors.filter(
        (d) =>
          (cityFilter === "ALL" || d.city === cityFilter) &&
          (groupFilter === "ALL" || d.group === groupFilter)
      );

      donorGrid.innerHTML =
        filtered.length === 0
          ? `<div class="panel">No demo donor profiles match the selected filters.</div>`
          : filtered
              .map(
                (d) => `
          <div class="panel" style="gap:8px;">
            <div class="panel-head">
              <strong>${escapeHtml(d.alias)} · Group ${escapeHtml(d.group)}</strong>
              <span class="badge ${d.available ? "badge-low" : "badge-moderate"}">${d.available ? "Available" : "Cooling Period"}</span>
            </div>
            <div style="font-size:0.84rem;color:var(--text-secondary);">City: ${escapeHtml(d.city)} · Last donated: ${escapeHtml(d.lastDonated)}</div>
            <div class="eyebrow-mono">${d.consentPublic ? `Contact: ${escapeHtml(d.preference)}` : "Contact masked (consent restricted)"}</div>
          </div>`
              )
              .join("");
    }
  }

  async function handleInquirySubmission(form, submitBtn, errEl, actionFn) {
    if (form.dataset.submitting === "true") return;
    form.dataset.submitting = "true";
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending Inquiry...";
    errEl.textContent = "";

    try {
      await actionFn();
    } catch (err) {
      const msg = err && err.message ? err.message : "Unable to submit inquiry. Please verify inputs and try again.";
      errEl.textContent = msg;
      global.PBSN_CHROME.showToast(msg, "error");
    } finally {
      form.dataset.submitting = "false";
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  }

  function initForms() {
    // 1. Emergency Blood Request / Hospital Requirement Inquiry Form
    const reqForm = document.getElementById("emergency-request-form");
    if (reqForm) {
      reqForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const errEl = document.getElementById("req-error");
        const submitBtn = document.getElementById("req-submit-btn");
        const refId = document.getElementById("req-ref").value.trim();
        const group = document.getElementById("req-group").value;
        const units = Number(document.getElementById("req-units").value);
        const hospital = document.getElementById("req-hospital").value;
        const city = document.getElementById("req-city").value;
        const urgency = document.getElementById("req-urgency").value;
        const contact = document.getElementById("req-contact").value.trim();

        if (refId.length < 3) {
          errEl.textContent = "Please provide an anonymized request reference (at least 3 characters, no patient PII).";
          return;
        }
        if (!Number.isFinite(units) || units < 1 || units > 50) {
          errEl.textContent = "Required units must be between 1 and 50.";
          return;
        }
        if (contact.length < 5) {
          errEl.textContent = "Please enter an official hospital desk phone or email.";
          return;
        }

        handleInquirySubmission(reqForm, submitBtn, errEl, async () => {
          await global.PBSN_SVC.submitBloodRequest({
            request_reference: refId,
            patient_reference: refId,
            blood_group: group,
            units_required: units,
            hospital_name: hospital,
            city,
            contact_phone: contact,
            urgency_level: urgency
          });

          const entry = {
            refId,
            group,
            units,
            hospital,
            city,
            urgency,
            status: "Saved in Supabase (Pending)",
            createdAt: "Just now"
          };
          state.requests.unshift(entry);
          saveState();
          renderRequestsAndDonors();
          reqForm.reset();

          const conf = document.getElementById("req-confirmation");
          conf.style.display = "block";
          conf.innerHTML = `<strong>Inquiry ${escapeHtml(refId)} Confirmed in Supabase:</strong> ${escapeHtml(units)} units of ${escapeHtml(group)} requested for ${escapeHtml(hospital)}, ${escapeHtml(city)}.`;
          global.PBSN_CHROME.showToast(`Blood request ${refId} saved to Supabase`, "success");
        });
      });
    }

    // 2. Donor Network Registration & Availability Inquiry Form
    const donorForm = document.getElementById("donor-reg-form");
    if (donorForm) {
      donorForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const errEl = document.getElementById("donor-error");
        const submitBtn = document.getElementById("donor-submit-btn");
        const alias = document.getElementById("donor-name").value.trim();
        const group = document.getElementById("donor-group").value;
        const city = document.getElementById("donor-city").value;
        const available = document.getElementById("donor-avail").value === "true";
        const preference = document.getElementById("donor-pref").value;
        const consent = document.getElementById("donor-consent").checked;

        if (alias.length < 2) {
          errEl.textContent = "Please enter a display name or initials.";
          return;
        }

        handleInquirySubmission(donorForm, submitBtn, errEl, async () => {
          await global.PBSN_SVC.submitDonorInquiry({
            donor_name: alias,
            blood_group: group,
            city,
            phone: preference,
            availability_status: available ? "Available" : "Cooling Period",
            consent_to_contact: consent
          });

          const donorEntry = {
            id: `D-${Math.floor(200 + Math.random() * 799)}`,
            alias,
            group,
            city,
            available,
            preference,
            consentPublic: consent,
            lastDonated: "Eligible now"
          };
          state.donors.unshift(donorEntry);
          saveState();
          renderRequestsAndDonors();
          donorForm.reset();

          const conf = document.getElementById("donor-confirmation");
          if (conf) {
            conf.style.display = "block";
            conf.innerHTML = `<strong>Donor Inquiry Saved in Supabase:</strong> ${escapeHtml(alias)} (${escapeHtml(group)}, ${escapeHtml(city)}) registered with consent privacy enforced.`;
          }
          global.PBSN_CHROME.showToast(`Donor inquiry saved to Supabase for ${city}`, "success");
        });
      });
    }

    // 3. Blood Bank Availability Modal Inquiry Form (network.html)
    const bankModal = document.getElementById("bank-inquiry-modal");
    const closeBankBtn = document.getElementById("close-bank-inq-btn");
    if (bankModal && closeBankBtn) {
      closeBankBtn.addEventListener("click", () => bankModal.classList.remove("open"));
      bankModal.addEventListener("click", (e) => {
        if (e.target === bankModal) bankModal.classList.remove("open");
      });
    }

    const bankInqForm = document.getElementById("bank-inquiry-form");
    if (bankInqForm) {
      bankInqForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const errEl = document.getElementById("bank-inq-error");
        const submitBtn = document.getElementById("bank-inq-submit-btn");
        const hospital = document.getElementById("bank-inq-hospital").value;
        const city = document.getElementById("bank-inq-city").value;
        const group = document.getElementById("bank-inq-group").value;
        const units = Number(document.getElementById("bank-inq-units").value);
        const contact = document.getElementById("bank-inq-contact").value.trim();
        const notes = document.getElementById("bank-inq-notes").value.trim();

        if (!Number.isFinite(units) || units < 1 || units > 50) {
          errEl.textContent = "Required units must be between 1 and 50.";
          return;
        }
        if (contact.length < 5) {
          errEl.textContent = "Please provide a valid hospital or coordinator contact.";
          return;
        }

        handleInquirySubmission(bankInqForm, submitBtn, errEl, async () => {
          const refId = `INQ-${city.slice(0, 3).toUpperCase()}-${Math.floor(100 + Math.random() * 899)}`;
          await global.PBSN_SVC.submitBloodRequest({
            request_reference: refId,
            patient_reference: refId,
            blood_group: group,
            units_required: units,
            hospital_name: hospital,
            hospital_address: notes || "Blood availability inquiry",
            city,
            contact_phone: contact,
            urgency_level: "Urgent"
          });

          state.requests.unshift({
            refId,
            group,
            units,
            hospital,
            city,
            urgency: "Urgent",
            status: "Saved in Supabase",
            createdAt: "Just now"
          });
          saveState();

          const conf = document.getElementById("bank-inq-confirmation");
          conf.style.display = "block";
          conf.innerHTML = `<strong>Inquiry ${escapeHtml(refId)} Confirmed in Supabase:</strong> Availability inquiry for ${escapeHtml(units)}u ${escapeHtml(group)} sent to ${escapeHtml(hospital)} (${escapeHtml(city)}).`;
          global.PBSN_CHROME.showToast(`Inquiry saved for ${hospital}`, "success");
        });
      });
    }

    // 4. Campaign & Contact Inquiry Form (about.html)
    const campForm = document.getElementById("campaign-inquiry-form");
    if (campForm) {
      campForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const errEl = document.getElementById("camp-error");
        const submitBtn = document.getElementById("camp-submit-btn");
        const org = document.getElementById("camp-org").value.trim();
        const city = document.getElementById("camp-city").value;
        const group = document.getElementById("camp-group").value;
        const contact = document.getElementById("camp-contact").value.trim();

        if (org.length < 3) {
          errEl.textContent = "Please enter your hospital, college, or organization name.";
          return;
        }
        if (contact.length < 5) {
          errEl.textContent = "Please enter a valid contact email or phone number.";
          return;
        }

        handleInquirySubmission(campForm, submitBtn, errEl, async () => {
          const isEmail = contact.includes("@");
          await global.PBSN_SVC.submitContactInquiry({
            name: org,
            email: isEmail ? contact : "coordinator@pbsn-demo.org",
            phone: isEmail ? "" : contact,
            subject: `Donation Campaign / Partnership (${city}, ${group})`,
            message: `Organization: ${org} | City: ${city} | Focus Blood Group: ${group} | Contact: ${contact}`
          });

          campForm.reset();
          const conf = document.getElementById("camp-confirmation");
          conf.style.display = "block";
          conf.innerHTML = `<strong>Inquiry Saved in Supabase:</strong> Logged for ${escapeHtml(org)} (${escapeHtml(city)}, Focus: ${escapeHtml(group)}).`;
          global.PBSN_CHROME.showToast(`Contact inquiry saved to Supabase for ${org}`, "success");
        });
      });
    }

    ["donor-filter-city", "donor-filter-group"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", renderRequestsAndDonors);
    });
  }

  function populateDynamicSelects() {
    document.querySelectorAll("[data-populate='groups']").forEach((sel) => {
      BLOOD_GROUPS.forEach((g) => {
        const o = document.createElement("option");
        o.value = g;
        o.textContent = g;
        sel.appendChild(o);
      });
    });
    document.querySelectorAll("[data-populate='cities']").forEach((sel) => {
      CITIES.forEach((c) => {
        const o = document.createElement("option");
        o.value = c;
        o.textContent = c;
        sel.appendChild(o);
      });
    });
    document.querySelectorAll("[data-populate='hospitals']").forEach((sel) => {
      state.banks.forEach((b) => {
        const o = document.createElement("option");
        o.value = sel.dataset.valueMode === "name" ? b.name : b.id;
        o.textContent = `${b.name} (${b.city})`;
        sel.appendChild(o);
      });
    });
  }

  function initFilterBindings() {
    const mapFilter = (id, key, isNum = false) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.addEventListener("change", (e) => {
        state.filters[key] = isNum ? Number(e.target.value) : e.target.value;
        refreshAll();
      });
    };
    mapFilter("flt-group", "group");
    mapFilter("flt-region", "region");
    mapFilter("flt-hospital", "hospitalId");
    mapFilter("flt-days", "days", true);
    mapFilter("flt-season", "seasonKey");

    const trendToggle = document.getElementById("trend-mode-toggle");
    if (trendToggle) {
      trendToggle.addEventListener("change", (e) => {
        state.trendMode = e.target.value;
        refreshAll();
      });
    }

    const searchInput = document.getElementById("net-search");
    if (searchInput) {
      searchInput.addEventListener("input", (e) => {
        state.searchQuery = e.target.value.trim();
        refreshAll();
      });
    }

    const sortSel = document.getElementById("net-sort");
    if (sortSel) {
      sortSel.addEventListener("change", (e) => {
        state.sortBy = e.target.value;
        refreshAll();
      });
    }

    const resetBtn = document.getElementById("reset-demo-btn");
    if (resetBtn) {
      resetBtn.addEventListener("click", () => {
        localStorage.removeItem("pbsn_banks");
        localStorage.removeItem("pbsn_donors");
        localStorage.removeItem("pbsn_requests");
        localStorage.removeItem("pbsn_inquiries");
        state.banks = structuredClone(INITIAL_BANKS);
        state.donors = structuredClone(INITIAL_DONORS);
        state.requests = structuredClone(INITIAL_REQUESTS);
        state.inquiries = [];
        global.PBSN_CHROME.showToast("Demo dataset restored to initial baseline", "info");
        refreshAll();
      });
    }
  }

  function refreshAll() {
    const evalRes = evaluateDashboard(state.banks, state.filters);
    const insightsPack = generateInsightsAndTransfers(state.banks, evalRes);
    renderLandingPreview(evalRes);
    renderDashboardPage(evalRes, insightsPack);
    renderNetworkPage(evalRes, insightsPack);
    renderRequestsAndDonors();
  }

  global.PBSN_APP_REFRESH = refreshAll;

  document.addEventListener("DOMContentLoaded", () => {
    global.PBSN_CHROME.renderSharedChrome();
    global.PBSN_ANIM.initAnimations();
    populateDynamicSelects();
    initFilterBindings();
    initPredictorForm();
    initForms();
    refreshAll();
  });
})(window);
