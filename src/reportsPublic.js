/**
 * PBSN — Public Published Reports Loader (reports.html & index.html preview)
 * Reads published reports exclusively from Supabase (`reports` where publication_status='published')
 * and downloads attachments from Supabase Storage (`pbsn-reports`).
 */
(function (global) {
  "use strict";

  let allPublished = [];

  function resolveCoverUrl(rep) {
    if (!rep.cover_image_path) return "./assets/images/lab-mumbai.jpg";
    if (rep.cover_image_path.startsWith("http") || rep.cover_image_path.startsWith("./")) {
      return rep.cover_image_path;
    }
    return "./assets/images/lab-mumbai.jpg";
  }

  async function downloadReport(rep) {
    if (rep.file_path && global.PBSN_SVC) {
      try {
        await global.PBSN_SVC.downloadReportStorageFile(rep.file_path, rep.file_path.split("/").pop());
        return;
      } catch (err) {
        if (global.PBSN_CHROME) {
          global.PBSN_CHROME.showToast(err.message || "Unable to download report file.", "error");
        }
        return;
      }
    }
    const text = [
      `PREDICTIVE BLOOD SHORTAGE NETWORK (PBSN) — PUBLISHED REPORT`,
      `Title: ${rep.title}`,
      `Category: ${rep.category}`,
      `Date: ${rep.report_date} | Region: ${rep.region} | Blood Group: ${rep.blood_group || "N/A"}`,
      ``,
      `Description:`,
      rep.description,
      ``,
      `Report Content:`,
      rep.content || rep.description
    ].join("\n");
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${rep.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function openReaderModal(rep) {
    const modal = document.getElementById("public-report-modal");
    if (!modal) return;
    document.getElementById("pub-modal-meta").textContent =
      `${rep.category} · ${rep.report_date} · ${rep.region}${rep.blood_group && rep.blood_group !== "N/A" ? ` · Group ${rep.blood_group}` : ""}`;
    document.getElementById("pub-modal-title").textContent = rep.title;
    document.getElementById("pub-modal-desc").textContent = rep.description;
    document.getElementById("pub-modal-content").textContent = rep.content || rep.description;

    const coverEl = document.getElementById("pub-modal-cover");
    const imgUrl = resolveCoverUrl(rep);
    coverEl.innerHTML = imgUrl
      ? `<img src="${imgUrl}" alt="${rep.title}" style="width:100%;max-height:240px;object-fit:cover;border-radius:10px;border:1px solid var(--line);" />`
      : "";

    const actions = document.getElementById("pub-modal-actions");
    actions.innerHTML = "";
    const dlBtn = document.createElement("button");
    dlBtn.className = "btn btn-red btn-sm";
    dlBtn.textContent = rep.file_path ? `Download Attachment (${rep.file_type || "File"})` : "Download Report Brief (.txt)";
    dlBtn.addEventListener("click", () => downloadReport(rep));
    actions.appendChild(dlBtn);

    modal.classList.add("open");
  }

  function renderCards(container, list) {
    if (!container) return;
    if (list.length === 0) {
      container.innerHTML = `<div class="panel">No published reports match your current filter.</div>`;
      return;
    }
    container.innerHTML = "";
    list.forEach((rep) => {
      const card = document.createElement("article");
      card.className = "report-card";
      const imgUrl = resolveCoverUrl(rep);
      card.innerHTML = `
        <div class="report-cover">
          <img src="${imgUrl}" alt="${rep.title}" />
        </div>
        <div class="report-card-body">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="badge badge-low">${rep.category}</span>
            <span class="eyebrow-mono">${rep.report_date}</span>
          </div>
          <h3 class="display-md" style="font-size:1.15rem;margin:2px 0;">${rep.title}</h3>
          <p class="lead-lg" style="font-size:0.86rem;flex:1;">${rep.description}</p>
          <div class="eyebrow-mono">${rep.region}${rep.blood_group && rep.blood_group !== "N/A" ? ` · Group ${rep.blood_group}` : ""}</div>
          <div class="cta-row" style="margin-top:6px;">
            <button class="btn btn-primary btn-sm view-rep-btn">View Report</button>
            <button class="btn btn-ghost btn-sm dl-rep-btn">Download Report</button>
          </div>
        </div>
      `;
      card.querySelector(".view-rep-btn").addEventListener("click", () => openReaderModal(rep));
      card.querySelector(".dl-rep-btn").addEventListener("click", () => downloadReport(rep));
      container.appendChild(card);
    });
  }

  function applyPublicFilters() {
    const grid = document.getElementById("public-reports-grid");
    if (!grid) return;
    const q = (document.getElementById("pub-search")?.value || "").trim().toLowerCase();
    const cat = document.getElementById("pub-cat")?.value || "ALL";
    const filtered = allPublished.filter((r) => {
      if (cat !== "ALL" && r.category !== cat) return false;
      if (q && !r.title.toLowerCase().includes(q) && !r.region.toLowerCase().includes(q) && !(r.blood_group || "").toLowerCase().includes(q)) {
        return false;
      }
      return true;
    });
    renderCards(grid, filtered);
  }

  async function initPublicReports() {
    const grid = document.getElementById("public-reports-grid");
    const homePreview = document.getElementById("home-published-reports");
    if (!grid && !homePreview) return;

    const modal = document.getElementById("public-report-modal");
    const closeBtn = document.getElementById("close-pub-modal");
    if (modal && closeBtn) {
      closeBtn.addEventListener("click", () => modal.classList.remove("open"));
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("open");
      });
    }

    try {
      allPublished = await global.PBSN_SVC.fetchPublishedReports();
    } catch (err) {
      allPublished = [];
      const fallbackMsg = `<div class="panel">Unable to load published reports from Supabase (${err.message}).</div>`;
      if (grid) grid.innerHTML = fallbackMsg;
      if (homePreview) homePreview.innerHTML = fallbackMsg;
      return;
    }

    if (grid) applyPublicFilters();
    if (homePreview) renderCards(homePreview, allPublished.slice(0, 3));

    document.getElementById("pub-search")?.addEventListener("input", applyPublicFilters);
    document.getElementById("pub-cat")?.addEventListener("change", applyPublicFilters);
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (global.PBSN_CHROME && !document.getElementById("shared-header")?.innerHTML) {
      global.PBSN_CHROME.renderSharedChrome();
    }
    initPublicReports();
  });
})(window);
