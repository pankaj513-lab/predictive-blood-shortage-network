/**
 * PBSN — Hospital Department Dashboard Controller
 * Protected by Supabase Auth + Server-Side Multi-Tenant PostgreSQL RLS.
 */
(function (global) {
  "use strict";

  const BLOOD_GROUPS = ["O-", "O+", "A+", "A-", "B+", "B-", "AB+", "AB-"];
  const STATUS_OPTIONS = ["Pending", "Under Review", "Approved", "Fulfilled", "Rejected"];

  const state = {
    isDemo: false,
    profile: null,
    requests: [],
    inventory: [],
    alerts: [],
    departments: [],
    users: []
  };

  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function statusBadgeClass(status) {
    if (status === "Approved" || status === "Fulfilled") return "badge-low";
    if (status === "Rejected") return "badge-critical";
    if (status === "Under Review") return "badge-info";
    return "badge-med";
  }

  function urgencyBadgeClass(urg) {
    if (urg === "Critical") return "badge-critical";
    if (urg === "High") return "badge-med";
    if (urg === "Scheduled" || urg === "Recurring") return "badge-info";
    return "badge-low";
  }

  function defaultRequiredDatetime() {
    const dt = new Date(Date.now() + 2 * 3600 * 1000);
    const pad = (n) => String(n).padStart(2, "0");
    return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
  }

  function buildDemoState() {
    return {
      profile: {
        hospital_name: "Demo Hospital Preview (Read-Only)",
        hospital_code: "DEMO-HOSP",
        city: "Mumbai",
        state: "Maharashtra",
        department_name: "Emergency Department (Preview)",
        department_code: "DEPT-EMG",
        full_name: "Preview Clinician",
        official_email: "preview-only@pbsn.local",
        role: "department_staff"
      },
      requests: [
        {
          id: "demo-1",
          blood_group: "O-",
          units_required: 4,
          patient_reference: "DEMO-PAT-EMG-101",
          urgency_level: "Critical",
          required_datetime: new Date(Date.now() + 1800 * 1000).toISOString(),
          staff_name: "Demo Trauma Lead",
          notes: "Read-only illustrative preview record — sign in to submit live requests.",
          request_status: "Pending",
          created_at: new Date().toISOString(),
          hospital_departments: { department_name: "Emergency Department", department_code: "DEPT-EMG" }
        }
      ],
      inventory: [],
      alerts: []
    };
  }

  function isBloodBank() {
    return state.profile && (state.profile.role === "blood_bank_officer" || state.profile.department_code === "DEPT-BBK");
  }

  function isHospitalAdmin() {
    return state.profile && (state.profile.role === "hospital_admin" || state.profile.department_code === "DEPT-ADM");
  }

  function configureDepartmentSpecificUI() {
    const p = state.profile;
    const code = p.department_code;

    document.getElementById("hdr-dept-code").textContent = code;
    document.getElementById("hdr-role-badge").textContent = p.role.replaceAll("_", " ").toUpperCase();
    document.getElementById("hdr-dept-name").textContent = p.department_name;
    document.getElementById("hdr-hosp-name").textContent = `${p.hospital_name} (${p.hospital_code})`;
    document.getElementById("hdr-hosp-meta").textContent = [p.city, p.state].filter(Boolean).join(", ");
    document.getElementById("hdr-staff-email").textContent = `${p.full_name} · ${p.official_email}`;
    document.getElementById("req-dept-name").value = p.department_name;
    document.getElementById("req-staff-name").value = state.isDemo ? "" : p.full_name;
    document.getElementById("req-datetime").value = defaultRequiredDatetime();

    const presetEl = document.getElementById("dept-quick-presets");
    const roleModule = document.getElementById("dept-role-module");
    const urgencySel = document.getElementById("req-urgency");
    const notesEl = document.getElementById("req-notes");

    let presets = [];
    let moduleHtml = "";

    if (code === "DEPT-EMG") {
      urgencySel.value = "Critical";
      notesEl.placeholder = "Trauma bay, emergency cross-match, massive transfusion alert...";
      presets = [
        { label: "Trauma Critical O- (4u)", group: "O-", units: 4, urg: "Critical", note: "Immediate Trauma Bay ER resuscitation" },
        { label: "Urgent O+ Cross-Match (3u)", group: "O+", units: 3, urg: "High", note: "Emergency ward cross-match pending" }
      ];
      moduleHtml = `<div class="panel-head"><div><div class="eyebrow-mono" style="color:var(--red-bright);">EMERGENCY DEPARTMENT CONSOLE</div><h2 class="panel-title">Critical Emergency Rapid Triage</h2></div><span class="badge badge-critical">Fast-Track Priority</span></div><p class="lead-lg" style="font-size:0.86rem;">Emergency requests trigger immediate visibility in the hospital Blood Bank queue and PBSN Admin Command Center.</p>`;
    } else if (code === "DEPT-ICU") {
      urgencySel.value = "High";
      notesEl.placeholder = "ICU bed number, platelet/PRBC support schedule, hemoglobin threshold...";
      presets = [
        { label: "ICU Urgent Stabilize (2u)", group: "A+", units: 2, urg: "High", note: "ICU critical hemoglobin stabilization" },
        { label: "ICU Scheduled Support (2u)", group: "B+", units: 2, urg: "Scheduled", note: "Scheduled 12-hour ICU support window" }
      ];
      moduleHtml = `<div class="panel-head"><div><div class="eyebrow-mono">INTENSIVE CARE UNIT (ICU)</div><h2 class="panel-title">Scheduled &amp; Urgent ICU Monitoring</h2></div><span class="badge badge-med">ICU Protocol</span></div><p class="lead-lg" style="font-size:0.86rem;">Coordinate urgent bedside transfusions alongside scheduled ICU hematology allocations.</p>`;
    } else if (code === "DEPT-SRG") {
      urgencySel.value = "Scheduled";
      notesEl.placeholder = "Operation Theatre (OT) suite, surgery type, cross-matched standby requirement...";
      presets = [
        { label: "Pre-Surgery Standby (4u)", group: "A+", units: 4, urg: "Scheduled", note: "OT Suite 2 — Pre-operative cross-matched standby for cardiac/orthopedic surgery" }
      ];
      moduleHtml = `<div class="panel-head"><div><div class="eyebrow-mono">SURGERY DEPARTMENT</div><h2 class="panel-title">Pre-Surgery Blood Allocation Window</h2></div><span class="badge badge-info">OT Standby</span></div><p class="lead-lg" style="font-size:0.86rem;">Specify required blood units and exact operation date/time so the Blood Bank reserves units ahead of theatre prep.</p>`;
    } else if (code === "DEPT-ONC") {
      urgencySel.value = "Recurring";
      notesEl.placeholder = "Chemotherapy / hematology cycle ID, recurring weekly schedule, irradiated/leukoreduced notes...";
      presets = [
        { label: "Oncology Cycle Support (2u)", group: "B+", units: 2, urg: "Recurring", note: "Recurring oncology cycle transfusion (leukoreduced cross-match)" }
      ];
      moduleHtml = `<div class="panel-head"><div><div class="eyebrow-mono">ONCOLOGY DEPARTMENT</div><h2 class="panel-title">Recurring Transfusion Schedule</h2></div><span class="badge badge-info">Cycle Care</span></div><p class="lead-lg" style="font-size:0.86rem;">Track recurring transfusion schedules and multi-cycle unit reservations for oncology patients.</p>`;
    } else if (code === "DEPT-BBK" || p.role === "blood_bank_officer") {
      urgencySel.value = "High";
      moduleHtml = `<div class="panel-head"><div><div class="eyebrow-mono" style="color:var(--mint);">BLOOD BANK DEPARTMENT</div><h2 class="panel-title">Incoming Cross-Department Coordination &amp; Stock Control</h2></div><span class="badge badge-low">Hospital-Wide Queue</span></div><p class="lead-lg" style="font-size:0.86rem;">Review incoming blood requests from every department in ${escapeHtml(p.hospital_name)}, update approval/fulfillment statuses below, and manage available blood units.</p>`;
    } else if (code === "DEPT-ADM" || p.role === "hospital_admin") {
      urgencySel.value = "Routine";
      moduleHtml = `<div class="panel-head"><div><div class="eyebrow-mono">HOSPITAL ADMINISTRATION</div><h2 class="panel-title">Hospital-Wide Oversight &amp; Department Controls</h2></div><span class="badge badge-info">Hospital Admin</span></div><p class="lead-lg" style="font-size:0.86rem;">Monitor department activity across ${escapeHtml(p.hospital_name)}, add hospital departments, and manage staff roles &amp; activation.</p>`;
    } else {
      urgencySel.value = "Routine";
      moduleHtml = `<div class="panel-head"><div><div class="eyebrow-mono">${escapeHtml(p.department_name.toUpperCase())}</div><h2 class="panel-title">Clinical Ward Blood Coordination</h2></div><span class="badge badge-low">Active Unit</span></div><p class="lead-lg" style="font-size:0.86rem;">Submit blood requirements and track fulfillment updates from the Hospital Blood Bank and PBSN network.</p>`;
    }

    roleModule.style.display = "block";
    roleModule.innerHTML = moduleHtml;

    presetEl.innerHTML = presets
      .map(
        (pr, idx) =>
          `<button type="button" class="dept-chip-btn" data-preset-idx="${idx}">⚡ ${escapeHtml(pr.label)}</button>`
      )
      .join("");
    presetEl.onclick = (e) => {
      const btn = e.target.closest("[data-preset-idx]");
      if (!btn) return;
      const pr = presets[Number(btn.dataset.presetIdx)];
      if (!pr) return;
      document.getElementById("req-blood-group").value = pr.group;
      document.getElementById("req-units").value = String(pr.units);
      document.getElementById("req-urgency").value = pr.urg;
      document.getElementById("req-notes").value = pr.note;
      global.PBSN_CHROME.showToast(`Applied ${pr.label} preset`, "info");
    };

    const showHospitalScope = isBloodBank() || isHospitalAdmin();
    document.getElementById("req-history-eyebrow").textContent = showHospitalScope
      ? `HOSPITAL-WIDE REQUESTS (${p.hospital_code})`
      : `${code} AUTHORIZED REQUESTS ONLY`;
    document.getElementById("req-history-title").textContent = showHospitalScope
      ? "Incoming & Hospital Department Blood Requests"
      : "Department Submitted Requests & Status";

    document.getElementById("bbk-inventory-panel").style.display = isBloodBank() && !state.isDemo ? "block" : "none";
    document.getElementById("hosp-admin-panel").style.display = isHospitalAdmin() && !state.isDemo ? "grid" : "none";
    document.getElementById("th-req-actions").style.display = isBloodBank() && !state.isDemo ? "" : "none";
  }

  function renderKPIsAndInventory() {
    const hospCity = (state.profile?.city || "").toLowerCase();
    const cityInv = state.inventory.filter((r) => (r.city || "").toLowerCase() === hospCity);
    const activeInv = cityInv.length > 0 ? cityInv : state.inventory;

    document.getElementById("inv-city-tag").textContent =
      cityInv.length > 0 ? `${state.profile.city} Stock (${cityInv.length} rows)` : `Network Stock (${activeInv.length} rows)`;

    const groupTotals = {};
    BLOOD_GROUPS.forEach((g) => (groupTotals[g] = 0));
    let totalAvail = 0;
    activeInv.forEach((r) => {
      const u = Number(r.available_units || 0);
      totalAvail += u;
      if (groupTotals[r.blood_group] !== undefined) groupTotals[r.blood_group] += u;
    });

    const groupsReady = Object.values(groupTotals).filter((n) => n > 0).length;
    const currentReqs = state.requests.filter((r) => r.request_status !== "Rejected" && r.request_status !== "Fulfilled").length;
    const pendingReqs = state.requests.filter((r) => r.request_status === "Pending" || r.request_status === "Under Review").length;
    const approvedReqs = state.requests.filter((r) => r.request_status === "Approved" || r.request_status === "Fulfilled").length;

    document.getElementById("kpi-available-units").textContent = String(totalAvail);
    document.getElementById("kpi-groups-ready").textContent = `${groupsReady}/8 blood groups available`;
    document.getElementById("kpi-current-reqs").textContent = String(currentReqs);
    document.getElementById("kpi-pending-reqs").textContent = String(pendingReqs);
    document.getElementById("kpi-approved-reqs").textContent = String(approvedReqs);

    // Blood group bars
    const maxGroup = Math.max(10, ...Object.values(groupTotals));
    document.getElementById("dept-blood-groups-bars").innerHTML = BLOOD_GROUPS.map((g) => {
      const n = groupTotals[g];
      const color = n <= 5 ? "var(--red)" : n <= 15 ? "var(--amber)" : "var(--mint)";
      return `
        <div>
          <div class="bg-bar-head"><strong>${g}</strong><span>${n} units</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${Math.round((n / maxGroup) * 100)}%;background:${color};"></div></div>
        </div>`;
    }).join("");

    document.getElementById("dept-inv-summary-tbody").innerHTML =
      activeInv.length === 0
        ? `<tr><td colspan="5">No inventory rows available.</td></tr>`
        : activeInv
            .slice(0, 12)
            .map(
              (r) => `
          <tr>
            <td><strong>${escapeHtml(r.blood_bank_name)}</strong></td>
            <td>${escapeHtml(r.city)}</td>
            <td><span class="badge badge-info">${escapeHtml(r.blood_group)}</span></td>
            <td class="tabular"><strong>${r.available_units}</strong></td>
            <td class="tabular">${r.reserved_units}</td>
          </tr>`
            )
            .join("");

    // Emergency Blood Alerts
    const alertCards = [];
    state.requests
      .filter((r) => r.urgency_level === "Critical" && (r.request_status === "Pending" || r.request_status === "Under Review"))
      .slice(0, 3)
      .forEach((r) => {
        alertCards.push({
          title: `CRITICAL ORDER: ${r.units_required}u ${r.blood_group}`,
          sub: `${r.hospital_departments?.department_name || state.profile.department_name} · Ref ${r.patient_reference}`,
          tier: "CRITICAL"
        });
      });

    state.alerts
      .filter((a) => a.shortage_risk === "HIGH" || a.shortage_risk === "CRITICAL")
      .slice(0, 3)
      .forEach((a) => {
        alertCards.push({
          title: `AI SHORTAGE ALERT: ${a.blood_group} (${a.region})`,
          sub: `Avail ${a.available_inventory}u vs Pred Demand ${a.predicted_demand}u`,
          tier: a.shortage_risk
        });
      });

    BLOOD_GROUPS.filter((g) => activeInv.length > 0 && groupTotals[g] <= 4)
      .slice(0, 2)
      .forEach((g) => {
        alertCards.push({
          title: `LOW BUFFER STOCK: ${g}`,
          sub: `Only ${groupTotals[g]} units remaining in local pool`,
          tier: "LOW STOCK"
        });
      });

    document.getElementById("alerts-count-badge").textContent = `${alertCards.length} Active Alert${alertCards.length === 1 ? "" : "s"}`;
    document.getElementById("kpi-alerts-sub").textContent = `Emergency Blood Alerts: ${alertCards.length}`;
    document.getElementById("dept-alerts-list").innerHTML =
      alertCards.length === 0
        ? `<div class="eyebrow-mono">All monitored blood pools and critical orders are currently stable.</div>`
        : alertCards
            .slice(0, 6)
            .map(
              (c) => `
          <div style="padding:10px 12px;border-radius:8px;border:1px solid rgba(230,57,70,0.35);background:rgba(230,57,70,0.08);">
            <div style="display:flex;justify-content:space-between;gap:8px;align-items:center;">
              <strong style="font-size:0.84rem;">${escapeHtml(c.title)}</strong>
              <span class="badge badge-critical">${escapeHtml(c.tier)}</span>
            </div>
            <div style="font-size:0.78rem;color:var(--text-secondary);margin-top:4px;">${escapeHtml(c.sub)}</div>
          </div>`
            )
            .join("");
  }

  function renderRequestsTable() {
    const stFilter = document.getElementById("dept-filter-status").value;
    const urgFilter = document.getElementById("dept-filter-urgency").value;
    const canReview = isBloodBank() && !state.isDemo;

    const list = state.requests.filter((r) => {
      if (stFilter !== "ALL" && r.request_status !== stFilter) return false;
      if (urgFilter !== "ALL" && r.urgency_level !== urgFilter) return false;
      return true;
    });

    const tbody = document.getElementById("dept-requests-tbody");
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${canReview ? 8 : 7}">No blood requests match the selected filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = list
      .map(
        (r) => `
      <tr>
        <td><strong>${escapeHtml(r.blood_group)}</strong> · ${r.units_required} units</td>
        <td><code>${escapeHtml(r.patient_reference)}</code></td>
        <td>${escapeHtml(r.hospital_departments?.department_name || state.profile.department_name)}</td>
        <td><span class="badge ${urgencyBadgeClass(r.urgency_level)}">${escapeHtml(r.urgency_level)}</span></td>
        <td>${new Date(r.required_datetime).toLocaleString()}</td>
        <td style="max-width:240px;">
          <div><strong>${escapeHtml(r.staff_name)}</strong></div>
          <div style="font-size:0.76rem;color:var(--text-muted);">${escapeHtml(r.notes || "—")}</div>
        </td>
        <td><span class="badge ${statusBadgeClass(r.request_status)}">${escapeHtml(r.request_status)}</span></td>
        ${
          canReview
            ? `<td>
            <div style="display:flex;gap:6px;align-items:center;">
              <select class="control-select" data-review-sel="${r.id}" style="min-width:130px;height:32px;font-size:0.76rem;">
                ${STATUS_OPTIONS.map((s) => `<option value="${s}" ${r.request_status === s ? "selected" : ""}>${s}</option>`).join("")}
              </select>
              <button type="button" class="btn btn-primary btn-sm" data-save-req="${r.id}">Save</button>
            </div>
          </td>`
            : ""
        }
      </tr>`
      )
      .join("");

    if (canReview) {
      tbody.querySelectorAll("[data-save-req]").forEach((btn) => {
        btn.addEventListener("click", async () => {
          const id = btn.dataset.saveReq;
          const sel = tbody.querySelector(`[data-review-sel="${id}"]`);
          btn.disabled = true;
          try {
            await global.PBSN_SVC.updateDepartmentBloodRequestStatus(id, sel.value);
            global.PBSN_CHROME.showToast(`Request updated to ${sel.value}`, "success");
            await loadDashboardData();
          } catch (err) {
            global.PBSN_CHROME.showToast(err.message, "error");
          } finally {
            btn.disabled = false;
          }
        });
      });
    }
  }

  function renderBloodBankInventoryEditor() {
    if (!isBloodBank() || state.isDemo) return;
    const hospCity = (state.profile.city || "").toLowerCase();
    const rows = state.inventory.filter((r) => (r.city || "").toLowerCase() === hospCity);
    const tbody = document.getElementById("bbk-inventory-tbody");
    if (rows.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">No blood inventory rows found for ${escapeHtml(state.profile.city)}. Ask PBSN Admin to add inventory for your city.</td></tr>`;
      return;
    }

    tbody.innerHTML = rows
      .map(
        (r) => `
      <tr>
        <td><strong>${escapeHtml(r.blood_bank_name)}</strong></td>
        <td>${escapeHtml(r.city)}</td>
        <td><span class="badge badge-info">${escapeHtml(r.blood_group)}</span></td>
        <td><input type="number" min="0" max="999" class="field-input" data-bbk-avail="${r.id}" value="${r.available_units}" style="width:90px;height:32px;" /></td>
        <td><input type="number" min="0" max="999" class="field-input" data-bbk-res="${r.id}" value="${r.reserved_units}" style="width:90px;height:32px;" /></td>
        <td><button type="button" class="btn btn-primary btn-sm" data-bbk-save="${r.id}">Update</button></td>
      </tr>`
      )
      .join("");

    tbody.querySelectorAll("[data-bbk-save]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const id = btn.dataset.bbkSave;
        const avail = tbody.querySelector(`[data-bbk-avail="${id}"]`).value;
        const res = tbody.querySelector(`[data-bbk-res="${id}"]`).value;
        btn.disabled = true;
        try {
          await global.PBSN_SVC.updateInventoryRow(id, avail, res);
          global.PBSN_CHROME.showToast("Blood inventory units updated in Supabase", "success");
          await loadDashboardData();
        } catch (err) {
          global.PBSN_CHROME.showToast(err.message, "error");
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  function renderHospitalAdminPanel() {
    if (!isHospitalAdmin() || state.isDemo) return;
    document.getElementById("hosp-adm-dept-count").textContent = `${state.departments.length} Departments`;

    // Populate missing standard departments dropdown
    const existingCodes = new Set(state.departments.map((d) => d.department_code));
    const missing = global.PBSN_SVC.STANDARD_DEPARTMENTS.filter((d) => !existingCodes.has(d.department_code));
    document.getElementById("hosp-new-dept-preset").innerHTML =
      missing.length === 0
        ? `<option value="">All 8 standard departments provisioned</option>`
        : `<option value="">Add standard department...</option>` +
          missing.map((d) => `<option value="${d.department_code}|${d.department_name}">${d.department_name} (${d.department_code})</option>`).join("");

    document.getElementById("hosp-adm-depts-tbody").innerHTML = state.departments
      .map((d) => {
        const cnt = state.requests.filter((r) => r.department_id === d.id).length;
        return `<tr><td><code>${escapeHtml(d.department_code)}</code></td><td><strong>${escapeHtml(d.department_name)}</strong></td><td class="tabular">${cnt}</td></tr>`;
      })
      .join("");

    const usersTbody = document.getElementById("hosp-adm-users-tbody");
    usersTbody.innerHTML =
      state.users.length === 0
        ? `<tr><td colspan="5">No staff accounts found.</td></tr>`
        : state.users
            .map(
              (u) => `
          <tr>
            <td><strong>${escapeHtml(u.full_name)}</strong></td>
            <td>${escapeHtml(u.official_email)}</td>
            <td><code>${escapeHtml(u.role)}</code></td>
            <td><span class="badge ${u.is_active ? "badge-low" : "badge-critical"}">${u.is_active ? "Active" : "Inactive"}</span></td>
            <td>
              ${
                u.id === state.profile.id
                  ? `<span class="eyebrow-mono">Current</span>`
                  : `<button type="button" class="btn btn-ghost btn-sm" data-toggle-user="${u.id}" data-next-active="${String(!u.is_active)}">${u.is_active ? "Deactivate" : "Activate"}</button>`
              }
            </td>
          </tr>`
            )
            .join("");

    usersTbody.querySelectorAll("[data-toggle-user]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.toggleUser;
        const nextActive = btn.dataset.nextActive === "true";
        btn.disabled = true;
        try {
          await global.PBSN_SVC.updateDepartmentUserAsHospAdmin(uid, { is_active: nextActive });
          global.PBSN_CHROME.showToast(`User ${nextActive ? "activated" : "deactivated"}`, "success");
          await loadDashboardData();
        } catch (err) {
          global.PBSN_CHROME.showToast(err.message, "error");
        } finally {
          btn.disabled = false;
        }
      });
    });
  }

  async function loadDashboardData() {
    if (state.isDemo) {
      const demo = buildDemoState();
      state.profile = demo.profile;
      state.requests = demo.requests;
      state.inventory = demo.inventory;
      state.alerts = demo.alerts;
    } else {
      const data = await global.PBSN_SVC.fetchDepartmentDashboardData(state.profile);
      state.requests = data.requests;
      state.inventory = data.inventory;
      state.alerts = data.alerts;
      state.departments = data.departments;
      state.users = data.users;
    }

    configureDepartmentSpecificUI();
    renderKPIsAndInventory();
    renderRequestsTable();
    renderBloodBankInventoryEditor();
    renderHospitalAdminPanel();
  }

  function bindEvents() {
    document.getElementById("dept-refresh-btn").addEventListener("click", async () => {
      await loadDashboardData();
      global.PBSN_CHROME.showToast("Dashboard refreshed", "info");
    });

    document.getElementById("dept-logout-btn").addEventListener("click", async () => {
      if (!state.isDemo) {
        await global.PBSN_SVC.signOutDepartment();
      }
      window.location.href = "./hospital-login.html";
    });

    document.getElementById("dept-filter-status").addEventListener("change", renderRequestsTable);
    document.getElementById("dept-filter-urgency").addEventListener("change", renderRequestsTable);

    document.getElementById("dept-request-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const errEl = document.getElementById("req-form-error");
      const btn = document.getElementById("req-submit-btn");

      if (state.isDemo) {
        errEl.textContent = "Read-only demo preview mode: sign in via Hospital Login to submit live requests to Supabase.";
        return;
      }

      const payload = {
        blood_group: document.getElementById("req-blood-group").value,
        units_required: Number(document.getElementById("req-units").value),
        patient_reference: document.getElementById("req-patient-ref").value.trim(),
        urgency_level: document.getElementById("req-urgency").value,
        required_datetime: document.getElementById("req-datetime").value,
        staff_name: document.getElementById("req-staff-name").value.trim(),
        notes: document.getElementById("req-notes").value.trim()
      };

      if (payload.patient_reference.length < 2 || payload.staff_name.length < 2 || !payload.required_datetime || payload.units_required < 1 || payload.units_required > 100) {
        errEl.textContent = "Please complete Patient Reference ID, Authorized Staff Name, Required Date/Time, and Units (1–100).";
        return;
      }

      errEl.textContent = "";
      btn.disabled = true;
      btn.textContent = "Submitting Requirement...";

      try {
        await global.PBSN_SVC.submitDepartmentBloodRequest(state.profile, {
          ...payload,
          required_datetime: new Date(payload.required_datetime).toISOString()
        });
        document.getElementById("req-patient-ref").value = "";
        document.getElementById("req-notes").value = "";
        global.PBSN_CHROME.showToast("Blood requirement submitted to Supabase.", "success");
        await loadDashboardData();
      } catch (err) {
        errEl.textContent = err.message || "Failed to submit requirement.";
        global.PBSN_CHROME.showToast(err.message, "error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Submit Blood Requirement";
      }
    });

    document.getElementById("hosp-add-dept-form")?.addEventListener("submit", async (e) => {
      e.preventDefault();
      const val = document.getElementById("hosp-new-dept-preset").value;
      if (!val || !state.profile) return;
      const [code, name] = val.split("|");
      try {
        await global.PBSN_SVC.createDepartmentAsHospAdmin(state.profile.hospital_id, {
          department_code: code,
          department_name: name
        });
        global.PBSN_CHROME.showToast(`Added ${name}`, "success");
        await loadDashboardData();
      } catch (err) {
        global.PBSN_CHROME.showToast(err.message, "error");
      }
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    global.PBSN_CHROME.renderSharedChrome();
    const params = new URLSearchParams(window.location.search);

    try {
      const profile = await global.PBSN_SVC.getDepartmentSession();
      if (profile) {
        state.profile = profile;
        state.isDemo = false;
      } else if (params.get("demo") === "1") {
        state.isDemo = true;
        document.getElementById("demo-mode-banner").style.display = "block";
      } else {
        window.location.href = "./hospital-login.html";
        return;
      }

      bindEvents();
      await loadDashboardData();
    } catch (err) {
      global.PBSN_CHROME.showToast(err.message || "Department session error", "error");
      window.location.href = "./hospital-login.html";
    }
  });
})(window);
