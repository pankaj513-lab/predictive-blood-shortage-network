/**
 * PBSN — Interactive Geographical Map Module
 * Uses Leaflet.js (OpenStreetMap / CartoDB basemap) when available,
 * and seamlessly falls back to a lat/lng-projected interactive SVG India map if offline.
 */
(function (global) {
  "use strict";

  let leafletMap = null;
  let leafletLayerGroup = null;

  function riskColor(status) {
    if (status === "Critical Risk") return "#e63946";
    if (status === "High Risk") return "#ff6b35";
    if (status === "Moderate Risk") return "#f5a623";
    return "#2ec4b6";
  }

  // Exact lat/lng -> SVG projection for India fallback (bounds: lat 7..36, lng 67..97)
  function projectIndia(lat, lng) {
    const x = ((lng - 67) / (97 - 67)) * 760 + 120;
    const y = ((36 - lat) / (36 - 7)) * 480 + 40;
    return [x, y];
  }

  function renderSvgFallback(container, bankSummaries, transfers, onSelectBank) {
    container.innerHTML = "";
    const ns = "http://www.w3.org/2000/svg";
    const svg = document.createElementNS(ns, "svg");
    svg.setAttribute("viewBox", "0 0 1000 560");
    svg.setAttribute("class", "geo-fallback-svg");

    // Subtle India outline silhouette polygon (lat/lng projected)
    const outlineCoords = [
      [35.2, 74.5], [34.1, 77.8], [31.5, 78.9], [29.8, 80.5], [27.5, 88.2],
      [27.8, 95.8], [24.2, 94.3], [22.0, 88.9], [20.5, 86.9], [16.5, 82.2],
      [13.0, 80.3], [8.1, 77.5], [10.0, 76.2], [15.4, 73.8], [19.1, 72.8],
      [21.6, 69.6], [23.8, 68.5], [27.0, 70.2], [32.4, 74.5]
    ];
    const poly = document.createElementNS(ns, "polygon");
    poly.setAttribute(
      "points",
      outlineCoords.map(([la, ln]) => projectIndia(la, ln).map((n) => n.toFixed(1)).join(",")).join(" ")
    );
    poly.setAttribute("fill", "rgba(255,255,255,0.025)");
    poly.setAttribute("stroke", "rgba(255,255,255,0.16)");
    poly.setAttribute("stroke-width", "1.5");
    svg.appendChild(poly);

    // Transfer arcs
    transfers.slice(0, 5).forEach((t) => {
      const from = bankSummaries.find((s) => s.bank.id === t.fromId)?.bank;
      const to = bankSummaries.find((s) => s.bank.id === t.toId)?.bank;
      if (!from || !to) return;
      const [x1, y1] = projectIndia(from.lat, from.lng);
      const [x2, y2] = projectIndia(to.lat, to.lng);
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2 - 40;
      const path = document.createElementNS(ns, "path");
      path.setAttribute("d", `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`);
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", riskColor(t.urgency));
      path.setAttribute("stroke-width", "2");
      path.setAttribute("class", "transfer-arc");
      svg.appendChild(path);
    });

    // City / Hospital markers
    bankSummaries.forEach((s) => {
      const [x, y] = projectIndia(s.bank.lat, s.bank.lng);
      const color = riskColor(s.status);
      const g = document.createElementNS(ns, "g");
      g.style.cursor = "pointer";
      g.addEventListener("click", () => onSelectBank && onSelectBank(s.bank.id));

      if (s.status === "Critical Risk" || s.status === "High Risk") {
        const pulse = document.createElementNS(ns, "circle");
        pulse.setAttribute("cx", String(x));
        pulse.setAttribute("cy", String(y));
        pulse.setAttribute("r", "16");
        pulse.setAttribute("fill", "none");
        pulse.setAttribute("stroke", color);
        pulse.setAttribute("stroke-width", "1.5");
        pulse.setAttribute("class", "geo-pulse-ring");
        g.appendChild(pulse);
      }

      const c = document.createElementNS(ns, "circle");
      c.setAttribute("cx", String(x));
      c.setAttribute("cy", String(y));
      c.setAttribute("r", "8");
      c.setAttribute("fill", "#080c16");
      c.setAttribute("stroke", color);
      c.setAttribute("stroke-width", "2.6");
      g.appendChild(c);

      const lbl = document.createElementNS(ns, "text");
      lbl.setAttribute("x", String(x));
      lbl.setAttribute("y", String(y + 24));
      lbl.setAttribute("text-anchor", "middle");
      lbl.setAttribute("fill", "#f5f7fb");
      lbl.setAttribute("font-size", "12");
      lbl.setAttribute("font-weight", "600");
      lbl.textContent = `${s.bank.city} (${s.totalUnits}u)`;
      g.appendChild(lbl);

      svg.appendChild(g);
    });

    container.appendChild(svg);
  }

  function renderMap(containerId, bankSummaries, transfers, onSelectBank) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!global.L) {
      renderSvgFallback(container, bankSummaries, transfers, onSelectBank);
      return;
    }

    if (!leafletMap) {
      container.innerHTML = "";
      leafletMap = global.L.map(container, {
        center: [21.2, 79.0],
        zoom: 5,
        scrollWheelZoom: false
      });

      global.L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors",
        maxZoom: 18
      }).addTo(leafletMap);

      leafletLayerGroup = global.L.layerGroup().addTo(leafletMap);
    }

    leafletLayerGroup.clearLayers();

    // Transfer lines
    transfers.slice(0, 5).forEach((t) => {
      const from = bankSummaries.find((s) => s.bank.id === t.fromId)?.bank;
      const to = bankSummaries.find((s) => s.bank.id === t.toId)?.bank;
      if (!from || !to) return;
      global.L.polyline(
        [
          [from.lat, from.lng],
          [to.lat, to.lng]
        ],
        {
          color: riskColor(t.urgency),
          weight: 2.5,
          dashArray: "7 7",
          opacity: 0.85
        }
      )
        .bindTooltip(`AI Transfer: ${t.qty}u ${t.donorGroup} (${t.fromCity} → ${t.toCity}, ${t.distanceKm} km)`)
        .addTo(leafletLayerGroup);
    });

    // Hospital / Blood Bank Markers
    bankSummaries.forEach((s) => {
      const color = riskColor(s.status);
      const marker = global.L.circleMarker([s.bank.lat, s.bank.lng], {
        radius: 9,
        fillColor: color,
        color: "#ffffff",
        weight: 2,
        opacity: 1,
        fillOpacity: 0.9
      }).addTo(leafletLayerGroup);

      marker.bindPopup(`
        <div style="font-family:Inter,sans-serif;min-width:190px;">
          <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.06em;color:#64748b;">${s.bank.city} · ${s.bank.role}</div>
          <strong style="font-size:14px;display:block;margin:3px 0;">${s.bank.name}</strong>
          <div style="font-size:12px;margin-bottom:4px;">Available: <b>${s.totalUnits} units</b> · Min Cover: <b>${s.minCover}d</b></div>
          <div style="font-size:12px;color:${color};font-weight:600;">Status: ${s.status}</div>
          <div style="font-size:11px;color:#64748b;margin-top:4px;">Updated: ${s.bank.lastUpdated}</div>
        </div>
      `);

      marker.on("click", () => {
        if (onSelectBank) onSelectBank(s.bank.id);
      });
    });

    setTimeout(() => {
      if (leafletMap) leafletMap.invalidateSize();
    }, 120);
  }

  function resetBasemap() {
    if (leafletMap) {
      leafletMap.remove();
      leafletMap = null;
      leafletLayerGroup = null;
    }
  }

  global.PBSN_MAP = { renderMap, resetBasemap };
})(window);
