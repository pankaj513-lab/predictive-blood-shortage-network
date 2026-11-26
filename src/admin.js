/**
 * PBSN — Supabase-Backed Admin Panel Controller
 * Protected by Supabase Auth + public.admin_users RLS.
 * Manages Reports, Storage Uploads (pbsn-reports & pbsn-images),
 * Blood Requests, Donor/Contact Inquiries, and Blood Inventory.
 */
(function (global) {
  "use strict";

  const ALLOWED_EXTS = [".pdf", ".docx", ".xlsx", ".xls", ".csv", ".png", ".jpg", ".jpeg", ".webp"];
  const IMAGE_EXTS = [".png", ".jpg", ".jpeg", ".webp"];
  const MAX_BYTES = 10 * 1024 * 1024;

  const state = {
    admin: null,
    reports: [],
    bloodRequests: [],
    donorInquiries: [],
    contactInquiries: [],
    inventory: [],
    editor: {
      coverImagePath: null,
      filePath: null,
      fileType: null,
      fileSize: null
    },
    pendingDeleteId: null
  };

  function formatBytes(bytes) {
    if (!bytes && bytes !== 0) return "—";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  }

  function redirectLogin() {
    window.location.href = "./admin-login.html";
  }

  async function refreshAllAdminData() {
    const [reports, inqData, invData] = await Promise.all([
      global.PBSN_SVC.fetchAdminReports(),
      global.PBSN_SVC.fetchAdminInquiriesAndRequests(),
      global.PBSN_SVC.fetchBloodInventory()
    ]);
    state.reports = reports;
    state.bloodRequests = inqData.bloodRequests;
    state.donorInquiries = inqData.donorInquiries;
    state.contactInquiries = inqData.contactInquiries;
    state.inventory = invData;

    renderOverview();
    renderReportsTable();
    renderInquiriesAndRequests();
    renderInventoryManager();
    renderDocumentsTable();
  }

  function renderOverview() {
    const total = state.reports.length;
    const pub = state.reports.filter((r) => r.publication_status === "published").length;
    const drafts = total - pub;
    const docs = state.reports.filter((r) => Boolean(r.file_path)).length;

    document.getElementById("stat-total").textContent = String(total);
    document.getElementById("stat-published").textContent = String(pub);
    document.getElementById("stat-drafts").textContent = String(drafts);
    document.getElementById("stat-docs").textContent = String(docs);

    document.getElementById("side-rep-count").textContent = String(total);
    document.getElementById("side-doc-count").textContent = String(docs);
    document.getElementById("side-inq-count").textContent = String(
      state.bloodRequests.length + state.donorInquiries.length + state.contactInquiries.length
    );
    document.getElementById("side-inv-count").textContent = String(state.inventory.length);

    const counts = {};
    state.reports.forEach((r) => {
      counts[r.category] = (counts[r.category] || 0) + 1;
    });
    const entries = Object.entries(counts);
    const maxC = Math.max(1, ...entries.map((e) => e[1]));
    document.getElementById("admin-category-chart").innerHTML =
      entries.length === 0
        ? `<div class="eyebrow-mono">No reports yet. Click "+ Create Report".</div>`
        : entries
            .map(
              ([cat, n]) => `
        <div>
          <div class="bg-bar-head"><span>${cat}</span><span>${n}</span></div>
          <div class="progress-track"><div class="progress-fill" style="width:${Math.round((n / maxC) * 100)}%;background:#4ea8de;"></div></div>
        </div>`
            )
            .join("");

    const recentItems = [
      ...state.reports.slice(0, 5).map((r) => ({
        title: `Report (${r.publication_status}): ${r.title}`,
        time: new Date(r.updated_at).toLocaleString(),
        sub: r.category
      })),
      ...state.bloodRequests.slice(0, 4).map((b) => ({
        title: `Blood Request ${b.request_reference}: ${b.units_required}u ${b.blood_group}`,
        time: new Date(b.created_at).toLocaleString(),
        sub: `${b.hospital_name} (${b.city})`
      }))
    ];
    document.getElementById("admin-activity-list").innerHTML = recentItems
      .map(
        (item) => `
      <div style="padding:10px 12px;border-radius:8px;border:1px solid var(--line);font-size:0.82rem;">
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <strong>${item.title}</strong>
          <span class="eyebrow-mono">${item.time}</span>
        </div>
        <div style="color:var(--text-muted);margin-top:2px;">${item.sub}</div>
      </div>`
      )
      .join("");
  }

  function getFilteredReports() {
    const q = (document.getElementById("adm-search")?.value || "").trim().toLowerCase();
    const cat = document.getElementById("adm-filter-cat")?.value || "ALL";
    const status = document.getElementById("adm-filter-status")?.value || "ALL";
    const sort = document.getElementById("adm-sort")?.value || "newest";

    let list = state.reports.filter((r) => {
      if (cat !== "ALL" && r.category !== cat) return false;
      if (status !== "ALL" && r.publication_status !== status) return false;
      if (q && !r.title.toLowerCase().includes(q) && !r.description.toLowerCase().includes(q) && !r.region.toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });

    if (sort === "oldest") list.sort((a, b) => a.report_date.localeCompare(b.report_date));
    else if (sort === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    else list.sort((a, b) => b.report_date.localeCompare(a.report_date));
    return list;
  }

  function renderReportsTable() {
    const tbody = document.getElementById("admin-reports-tbody");
    const list = getFilteredReports();
    if (list.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">No reports match the current filters.</td></tr>`;
      return;
    }

    tbody.innerHTML = "";
    list.forEach((rep) => {
      const tr = document.createElement("tr");
      const isPub = rep.publication_status === "published";
      tr.innerHTML = `
        <td>
          <strong>${rep.title}</strong>
          <div class="eyebrow-mono">${rep.region}${rep.file_path ? ` · 📎 ${rep.file_path.split("/").pop()}` : ""}</div>
        </td>
        <td>${rep.category}</td>
        <td>${new Date(rep.created_at).toLocaleDateString()}</td>
        <td>${new Date(rep.updated_at).toLocaleString()}</td>
        <td><span class="badge ${isPub ? "badge-low" : "badge-moderate"}">${isPub ? "Published" : "Draft"}</span></td>
        <td>
          <div style="display:flex;gap:6px;flex-wrap:wrap;">
            <button class="btn btn-ghost btn-sm act-edit">Edit</button>
            <button class="btn btn-ghost btn-sm act-view">View</button>
            <button class="btn ${isPub ? "btn-ghost" : "btn-primary"} btn-sm act-toggle">${isPub ? "Unpublish" : "Publish"}</button>
            <button class="btn btn-red btn-sm act-del">Delete</button>
          </div>
        </td>
      `;
      tr.querySelector(".act-edit").addEventListener("click", () => openEditor(rep));
      tr.querySelector(".act-view").addEventListener("click", () => openAdminViewModal(rep));
      tr.querySelector(".act-toggle").addEventListener("click", () => togglePublish(rep));
      tr.querySelector(".act-del").addEventListener("click", () => promptDelete(rep));
      tbody.appendChild(tr);
    });
  }

  function renderInquiriesAndRequests() {
    const reqBody = document.getElementById("adm-requests-tbody");
    reqBody.innerHTML =
      state.bloodRequests.length === 0
        ? `<tr><td colspan="6">No emergency blood requests logged yet.</td></tr>`
        : state.bloodRequests
            .map(
              (r) => `
          <tr>
            <td><code>${r.request_reference}</code></td>
            <td><strong>${r.blood_group}</strong> · ${r.units_required}u</td>
            <td>${r.hospital_name} (${r.city})</td>
            <td>${r.contact_phone}</td>
            <td><span class="badge ${r.urgency_level.includes("Critical") ? "badge-critical" : "badge-high"}">${r.urgency_level}</span></td>
            <td>
              <select class="control-select req-status-sel" data-id="${r.id}" style="height:30px;font-size:0.78rem;">
                <option value="Pending" ${r.request_status === "Pending" ? "selected" : ""}>Pending</option>
                <option value="Matched" ${r.request_status === "Matched" ? "selected" : ""}>Matched</option>
                <option value="Fulfilled" ${r.request_status === "Fulfilled" ? "selected" : ""}>Fulfilled</option>
              </select>
            </td>
          </tr>`
            )
            .join("");

    reqBody.querySelectorAll(".req-status-sel").forEach((sel) => {
      sel.addEventListener("change", async () => {
        try {
          await global.PBSN_SVC.updateBloodRequestStatus(sel.dataset.id, sel.value);
          global.PBSN_CHROME.showToast("Request status updated in Supabase", "success");
        } catch (err) {
          global.PBSN_CHROME.showToast(err.message, "error");
        }
      });
    });

    document.getElementById("adm-donors-tbody").innerHTML =
      state.donorInquiries.length === 0
        ? `<tr><td colspan="5">No donor inquiries yet.</td></tr>`
        : state.donorInquiries
            .map(
              (d) => `
          <tr>
            <td><strong>${d.donor_name}</strong></td>
            <td>${d.blood_group}</td>
            <td>${d.city}</td>
            <td>${d.phone || d.email || "—"}</td>
            <td><span class="badge ${d.consent_to_contact ? "badge-low" : "badge-moderate"}">${d.consent_to_contact ? "Consented" : "Masked"}</span></td>
          </tr>`
            )
            .join("");

    document.getElementById("adm-contacts-tbody").innerHTML =
      state.contactInquiries.length === 0
        ? `<tr><td colspan="4">No contact inquiries yet.</td></tr>`
        : state.contactInquiries
            .map(
              (c) => `
          <tr>
            <td><strong>${c.name}</strong></td>
            <td>${c.subject}</td>
            <td>${c.email}${c.phone ? ` · ${c.phone}` : ""}</td>
            <td><span class="badge badge-low">${c.inquiry_status}</span></td>
          </tr>`
            )
            .join("");
  }

  function renderInventoryManager() {
    const tbody = document.getElementById("adm-inventory-tbody");
    tbody.innerHTML = "";
    state.inventory.forEach((row) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${row.blood_bank_name}</strong></td>
        <td>${row.city}</td>
        <td><strong>${row.blood_group}</strong></td>
        <td><input type="number" min="0" class="field-input inv-avail" value="${row.available_units}" style="width:90px;height:32px;" /></td>
        <td><input type="number" min="0" class="field-input inv-res" value="${row.reserved_units}" style="width:90px;height:32px;" /></td>
        <td><button class="btn btn-primary btn-sm inv-save-btn">Update</button></td>
      `;
      tr.querySelector(".inv-save-btn").addEventListener("click", async () => {
        const avail = tr.querySelector(".inv-avail").value;
        const resv = tr.querySelector(".inv-res").value;
        try {
          await global.PBSN_SVC.updateInventoryRow(row.id, avail, resv);
          global.PBSN_CHROME.showToast(`Updated ${row.blood_group} at ${row.blood_bank_name}`, "success");
        } catch (err) {
          global.PBSN_CHROME.showToast(err.message, "error");
        }
      });
      tbody.appendChild(tr);
    });
  }

  function renderDocumentsTable() {
    const q = (document.getElementById("doc-search")?.value || "").trim().toLowerCase();
    const docs = state.reports.filter(
      (r) =>
        r.file_path &&
        (!q || r.title.toLowerCase().includes(q) || r.file_path.toLowerCase().includes(q) || (r.file_type || "").toLowerCase().includes(q))
    );
    const tbody = document.getElementById("admin-docs-tbody");
    if (docs.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6">No uploaded report files match your search.</td></tr>`;
      return;
    }
    tbody.innerHTML = "";
    docs.forEach((r) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td><strong>${r.title}</strong></td>
        <td><code>${r.file_path}</code></td>
        <td>${r.file_type || "file"}</td>
        <td>${formatBytes(r.file_size)}</td>
        <td><span class="badge ${r.publication_status === "published" ? "badge-low" : "badge-moderate"}">${r.publication_status}</span></td>
        <td><button class="btn btn-ghost btn-sm dl-btn">Download</button></td>
      `;
      tr.querySelector(".dl-btn").addEventListener("click", async () => {
        try {
          await global.PBSN_SVC.downloadReportStorageFile(r.file_path, r.file_path.split("/").pop());
        } catch (err) {
          global.PBSN_CHROME.showToast(err.message, "error");
        }
      });
      tbody.appendChild(tr);
    });
  }

  function renderEditorPreviews() {
    const coverBox = document.getElementById("cover-preview-box");
    const cUrl = state.editor.coverImagePath || "";
    coverBox.innerHTML = cUrl
      ? `<div class="file-chip">
          <div style="display:flex;align-items:center;gap:10px;">
            <img src="${cUrl}" alt="Cover preview" style="width:48px;height:34px;object-fit:cover;border-radius:4px;" />
            <span>Cover image ready</span>
          </div>
          <button type="button" class="btn btn-ghost btn-sm" id="remove-cover-btn">Remove</button>
        </div>`
      : "";
    document.getElementById("remove-cover-btn")?.addEventListener("click", () => {
      state.editor.coverImagePath = null;
      document.getElementById("cover-preset-select").value = "";
      renderEditorPreviews();
    });

    const docBox = document.getElementById("doc-preview-box");
    docBox.innerHTML = state.editor.filePath
      ? `<div class="file-chip">
          <div>
            <strong>${state.editor.filePath.split("/").pop()}</strong>
            <div class="eyebrow-mono">${formatBytes(state.editor.fileSize)}</div>
          </div>
          <div style="display:flex;gap:6px;">
            <button type="button" class="btn btn-ghost btn-sm" id="dl-editor-doc-btn">Download</button>
            <button type="button" class="btn btn-ghost btn-sm" id="remove-doc-btn">Remove</button>
          </div>
        </div>`
      : "";
    document.getElementById("dl-editor-doc-btn")?.addEventListener("click", async () => {
      await global.PBSN_SVC.downloadReportStorageFile(state.editor.filePath, state.editor.filePath.split("/").pop());
    });
    document.getElementById("remove-doc-btn")?.addEventListener("click", () => {
      state.editor.filePath = null;
      state.editor.fileType = null;
      state.editor.fileSize = null;
      renderEditorPreviews();
    });
  }

  function openEditor(rep = null) {
    document.getElementById("editor-error").textContent = "";
    document.getElementById("editor-heading").textContent = rep ? "Edit Report" : "Create New Report";
    document.getElementById("rep-id").value = rep ? rep.id : "";
    document.getElementById("rep-title").value = rep ? rep.title : "";
    document.getElementById("rep-category").value = rep ? rep.category : "AI Blood Shortage Prediction Reports";
    document.getElementById("rep-desc").value = rep ? rep.description : "";
    document.getElementById("rep-content").value = rep ? (rep.content || "") : "";
    document.getElementById("rep-date").value = rep ? rep.report_date : new Date().toISOString().slice(0, 10);
    document.getElementById("rep-region").value = rep ? rep.region : "New Delhi & Mumbai";
    document.getElementById("rep-group").value = rep ? (rep.blood_group || "N/A") : "N/A";
    document.getElementById("rep-status").value = rep ? rep.publication_status : "draft";
    document.getElementById("cover-preset-select").value =
      rep && rep.cover_image_path && rep.cover_image_path.startsWith("./") ? rep.cover_image_path : "";

    state.editor = {
      coverImagePath: rep ? rep.cover_image_path : null,
      filePath: rep ? rep.file_path : null,
      fileType: rep ? rep.file_type : null,
      fileSize: rep ? rep.file_size : null
    };
    renderEditorPreviews();
    document.getElementById("report-editor-modal").classList.add("open");
  }

  function openAdminViewModal(rep) {
    const modal = document.getElementById("admin-view-modal");
    document.getElementById("adm-view-meta").textContent =
      `${rep.publication_status.toUpperCase()} · ${rep.category} · ${rep.report_date} · ${rep.region}`;
    document.getElementById("adm-view-title").textContent = rep.title;
    document.getElementById("adm-view-desc").textContent = rep.description;
    document.getElementById("adm-view-content").textContent = rep.content || rep.description;

    document.getElementById("adm-view-cover").innerHTML = rep.cover_image_path
      ? `<img src="${rep.cover_image_path}" alt="${rep.title}" style="width:100%;max-height:220px;object-fit:cover;border-radius:10px;border:1px solid var(--line);" />`
      : "";

    const actions = document.getElementById("adm-view-actions");
    actions.innerHTML = "";
    if (rep.file_path) {
      const dlBtn = document.createElement("button");
      dlBtn.className = "btn btn-red btn-sm";
      dlBtn.textContent = `Download ${rep.file_path.split("/").pop()}`;
      dlBtn.addEventListener("click", () => global.PBSN_SVC.downloadReportStorageFile(rep.file_path, rep.file_path.split("/").pop()));
      actions.appendChild(dlBtn);
    }
    const editBtn = document.createElement("button");
    editBtn.className = "btn btn-ghost btn-sm";
    editBtn.textContent = "Edit Report";
    editBtn.addEventListener("click", () => {
      modal.classList.remove("open");
      openEditor(rep);
    });
    actions.appendChild(editBtn);

    modal.classList.add("open");
  }

  async function togglePublish(rep) {
    const next = rep.publication_status === "published" ? "draft" : "published";
    try {
      await global.PBSN_SVC.updateReport(rep.id, { publication_status: next });
      global.PBSN_CHROME.showToast(`Report ${next === "published" ? "published to public site" : "moved to drafts"}`, "success");
      await refreshAllAdminData();
    } catch (err) {
      global.PBSN_CHROME.showToast(err.message, "error");
    }
  }

  function promptDelete(rep) {
    state.pendingDeleteId = rep.id;
    document.getElementById("delete-confirm-text").textContent =
      `Are you sure you want to permanently delete "${rep.title}"?`;
    document.getElementById("delete-confirm-modal").classList.add("open");
  }

  function bindDropzone(zoneEl, inputEl, bucket, progressWrap, progressFill, onUploaded) {
    const handleFiles = async (files) => {
      const file = files && files[0];
      if (!file) return;
      const ext = "." + (file.name.split(".").pop() || "").toLowerCase();
      if (!ALLOWED_EXTS.includes(ext)) {
        document.getElementById("editor-error").textContent = "Unsupported file type.";
        return;
      }
      if (bucket === "pbsn-images" && !IMAGE_EXTS.includes(ext)) {
        document.getElementById("editor-error").textContent = "Cover image must be PNG, JPG, JPEG, or WEBP.";
        return;
      }
      if (file.size === 0 || file.size > MAX_BYTES) {
        document.getElementById("editor-error").textContent = "File must be under 10 MB.";
        return;
      }

      progressWrap.style.display = "block";
      progressFill.style.width = "35%";
      try {
        const uploaded = await global.PBSN_SVC.uploadStorageFile(bucket, file);
        progressFill.style.width = "100%";
        onUploaded(uploaded);
        global.PBSN_CHROME.showToast(`Uploaded ${file.name} to Supabase Storage`, "success");
      } catch (err) {
        document.getElementById("editor-error").textContent = err.message;
        global.PBSN_CHROME.showToast(err.message, "error");
      } finally {
        setTimeout(() => {
          progressWrap.style.display = "none";
          progressFill.style.width = "0%";
        }, 450);
      }
    };

    zoneEl.addEventListener("dragover", (e) => {
      e.preventDefault();
      zoneEl.classList.add("dragover");
    });
    zoneEl.addEventListener("dragleave", () => zoneEl.classList.remove("dragover"));
    zoneEl.addEventListener("drop", (e) => {
      e.preventDefault();
      zoneEl.classList.remove("dragover");
      handleFiles(e.dataTransfer.files);
    });
    inputEl.addEventListener("change", () => {
      handleFiles(inputEl.files);
      inputEl.value = "";
    });
  }

  function switchView(viewName) {
    document.querySelectorAll(".admin-nav-btn[data-view]").forEach((b) => {
      b.classList.toggle("active", b.dataset.view === viewName);
    });
    document.querySelectorAll(".admin-view").forEach((v) => {
      v.classList.toggle("active", v.id === `view-${viewName}`);
    });
  }

  function initEvents() {
    document.querySelectorAll(".admin-nav-btn[data-view]").forEach((btn) => {
      btn.addEventListener("click", () => switchView(btn.dataset.view));
    });
    document.getElementById("side-create-btn").addEventListener("click", () => openEditor(null));
    document.getElementById("top-create-report-btn").addEventListener("click", () => openEditor(null));
    document.getElementById("close-editor-btn").addEventListener("click", () => document.getElementById("report-editor-modal").classList.remove("open"));
    document.getElementById("cancel-editor-btn").addEventListener("click", () => document.getElementById("report-editor-modal").classList.remove("open"));
    document.getElementById("close-adm-view").addEventListener("click", () => document.getElementById("admin-view-modal").classList.remove("open"));
    document.getElementById("cancel-delete-btn").addEventListener("click", () => document.getElementById("delete-confirm-modal").classList.remove("open"));

    document.getElementById("confirm-delete-btn").addEventListener("click", async () => {
      if (!state.pendingDeleteId) return;
      try {
        await global.PBSN_SVC.deleteReport(state.pendingDeleteId);
        document.getElementById("delete-confirm-modal").classList.remove("open");
        global.PBSN_CHROME.showToast("Report deleted from Supabase", "info");
        await refreshAllAdminData();
      } catch (err) {
        global.PBSN_CHROME.showToast(err.message, "error");
      }
    });

    document.getElementById("cover-browse-btn").addEventListener("click", () => document.getElementById("cover-file-input").click());
    document.getElementById("doc-browse-btn").addEventListener("click", () => document.getElementById("doc-file-input").click());
    document.getElementById("cover-preset-select").addEventListener("change", (e) => {
      if (e.target.value) {
        state.editor.coverImagePath = e.target.value;
        renderEditorPreviews();
      }
    });

    bindDropzone(
      document.getElementById("cover-dropzone"),
      document.getElementById("cover-file-input"),
      "pbsn-images",
      document.getElementById("cover-progress"),
      document.getElementById("cover-progress-fill"),
      (up) => {
        state.editor.coverImagePath = up.publicUrl;
        document.getElementById("cover-preset-select").value = "";
        renderEditorPreviews();
      }
    );

    bindDropzone(
      document.getElementById("doc-dropzone"),
      document.getElementById("doc-file-input"),
      "pbsn-reports",
      document.getElementById("doc-progress"),
      document.getElementById("doc-progress-fill"),
      (up) => {
        state.editor.filePath = up.file_path;
        state.editor.fileType = up.file_type;
        state.editor.fileSize = up.file_size;
        renderEditorPreviews();
      }
    );

    const form = document.getElementById("report-editor-form");
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (form.dataset.saving === "true") return;

      const errEl = document.getElementById("editor-error");
      const saveBtn = document.getElementById("save-report-btn");
      const rid = document.getElementById("rep-id").value;

      const payload = {
        title: document.getElementById("rep-title").value.trim(),
        category: document.getElementById("rep-category").value,
        description: document.getElementById("rep-desc").value.trim(),
        content: document.getElementById("rep-content").value.trim(),
        report_date: document.getElementById("rep-date").value,
        region: document.getElementById("rep-region").value.trim(),
        blood_group: document.getElementById("rep-group").value,
        publication_status: document.getElementById("rep-status").value,
        cover_image_path: state.editor.coverImagePath,
        file_path: state.editor.filePath,
        file_type: state.editor.fileType,
        file_size: state.editor.fileSize
      };

      if (payload.title.length < 3 || payload.description.length < 5 || payload.content.length < 10) {
        errEl.textContent = "Please fill out title, short description, and report content.";
        return;
      }

      errEl.textContent = "";
      form.dataset.saving = "true";
      saveBtn.disabled = true;
      saveBtn.textContent = "Saving...";

      try {
        if (rid) await global.PBSN_SVC.updateReport(rid, payload);
        else await global.PBSN_SVC.createReport(payload);
        document.getElementById("report-editor-modal").classList.remove("open");
        global.PBSN_CHROME.showToast(`Report ${rid ? "updated" : "created"} in Supabase`, "success");
        await refreshAllAdminData();
        switchView("reports");
      } catch (err) {
        errEl.textContent = err.message;
        global.PBSN_CHROME.showToast(err.message, "error");
      } finally {
        form.dataset.saving = "false";
        saveBtn.disabled = false;
        saveBtn.textContent = "Save Report";
      }
    });

    ["adm-search", "adm-filter-cat", "adm-filter-status", "adm-sort"].forEach((id) => {
      document.getElementById(id)?.addEventListener("input", renderReportsTable);
      document.getElementById(id)?.addEventListener("change", renderReportsTable);
    });
    document.getElementById("doc-search")?.addEventListener("input", renderDocumentsTable);

    document.getElementById("admin-logout-btn").addEventListener("click", async () => {
      await global.PBSN_SVC.signOutAdmin();
      redirectLogin();
    });
  }

  document.addEventListener("DOMContentLoaded", async () => {
    global.PBSN_CHROME.renderSharedChrome();
    try {
      const admin = await global.PBSN_SVC.getAdminSession();
      if (!admin) return redirectLogin();
      state.admin = admin;
      document.getElementById("admin-user-name").textContent = admin.full_name;
      document.getElementById("admin-user-email").textContent = admin.email;
      initEvents();
      await refreshAllAdminData();
    } catch (err) {
      global.PBSN_CHROME.showToast(err.message || "Authentication check failed", "error");
      redirectLogin();
    }
  });
})(window);
