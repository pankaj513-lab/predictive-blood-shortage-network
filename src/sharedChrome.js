/**
 * PBSN — Shared Header, Navigation, Dark/Light Toggle, Presentation Mode Modal, & Toast System
 */
(function (global) {
  "use strict";

  const NAV_ITEMS = [
    { href: "./index.html", label: "Overview", id: "overview" },
    { href: "./dashboard.html", label: "AI Dashboard", id: "dashboard" },
    { href: "./network.html", label: "Blood Network", id: "network" },
    { href: "./requests-donors.html", label: "Requests & Donors", id: "requests" },
    { href: "./reports.html", label: "Reports", id: "reports" },
    { href: "./about.html", label: "About", id: "about" },
    { href: "./auth.html", label: "Sign In", id: "auth" },
    { href: "./hospital-login.html", label: "Hospital Login", id: "hospital" },
    { href: "./admin-login.html", label: "Admin", id: "admin" }
  ];

  function showToast(message, type = "info") {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "toast-container";
      document.body.appendChild(container);
    }
    const toast = document.createElement("div");
    toast.className = "toast";
    const prefix = type === "error" ? "⚠ " : type === "success" ? "✓ " : "● ";
    toast.textContent = `${prefix}${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 4200);
  }

  function applyStoredTheme() {
    const saved = localStorage.getItem("pbsn_theme");
    if (saved === "light") {
      document.documentElement.classList.add("light-theme");
    }
  }

  function renderSharedChrome() {
    applyStoredTheme();
    const pageId = document.body.dataset.page || "overview";

    const headerMount = document.getElementById("shared-header");
    if (headerMount) {
      const linksHtml = NAV_ITEMS.map(
        (item) => `<a class="nav-item ${item.id === pageId ? "active" : ""}" href="${item.href}">${item.label}</a>`
      ).join("");

      headerMount.innerHTML = `
        <div class="floating-header-wrap">
          <header class="floating-header">
            <div class="nav-bar">
              <a href="./index.html" class="brand">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2C12 2 5 10.2 5 15a7 7 0 0 0 14 0c0-4.8-7-13-7-13Z" fill="#e63946"/>
                  <path d="M12 10v6M9 13h6" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/>
                </svg>
                <span>PBSN</span>
              </a>
              <nav class="nav-links" aria-label="Primary">${linksHtml}</nav>
              <div class="nav-actions">
                <button class="icon-btn" id="presentation-btn" title="2-3 min Hackathon Presentation Guide">
                  <span class="dot-red"></span> Demo Guide
                </button>
                <button class="icon-btn" id="theme-toggle-btn" title="Toggle Dark / Light Mode">◐</button>
                <button class="icon-btn mobile-menu-btn" id="mobile-menu-btn" aria-expanded="false">Menu ▾</button>
                <a class="btn btn-red btn-sm" href="./dashboard.html#predictor">Run AI Prediction</a>
              </div>
            </div>
            <div class="mega-drawer" id="mega-drawer">
              <div class="mega-drawer-inner">
                <div class="mega-grid">
                  <a class="mega-card" href="./index.html"><strong>Overview <span>→</span></strong><span>Hero, Live Demo Preview, &amp; How It Works.</span></a>
                  <a class="mega-card" href="./dashboard.html"><strong>AI Dashboard <span>→</span></strong><span>Regional inventory, charts, &amp; Shortage Predictor.</span></a>
                  <a class="mega-card" href="./network.html"><strong>Blood Network <span>→</span></strong><span>Real hospital map &amp; search.</span></a>
                  <a class="mega-card" href="./reports.html"><strong>Public Reports <span>→</span></strong><span>Published shortage &amp; forecast reports.</span></a>
                  <a class="mega-card" href="./auth.html"><strong>Account Sign In <span>→</span></strong><span>Google OAuth &amp; Email account portal.</span></a>
                  <a class="mega-card" href="./hospital-login.html"><strong>Hospital Login <span>→</span></strong><span>Department portal for blood requests &amp; inventory.</span></a>
                  <a class="mega-card" href="./admin-login.html"><strong>Admin Panel <span>→</span></strong><span>Protected report &amp; document management.</span></a>
                </div>
              </div>
            </div>
          </header>
        </div>

        <!-- Hackathon Presentation Mode Modal -->
        <div class="modal-backdrop" id="presentation-modal" role="dialog" aria-modal="true" aria-label="Hackathon Presentation Mode">
          <div class="modal-card">
            <div class="panel-head">
              <div>
                <div class="eyebrow-mono">2–3 MINUTE HACKATHON JUDGE DEMO</div>
                <h2 class="display-md" style="margin:4px 0 0;">Presentation Mode Guided Flow</h2>
              </div>
              <button class="icon-btn" id="close-presentation-btn">✕ Close</button>
            </div>
            <p class="lead-lg" style="font-size:0.9rem;margin-top:8px;">
              Walk judges through all core innovations of PBSN in under 3 minutes using live interactive demo data:
            </p>
            <div class="guide-steps">
              <div class="guide-step">
                <span><strong>1–2.</strong> Open AI Intelligence Dashboard &amp; inspect regional blood inventory</span>
                <a class="btn btn-ghost btn-sm" href="./dashboard.html">Open Dashboard →</a>
              </div>
              <div class="guide-step">
                <span><strong>3–5.</strong> Select blood group (e.g. O-), run shortage prediction &amp; inspect risk tier</span>
                <a class="btn btn-red btn-sm" href="./dashboard.html#predictor">Run AI Predictor →</a>
              </div>
              <div class="guide-step">
                <span><strong>6.</strong> View real-city hospital map &amp; AI redistribution routes</span>
                <a class="btn btn-ghost btn-sm" href="./network.html">Open Map Network →</a>
              </div>
              <div class="guide-step">
                <span><strong>7.</strong> Send an emergency blood inquiry &amp; verify request queue</span>
                <a class="btn btn-ghost btn-sm" href="./requests-donors.html">Send Inquiry →</a>
              </div>
            </div>
            <div class="eyebrow-mono">ALL DATA SHOWN IS TRANSPARENTLY LABELED AS HACKATHON DEMO DATA</div>
          </div>
        </div>
      `;

      // Bind Presentation Modal & Theme Toggle
      const modal = document.getElementById("presentation-modal");
      document.getElementById("presentation-btn").addEventListener("click", () => modal.classList.add("open"));
      document.getElementById("close-presentation-btn").addEventListener("click", () => modal.classList.remove("open"));
      modal.addEventListener("click", (e) => {
        if (e.target === modal) modal.classList.remove("open");
      });

      document.getElementById("theme-toggle-btn").addEventListener("click", () => {
        const isLight = document.documentElement.classList.toggle("light-theme");
        localStorage.setItem("pbsn_theme", isLight ? "light" : "dark");
        if (global.PBSN_MAP) global.PBSN_MAP.resetBasemap();
        if (global.PBSN_APP_REFRESH) global.PBSN_APP_REFRESH();
        showToast(`Switched to ${isLight ? "Light" : "Dark Navy"} theme`, "info");
      });

      const mobileBtn = document.getElementById("mobile-menu-btn");
      const drawer = document.getElementById("mega-drawer");
      if (mobileBtn && drawer) {
        mobileBtn.addEventListener("click", () => {
          const open = drawer.classList.toggle("open");
          mobileBtn.setAttribute("aria-expanded", String(open));
        });
      }
    }

    const footerMount = document.getElementById("shared-footer");
    if (footerMount) {
      footerMount.innerHTML = `
        <footer>
          <div class="container">
            <div class="footer-lockup">PBSN</div>
            <div class="footer-directory">
              <div>
                <strong style="font-family:var(--font-display);font-size:1rem;">Predictive Blood Shortage Network</strong>
                <p class="lead-lg" style="font-size:0.88rem;margin:0.5rem 0 0.75rem;">
                  Predict Shortages. Connect Donors. Save Lives.
                </p>
                <span class="demo-tag">Illustrative Demo Mode · FastAPI Ready</span>
              </div>
              <div class="footer-col">
                <h4>Platform</h4>
                <ul>
                  <li><a href="./index.html">Landing Overview</a></li>
                  <li><a href="./dashboard.html">AI Dashboard</a></li>
                  <li><a href="./dashboard.html#predictor">Shortage Prediction</a></li>
                </ul>
              </div>
              <div class="footer-col">
                <h4>Network</h4>
                <ul>
                  <li><a href="./network.html">Real Hospital Map</a></li>
                  <li><a href="./requests-donors.html">Emergency Request</a></li>
                  <li><a href="./requests-donors.html#donor-network">Donor Registry</a></li>
                </ul>
              </div>
              <div class="footer-col">
                <h4>Project</h4>
                <ul>
                  <li><a href="./reports.html">Published Reports</a></li>
                  <li><a href="./about.html">About &amp; Mission</a></li>
                  <li><a href="./about.html#team">Team &amp; Contact</a></li>
                </ul>
              </div>
              <div class="footer-col">
                <h4>Administration</h4>
                <ul>
                  <li><a href="./auth.html">Account Sign In / Up</a></li>
                  <li><a href="./user-dashboard.html">User Account Dashboard</a></li>
                  <li><a href="./hospital-login.html">Hospital Login</a></li>
                  <li><a href="./admin-login.html">Admin Login</a></li>
                </ul>
              </div>
            </div>
            <div class="footer-meta">
              <span>© 2026 Predictive Blood Shortage Network (PBSN) · Demo Healthcare Intelligence Platform</span>
              <span>Simulated Data for Hackathon Demonstration — Not Clinical Medical Advice</span>
            </div>
          </div>
        </footer>
      `;
    }
  }

  global.PBSN_CHROME = { renderSharedChrome, showToast };
})(window);
