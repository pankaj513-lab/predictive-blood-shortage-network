/**
 * PBSN — Hero Network Canvas & Sticky 3D Isometric Scrollytelling
 */
(function (global) {
  "use strict";

  function initAnimations() {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // 1. Hero Pointer-Reactive Network Signal Canvas
    const heroCanvas = document.getElementById("hero-canvas");
    const heroEl = document.getElementById("hero");
    if (heroCanvas && heroEl && !reducedMotion) {
      const ctx = heroCanvas.getContext("2d");
      const pointer = { x: 0.5, y: 0.42 };
      const nodes = Array.from({ length: 42 }, () => ({
        x: Math.random(),
        y: Math.random(),
        vx: (Math.random() - 0.5) * 0.0004,
        vy: (Math.random() - 0.5) * 0.0004,
        red: Math.random() < 0.25
      }));

      const resize = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        heroCanvas.width = heroCanvas.clientWidth * dpr;
        heroCanvas.height = heroCanvas.clientHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      window.addEventListener("resize", resize);
      resize();

      heroEl.addEventListener("pointermove", (e) => {
        const rect = heroEl.getBoundingClientRect();
        pointer.x = (e.clientX - rect.left) / rect.width;
        pointer.y = (e.clientY - rect.top) / rect.height;
      });

      const draw = () => {
        const w = heroCanvas.clientWidth;
        const h = heroCanvas.clientHeight;
        ctx.clearRect(0, 0, w, h);

        const grad = ctx.createRadialGradient(pointer.x * w, pointer.y * h, 0, pointer.x * w, pointer.y * h, 260);
        grad.addColorStop(0, "rgba(230, 57, 70, 0.18)");
        grad.addColorStop(1, "rgba(230, 57, 70, 0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, w, h);

        for (let i = 0; i < nodes.length; i++) {
          const a = nodes[i];
          a.x = (a.x + a.vx + 1) % 1;
          a.y = (a.y + a.vy + 1) % 1;
          const ax = a.x * w;
          const ay = a.y * h;

          for (let j = i + 1; j < nodes.length; j++) {
            const b = nodes[j];
            const dx = ax - b.x * w;
            const dy = ay - b.y * h;
            const dist = Math.hypot(dx, dy);
            if (dist < 145) {
              ctx.strokeStyle = a.red || b.red
                ? `rgba(230, 57, 70, ${(1 - dist / 145) * 0.28})`
                : `rgba(78, 168, 222, ${(1 - dist / 145) * 0.2})`;
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(ax, ay);
              ctx.lineTo(b.x * w, b.y * h);
              ctx.stroke();
            }
          }

          ctx.fillStyle = a.red ? "rgba(230, 57, 70, 0.85)" : "rgba(248, 250, 252, 0.5)";
          ctx.beginPath();
          ctx.arc(ax, ay, a.red ? 2.4 : 1.7, 0, Math.PI * 2);
          ctx.fill();
        }
        requestAnimationFrame(draw);
      };
      draw();
    }

    // 2. Sticky 3D Isometric Scrollytelling Canvas
    const scrollyCanvas = document.getElementById("scrolly-canvas");
    const stackEl = document.getElementById("network-stack");
    if (scrollyCanvas && stackEl && !reducedMotion) {
      const sCtx = scrollyCanvas.getContext("2d");
      const spherePts = [];
      const N = 240;
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2;
        const r = Math.sqrt(1 - y * y);
        const th = golden * i;
        spherePts.push({ x: Math.cos(th) * r, y, z: Math.sin(th) * r, hot: i % 15 === 0 });
      }

      const resizeScrolly = () => {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        scrollyCanvas.width = scrollyCanvas.clientWidth * dpr;
        scrollyCanvas.height = scrollyCanvas.clientHeight * dpr;
        sCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      };
      window.addEventListener("resize", resizeScrolly);
      resizeScrolly();

      const projectIso = (x, y, z, cx, cy, s) => [cx + (x - z) * 0.866 * s, cy + ((x + z) * 0.45 - y) * s];
      const drawWireBox = (cx, cy, s, alpha, dashed) => {
        sCtx.save();
        sCtx.strokeStyle = `rgba(248, 250, 252, ${alpha})`;
        sCtx.lineWidth = 1;
        if (dashed) sCtx.setLineDash([4, 5]);
        const c = [
          [-1, -1, -1], [1, -1, -1], [1, 1, -1], [-1, 1, -1],
          [-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]
        ].map(([x, y, z]) => projectIso(x, y, z, cx, cy, s));
        const edges = [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5], [5, 6], [6, 7], [7, 4], [0, 4], [1, 5], [2, 6], [3, 7]];
        sCtx.beginPath();
        edges.forEach(([a, b]) => {
          sCtx.moveTo(c[a][0], c[a][1]);
          sCtx.lineTo(c[b][0], c[b][1]);
        });
        sCtx.stroke();
        sCtx.restore();
      };

      let t = 0;
      const renderScrolly = () => {
        t += 0.008;
        const w = scrollyCanvas.clientWidth;
        const h = scrollyCanvas.clientHeight;
        sCtx.clearRect(0, 0, w, h);

        const rect = stackEl.getBoundingClientRect();
        const scrollable = Math.max(1, stackEl.offsetHeight - window.innerHeight);
        const progress = Math.min(1, Math.max(0, -rect.top / scrollable));

        const mobile = w < 1120;
        const cx = mobile ? w * 0.5 : w * 0.72;
        const cy = mobile ? h * 0.28 : h * 0.52;
        const baseScale = mobile ? 72 : 110;

        const fleetAlpha = Math.max(0, Math.min(1, (progress - 0.52) / 0.35));
        if (fleetAlpha > 0.02) {
          [[-2.5, 0, -1.5], [2.5, 0, -1.5], [-2.5, 0, 1.5], [2.5, 0, 1.5], [0, 0, -3], [0, 0, 3]].forEach(
            ([ox, oy, oz]) => {
              const [px, py] = projectIso(ox, oy, oz, cx, cy, baseScale * 0.9);
              drawWireBox(px, py, baseScale * 0.4, 0.2 * fleetAlpha, true);
              sCtx.save();
              sCtx.strokeStyle = `rgba(230, 57, 70, ${0.42 * fleetAlpha})`;
              sCtx.setLineDash([4, 6]);
              sCtx.beginPath();
              sCtx.moveTo(px, py);
              sCtx.lineTo(cx, cy);
              sCtx.stroke();
              sCtx.restore();
            }
          );
        }

        const slabAlpha = Math.max(0, Math.min(1, (progress - 0.18) / 0.22));
        if (slabAlpha > 0.02) {
          const pts = [
            projectIso(-1.35, -1.15, -1.35, cx, cy, baseScale),
            projectIso(1.35, -1.15, -1.35, cx, cy, baseScale),
            projectIso(1.35, -1.15, 1.35, cx, cy, baseScale),
            projectIso(-1.35, -1.15, 1.35, cx, cy, baseScale)
          ];
          sCtx.strokeStyle = `rgba(78, 168, 222, ${0.48 * slabAlpha})`;
          sCtx.lineWidth = 1.2;
          sCtx.beginPath();
          sCtx.moveTo(pts[0][0], pts[0][1]);
          pts.slice(1).forEach((p) => sCtx.lineTo(p[0], p[1]));
          sCtx.closePath();
          sCtx.stroke();
        }

        if (fleetAlpha > 0.02) drawWireBox(cx, cy, baseScale * 1.12, 0.38 * fleetAlpha, false);

        const cosT = Math.cos(t);
        const sinT = Math.sin(t);
        for (const p of spherePts) {
          const rx = p.x * cosT - p.z * sinT;
          const rz = p.x * sinT + p.z * cosT;
          const depth = (rz + 1) * 0.5;
          const sx = cx + rx * baseScale * 0.82;
          const sy = cy + p.y * baseScale * 0.82;
          sCtx.fillStyle = p.hot
            ? `rgba(230, 57, 70, ${0.5 + 0.5 * depth})`
            : `rgba(248, 250, 252, ${0.18 + 0.72 * depth})`;
          sCtx.fillRect(sx, sy, 2.2, 2.2);
        }
        requestAnimationFrame(renderScrolly);
      };
      renderScrolly();
    }
  }

  global.PBSN_ANIM = { initAnimations };
})(window);
