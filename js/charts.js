'use strict';

const PLANE_COLORS = ['#3D54E5', '#E03434', '#16A34A', '#D97706', '#7C3AED', '#0891B2'];
const VISION_SAND  = '#fee1a7';
const VISION_NAVY  = '#1b1671';

function escSVG(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ─── Polar Chart ──────────────────────────────────────────────────────────────
class PolarChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this._setup();
  }

  _setup() {
    const dpr = window.devicePixelRatio || 1;
    const w   = this.canvas.clientWidth  || this.canvas.width;
    const h   = this.canvas.clientHeight || this.canvas.height;
    this.canvas.width  = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.scale(dpr, dpr);
    this.W = w;
    this.H = h;
  }

  draw(data, opts = {}) {
    const { ctx, W, H } = this;

    const TITLE_H  = 52;
    const INFO_H   = 50;
    const SIDE_PAD = 36;
    const chartH   = H - TITLE_H - INFO_H;
    const R        = Math.min((W - 2 * SIDE_PAD) / 2, chartH / 2) * 0.92;
    const cx       = W / 2;
    const cy       = TITLE_H + chartH / 2;

    // Sand background
    ctx.fillStyle = VISION_SAND;
    ctx.fillRect(0, 0, W, H);

    if (!data || !data.peakCandela) return;

    this._drawTitle(cx, W, data);
    this._drawGrid(cx, cy, R);
    this._drawCdLabels(cx, cy, R, data.peakCandela);
    this._drawCurves(cx, cy, R, data, opts.planeIndices ?? null);
    if (opts.coneAngles && opts.coneAngles.length) this._drawCones(cx, cy, R, data, opts.coneAngles);
    this._drawDivider(SIDE_PAD, W - SIDE_PAD, H - INFO_H);
    this._drawInfoStrip(SIDE_PAD, W - SIDE_PAD, H - INFO_H + 7, data);
  }

  // ── Title + subtitle + top divider ────────────────────────────────────────

  _drawTitle(cx, W, data) {
    const ctx = this.ctx;
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';

    ctx.fillStyle = VISION_NAVY;
    ctx.font      = 'bold 13px Arial, sans-serif';
    ctx.fillText('Polar Intensity Distribution', cx, 10);

    ctx.globalAlpha = 0.7;
    ctx.font        = '9.5px Arial, sans-serif';
    const kw  = data.keywords;
    const sub = [data.filename.replace(/\.ies$/i, ''), kw.LUMINAIRE, kw.LAMP]
      .filter(Boolean).slice(0, 2).join(' · ');
    ctx.fillText(sub, cx, 27);
    ctx.globalAlpha = 1;

    this._drawDivider(36, W - 36, 44);
  }

  // ── Concentric rings + radial lines every 10° ─────────────────────────────

  _drawGrid(cx, cy, R) {
    const ctx = this.ctx;

    // Rings at 25 / 50 / 75 / 100 %
    [0.25, 0.5, 0.75, 1.0].forEach(ratio => {
      ctx.beginPath();
      ctx.arc(cx, cy, R * ratio, 0, 2 * Math.PI);
      ctx.strokeStyle = VISION_NAVY;
      ctx.globalAlpha = 0.6;
      ctx.lineWidth   = 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    // Radial lines every 10°
    // Each angle produces TWO diameters (the ±θ pair), matching the reference SVG
    ctx.lineWidth = 0.5;
    for (let deg = 0; deg <= 90; deg += 10) {
      const rad = deg * Math.PI / 180;
      const sx  = Math.sin(rad) * R;
      const sy  = Math.cos(rad) * R;
      ctx.strokeStyle = VISION_NAVY;
      ctx.globalAlpha = (deg === 0 || deg === 90) ? 0.45 : 0.30;

      // θ line: lower-right ↔ upper-left
      ctx.beginPath();
      ctx.moveTo(cx + sx, cy + sy);
      ctx.lineTo(cx - sx, cy - sy);
      ctx.stroke();

      // −θ mirror: lower-left ↔ upper-right
      if (deg > 0 && deg < 90) {
        ctx.beginPath();
        ctx.moveTo(cx - sx, cy + sy);
        ctx.lineTo(cx + sx, cy - sy);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Candela labels on the vertical axis (above centre) ────────────────────

  _drawCdLabels(cx, cy, R, maxCd) {
    const ctx = this.ctx;
    ctx.font         = '9px Arial, sans-serif';
    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';

    [0.25, 0.5, 0.75, 1.0].forEach(ratio => {
      const y   = cy - R * ratio;           // above centre = toward zenith
      const val = Math.round(maxCd * ratio).toLocaleString();
      const tw  = val.length * 5.5 + 6;

      // Knockout rectangle so the label reads over grid lines
      ctx.fillStyle = VISION_SAND;
      ctx.fillRect(cx + 2, y - 7, tw, 13);

      ctx.fillStyle   = VISION_NAVY;
      ctx.globalAlpha = 0.6;
      ctx.fillText(val, cx + 4, y);
      ctx.globalAlpha = 1;
    });
  }

  // ── Beam-angle annotation: dashed lines + arc + label ─────────────────────

  _drawBeamAngle(cx, cy, R, beamAngle) {
    const ctx     = this.ctx;
    const halfRad = (beamAngle / 2) * Math.PI / 180;
    const arcR    = R * 0.38;

    ctx.strokeStyle = VISION_NAVY;
    ctx.lineWidth   = 1;
    ctx.globalAlpha = 0.55;
    ctx.setLineDash([4, 3]);

    // Dashed lines from centre to each half-beam edge
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.sin(halfRad), cy + R * Math.cos(halfRad));
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - R * Math.sin(halfRad), cy + R * Math.cos(halfRad));
    ctx.stroke();

    // Dashed arc through nadir side
    ctx.setLineDash([3, 3]);
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    // canvas arc: 0 = right, clockwise; π/2 = down (nadir direction)
    ctx.arc(cx, cy, arcR, Math.PI / 2 - halfRad, Math.PI / 2 + halfRad, false);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.globalAlpha = 1;

    // Label
    const label  = beamAngle.toFixed(0) + '°';
    const labelY = cy + arcR + 12;
    const tw     = ctx.measureText(label).width;

    ctx.fillStyle = VISION_SAND;
    ctx.fillRect(cx - tw / 2 - 3, labelY - 7, tw + 6, 13);

    ctx.fillStyle    = VISION_NAVY;
    ctx.globalAlpha  = 0.7;
    ctx.font         = '9.5px Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, cx, labelY);
    ctx.globalAlpha  = 1;
  }

  // ── Intensity curves ───────────────────────────────────────────────────────

  _drawCurves(cx, cy, R, data, planeIndices) {
    const maxCd  = data.peakCandela;
    const idxArr = (planeIndices != null)
      ? planeIndices
      : data.candela.map((_, i) => i);

    idxArr.forEach((h, colorIdx) => {
      const plane    = data.candela[h];
      const oppAngle = (data.horizAngles[h] + 180) % 360;
      const oppIdx   = data.horizAngles.indexOf(oppAngle);
      const oppPlane = oppIdx >= 0 ? data.candela[oppIdx] : plane;
      const color    = PLANE_COLORS[colorIdx % PLANE_COLORS.length];

      // Points in DECREASING angle order so the polyline runs from
      // near-centre (high angle / low cd) → nadir (0° / max cd)
      const rightPts = this._buildPts(data.vertAngles, plane,    maxCd, R, cx, cy, +1);
      const leftPts  = this._buildPts(data.vertAngles, oppPlane, maxCd, R, cx, cy, -1);

      // Filled polygon: centre → right (dec order) → left (inc order) → close
      const leftInc = [...leftPts].reverse();   // inc = 0° → maxAngle on left
      this.ctx.beginPath();
      this.ctx.moveTo(cx, cy);
      rightPts.forEach(([x, y]) => this.ctx.lineTo(x, y));
      leftInc.slice(1).forEach(([x, y]) => this.ctx.lineTo(x, y));
      this.ctx.closePath();
      this.ctx.fillStyle   = color;
      this.ctx.globalAlpha = 0.10;
      this.ctx.fill();
      this.ctx.globalAlpha = 1;

      // Right polyline
      this._polyline(rightPts, cx, cy, color);
      // Left polyline
      this._polyline(leftPts,  cx, cy, color);

      // Nadir dot at last point (0°)
      const [nx, ny] = rightPts[rightPts.length - 1];
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, 4, 0, 2 * Math.PI);
      this.ctx.fillStyle   = VISION_SAND;
      this.ctx.fill();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth   = 2;
      this.ctx.stroke();
    });
  }

  // ── Horizontal cone curves ──────────────────────────────────────────────────

  _drawCones(cx, cy, R, data, coneAngles) {
    const ctx = this.ctx;
    const maxCd = data.peakCandela;

    coneAngles.forEach((gamma, i) => {
      const pts = this._buildConePoints(data, gamma, maxCd, R, cx, cy);
      if (pts.length < 3) return;

      const color = PLANE_COLORS[i % PLANE_COLORS.length];
      ctx.beginPath();
      ctx.moveTo(pts[0][0], pts[0][1]);
      for (let j = 1; j < pts.length; j++) ctx.lineTo(pts[j][0], pts[j][1]);
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.5;
      ctx.globalAlpha = 0.75;
      ctx.setLineDash([5, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;
    });
  }

  /**
   * Build canvas points for a horizontal cone at vertical angle γ.
   * Sweeps all horizontal angles (0–360°, respecting IES symmetry),
   * plotting intensity as the radial distance and horizontal angle as
   * the angular position.  Uses plan-view (top-down) projection:
   *   C0° = top, C90° = right, C180° = bottom, C270° = left.
   */
  _buildConePoints(data, gamma, maxCd, R, cx, cy) {
    const step = 2; // degrees
    const pts  = [];
    for (let phi = 0; phi < 360; phi += step) {
      const cd     = this._intensityAt(data, phi, gamma);
      const r      = (cd / maxCd) * R;
      const phiRad = phi * Math.PI / 180;
      pts.push([cx + r * Math.cos(phiRad), cy + r * Math.sin(phiRad)]);
    }
    return pts;
  }

  /**
   * Interpolate intensity I(φ, γ) from IES data, handling symmetry.
   * φ = horizontal (C-plane) angle, γ = vertical angle.
   */
  _intensityAt(data, phi, gamma) {
    const { horizAngles, vertAngles, candela, numHorizAngles } = data;

    if (numHorizAngles === 1) {
      return IESParser._interpCandela(vertAngles, candela[0], gamma);
    }

    // Normalise φ into 0–360
    phi = ((phi % 360) + 360) % 360;

    // Map φ into the range covered by the file's C-planes
    const maxH = horizAngles[horizAngles.length - 1];
    let lp; // lookup phi
    if (maxH <= 90) {
      // Quadrant symmetric: I(φ) = I(180−φ) = I(180+φ) = I(360−φ)
      if      (phi <= 90)  lp = phi;
      else if (phi <= 180) lp = 180 - phi;
      else if (phi <= 270) lp = phi - 180;
      else                 lp = 360 - phi;
    } else if (maxH <= 180) {
      // Bilateral symmetric: I(φ) = I(360−φ)
      lp = phi <= 180 ? phi : 360 - phi;
    } else {
      lp = phi;
    }

    // Interpolate between the two bracketing horizontal planes
    for (let h = 0; h < horizAngles.length - 1; h++) {
      if (horizAngles[h] <= lp && lp <= horizAngles[h + 1]) {
        const t   = (lp - horizAngles[h]) / (horizAngles[h + 1] - horizAngles[h]);
        const cd1 = IESParser._interpCandela(vertAngles, candela[h], gamma);
        const cd2 = IESParser._interpCandela(vertAngles, candela[h + 1], gamma);
        return cd1 + t * (cd2 - cd1);
      }
    }
    if (lp <= horizAngles[0]) return IESParser._interpCandela(vertAngles, candela[0], gamma);
    return IESParser._interpCandela(vertAngles, candela[candela.length - 1], gamma);
  }

  /** Build canvas points in DECREASING angle order (maxAngle → 0°). */
  _buildPts(vertAngles, candelas, maxCd, R, cx, cy, sign) {
    const pts = [];
    for (let i = vertAngles.length - 1; i >= 0; i--) {
      const rad = vertAngles[i] * Math.PI / 180;
      const r   = (candelas[i] / maxCd) * R;
      pts.push([cx + sign * r * Math.sin(rad), cy + r * Math.cos(rad)]);
    }
    return pts;
  }

  _polyline(pts, cx, cy, color) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    pts.forEach(([x, y]) => ctx.lineTo(x, y));
    ctx.strokeStyle = color;
    ctx.lineWidth   = 2.5;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();
  }

  // ── Divider line ──────────────────────────────────────────────────────────

  _drawDivider(x0, x1, y) {
    const ctx = this.ctx;
    ctx.strokeStyle = VISION_NAVY;
    ctx.globalAlpha = 0.25;
    ctx.lineWidth   = 0.6;
    ctx.beginPath();
    ctx.moveTo(x0, y);
    ctx.lineTo(x1, y);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // ── Info strip ────────────────────────────────────────────────────────────

  _drawInfoStrip(x0, x1, y, data) {
    const ctx  = this.ctx;
    const midX = (x0 + x1) / 2;
    const kw   = data.keywords;

    const product = (kw.LUMCAT || data.filename.replace(/\.ies$/i, '')).substring(0, 26);
    const lumens  = Math.round(data.totalLumens).toLocaleString() + ' lm';
    const peakCd  = Math.round(data.peakCandela).toLocaleString()  + ' cd';
    const beam    = data.beamAngle.toFixed(0) + '°';

    const drawPair = (lx, ly, label, value) => {
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      ctx.font         = '10px Arial, sans-serif';
      ctx.fillStyle    = VISION_NAVY;
      ctx.globalAlpha  = 0.65;
      ctx.fillText(label, lx, ly);
      ctx.globalAlpha  = 1;
      ctx.font         = 'bold 10.5px Arial, sans-serif';
      ctx.fillText(value, lx + ctx.measureText(label).width + 5, ly);
    };

    drawPair(x0 + 4,    y,      'Product',        product);
    drawPair(x0 + 4,    y + 17, 'Total lumens',   lumens);
    drawPair(midX + 4,  y,      'Peak intensity',  peakCd);
    drawPair(midX + 4,  y + 17, 'Beam angle',      beam);
  }

  // ── SVG export ────────────────────────────────────────────────────────────

  exportSVG(data, opts = {}) {
    const W = 420, H = 380;
    const TITLE_H = 52, INFO_H = 50, SIDE_PAD = 36;
    const chartH  = H - TITLE_H - INFO_H;
    const R       = Math.min((W - 2 * SIDE_PAD) / 2, chartH / 2) * 0.92;
    const cx      = W / 2;
    const cy      = TITLE_H + chartH / 2;
    const r2      = n => Math.round(n * 100) / 100;
    const els     = [];

    const svgLine = (x1, y1, x2, y2, stroke, sw, op, dash = '') =>
      `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${stroke}" stroke-width="${sw}" stroke-opacity="${op}"${dash ? ` stroke-dasharray="${dash}"` : ''}/>`;

    // Background
    els.push(`<rect width="${W}" height="${H}" fill="${VISION_SAND}"/>`);

    // Title
    els.push(`<text x="${cx}" y="23" text-anchor="middle" font-family="Arial,sans-serif" font-size="13" font-weight="bold" fill="${VISION_NAVY}">Polar Intensity Distribution</text>`);
    const kw  = data.keywords;
    const sub = [data.filename.replace(/\.ies$/i, ''), kw.LUMINAIRE, kw.LAMP].filter(Boolean).slice(0, 2).join(' · ');
    els.push(`<text x="${cx}" y="40" text-anchor="middle" font-family="Arial,sans-serif" font-size="9.5" fill="${VISION_NAVY}" opacity="0.7">${escSVG(sub)}</text>`);
    els.push(svgLine(36, 44, W - 36, 44, VISION_NAVY, 0.6, 0.25));

    // Grid rings
    [0.25, 0.5, 0.75, 1.0].forEach(ratio => {
      els.push(`<circle cx="${r2(cx)}" cy="${r2(cy)}" r="${r2(R * ratio)}" fill="none" stroke="${VISION_NAVY}" stroke-width="0.6" stroke-opacity="0.6"/>`);
    });

    // Radial lines every 10°
    for (let deg = 0; deg <= 90; deg += 10) {
      const rad = deg * Math.PI / 180;
      const sx  = Math.sin(rad) * R;
      const sy  = Math.cos(rad) * R;
      const op  = (deg === 0 || deg === 90) ? 0.45 : 0.30;
      els.push(svgLine(cx + sx, cy + sy, cx - sx, cy - sy, VISION_NAVY, 0.5, op));
      if (deg > 0 && deg < 90) els.push(svgLine(cx - sx, cy + sy, cx + sx, cy - sy, VISION_NAVY, 0.5, op));
    }

    // Cd labels
    [0.25, 0.5, 0.75, 1.0].forEach(ratio => {
      const y   = cy - R * ratio;
      const val = Math.round(data.peakCandela * ratio).toLocaleString();
      const tw  = val.length * 5.5 + 6;
      els.push(`<rect x="${r2(cx + 2)}" y="${r2(y - 7)}" width="${r2(tw)}" height="13" fill="${VISION_SAND}"/>`);
      els.push(`<text x="${r2(cx + 4)}" y="${r2(y + 1)}" font-family="Arial,sans-serif" font-size="9" fill="${VISION_NAVY}" opacity="0.6" dominant-baseline="middle">${escSVG(val)}</text>`);
    });

    // Curves
    const idxArr = opts.planeIndices ?? data.candela.map((_, i) => i);
    idxArr.forEach((h, colorIdx) => {
      const plane    = data.candela[h];
      const oppAngle = (data.horizAngles[h] + 180) % 360;
      const oppIdx   = data.horizAngles.indexOf(oppAngle);
      const oppPlane = oppIdx >= 0 ? data.candela[oppIdx] : plane;
      const color    = PLANE_COLORS[colorIdx % PLANE_COLORS.length];

      const rightPts = this._buildPts(data.vertAngles, plane,    data.peakCandela, R, cx, cy, +1);
      const leftPts  = this._buildPts(data.vertAngles, oppPlane, data.peakCandela, R, cx, cy, -1);
      const leftInc  = [...leftPts].reverse();
      const ptStr    = pts => pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ');

      // Fill
      const allPts = [[cx, cy], ...rightPts, ...leftInc.slice(1)];
      els.push(`<polygon points="${allPts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ')}" fill="${color}" fill-opacity="0.10"/>`);
      // Lines
      els.push(`<polyline points="${r2(cx)},${r2(cy)} ${ptStr(rightPts)}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`);
      els.push(`<polyline points="${r2(cx)},${r2(cy)} ${ptStr(leftPts)}"  fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`);
      // Nadir dot
      const [nx, ny] = rightPts[rightPts.length - 1];
      els.push(`<circle cx="${r2(nx)}" cy="${r2(ny)}" r="4" fill="${VISION_SAND}" stroke="${color}" stroke-width="2"/>`);
    });

    // Cone curves
    if (opts.coneAngles && opts.coneAngles.length) {
      opts.coneAngles.forEach((gamma, i) => {
        const pts = this._buildConePoints(data, gamma, data.peakCandela, R, cx, cy);
        if (pts.length < 3) return;
        const d = pts.map(([x, y], j) => `${j === 0 ? 'M' : 'L'} ${r2(x)} ${r2(y)}`).join(' ') + ' Z';
        els.push(`<path d="${d}" fill="none" stroke="${PLANE_COLORS[i % PLANE_COLORS.length]}" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.75"/>`);
      });
    }

    // Bottom divider
    els.push(svgLine(SIDE_PAD, H - INFO_H, W - SIDE_PAD, H - INFO_H, VISION_NAVY, 0.6, 0.25));

    // Info strip
    const product = (kw.LUMCAT || data.filename.replace(/\.ies$/i, '')).substring(0, 26);
    const iy      = H - INFO_H + 7;
    const midX    = W / 2;
    const infoPair = (lx, ly, label, value) => {
      const lw = label.length * 5.8;
      return `<text x="${r2(lx)}" y="${r2(ly + 9)}" font-family="Arial,sans-serif" font-size="10" fill="${VISION_NAVY}" opacity="0.65">${escSVG(label)}</text>` +
             `<text x="${r2(lx + lw + 5)}" y="${r2(ly + 9)}" font-family="Arial,sans-serif" font-size="10.5" font-weight="bold" fill="${VISION_NAVY}">${escSVG(value)}</text>`;
    };
    els.push(infoPair(SIDE_PAD + 4, iy,      'Product',        (kw.LUMCAT || data.filename.replace(/\.ies$/i, '')).substring(0, 26)));
    els.push(infoPair(SIDE_PAD + 4, iy + 17, 'Total lumens',   Math.round(data.totalLumens).toLocaleString() + ' lm'));
    els.push(infoPair(midX + 4,     iy,      'Peak intensity',  Math.round(data.peakCandela).toLocaleString() + ' cd'));
    els.push(infoPair(midX + 4,     iy + 17, 'Beam angle',      data.beamAngle.toFixed(0) + '°'));

    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">\n${els.join('\n')}\n</svg>`;
  }
}


// ─── Cartesian Chart ──────────────────────────────────────────────────────────
class CartesianChart {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx    = canvas.getContext('2d');
    this._setup();
    this.pT = 16; this.pB = 44; this.pL = 68; this.pR = 20;
  }

  _setup() {
    const dpr = window.devicePixelRatio || 1;
    const w   = this.canvas.clientWidth  || this.canvas.width;
    const h   = this.canvas.clientHeight || this.canvas.height;
    this.canvas.width  = w * dpr;
    this.canvas.height = h * dpr;
    this.ctx.scale(dpr, dpr);
    this.W = w; this.H = h;
  }

  draw(data) {
    const { ctx, W, H, pT, pB, pL, pR } = this;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, H);
    if (!data || !data.peakCandela) return;

    const plotW    = W - pL - pR;
    const plotH    = H - pT - pB;
    const maxAngle = data.vertAngles[data.vertAngles.length - 1] || 180;
    const maxCd    = data.peakCandela;

    this._drawGrid(pL, pT, plotW, plotH, maxAngle, maxCd);
    this._drawLines(pL, pT, plotW, plotH, maxAngle, maxCd, data);
    this._drawAxes(pL, pT, plotW, plotH, maxAngle, maxCd);
  }

  _drawGrid(left, top, W, H, maxAngle, maxCd) {
    const ctx = this.ctx;
    [0.25, 0.5, 0.75, 1.0].forEach(ratio => {
      const y = top + H - H * ratio;
      ctx.beginPath();
      ctx.moveTo(left, y); ctx.lineTo(left + W, y);
      ctx.strokeStyle = ratio === 1 ? '#9ba5bc' : '#e0e5ef';
      ctx.lineWidth   = 1;
      ctx.setLineDash(ratio < 1 ? [4, 4] : []);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle    = '#7a84a0';
      ctx.font         = '10px Arial, sans-serif';
      ctx.textAlign    = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(Math.round(maxCd * ratio).toLocaleString(), left - 6, y);
    });

    [0, 30, 60, 90, 120, 150, 180].filter(a => a <= maxAngle).forEach(deg => {
      const x = left + (deg / maxAngle) * W;
      ctx.beginPath();
      ctx.moveTo(x, top); ctx.lineTo(x, top + H);
      ctx.strokeStyle = (deg === 0 || deg === 90) ? '#9ba5bc' : '#e0e5ef';
      ctx.lineWidth   = 1;
      ctx.setLineDash(deg === 0 ? [] : [4, 4]);
      ctx.stroke();
      ctx.setLineDash([]);
    });
  }

  _drawLines(left, top, W, H, maxAngle, maxCd, data) {
    const ctx = this.ctx;
    for (let h = 0; h < data.numHorizAngles; h++) {
      const color  = PLANE_COLORS[h % PLANE_COLORS.length];
      const plane  = data.candela[h];
      const angles = data.vertAngles;

      // Fill
      ctx.beginPath();
      angles.forEach((a, i) => {
        const x = left + (a / maxAngle) * W;
        const y = top  + H - (plane[i] / maxCd) * H;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.lineTo(left + (angles[angles.length-1] / maxAngle) * W, top + H);
      ctx.lineTo(left, top + H);
      ctx.closePath();
      ctx.fillStyle   = color + '18';
      ctx.fill();

      // Line
      ctx.beginPath();
      angles.forEach((a, i) => {
        const x = left + (a / maxAngle) * W;
        const y = top  + H - (plane[i] / maxCd) * H;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      });
      ctx.strokeStyle = color;
      ctx.lineWidth   = 2;
      ctx.lineJoin    = 'round';
      ctx.stroke();
    }
  }

  _drawAxes(left, top, W, H, maxAngle, maxCd) {
    const ctx = this.ctx;
    ctx.strokeStyle = '#9ba5bc';
    ctx.lineWidth   = 1.5;
    ctx.beginPath();
    ctx.moveTo(left, top); ctx.lineTo(left, top + H); ctx.lineTo(left + W, top + H);
    ctx.stroke();

    ctx.fillStyle    = VISION_NAVY;
    ctx.font         = 'bold 10px Arial, sans-serif';
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'top';
    [0, 30, 60, 90, 120, 150, 180].filter(a => a <= maxAngle).forEach(deg => {
      ctx.fillText(deg + '°', left + (deg / maxAngle) * W, top + H + 6);
    });

    ctx.fillStyle = '#7a84a0';
    ctx.font      = '10px Arial, sans-serif';
    ctx.fillText('Vertical Angle (°)', left + W / 2, top + H + 26);

    ctx.save();
    ctx.translate(left - 50, top + H / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign    = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Intensity (cd)', 0, 0);
    ctx.restore();
  }
}


// ─── Zonal Lumen Table ────────────────────────────────────────────────────────
function renderZonalTable(container, data) {
  if (!data || !data.vertAngles.length) {
    container.innerHTML = '<p style="padding:16px;color:#7a84a0;font-size:12px">No data</p>';
    return;
  }
  const maxV  = data.vertAngles[data.vertAngles.length - 1];
  const zones = [];
  for (let s = 0; s < maxV; s += 10) {
    const e = Math.min(s + 10, maxV);
    zones.push({ s, e, lm: IESParser._zonalLumens(data, s, e) });
  }
  const total = zones.reduce((a, z) => a + z.lm, 0);
  let cum = 0;
  let html = `<table class="zonal-table"><thead><tr>
    <th>Zone</th><th>Lumens (lm)</th><th>%</th><th>Cumulative %</th>
  </tr></thead><tbody>`;
  zones.forEach(z => {
    const pct = total > 0 ? (z.lm / total) * 100 : 0;
    cum += pct;
    html += `<tr><td>${z.s}°–${z.e}°</td><td>${z.lm.toFixed(1)}</td>
      <td>${pct.toFixed(1)}%</td><td>${cum.toFixed(1)}%</td></tr>`;
  });
  html += `</tbody><tfoot><tr>
    <td><strong>Total</strong></td><td><strong>${total.toFixed(1)}</strong></td>
    <td><strong>100%</strong></td><td>—</td>
  </tr></tfoot></table>`;
  container.innerHTML = html;
}
