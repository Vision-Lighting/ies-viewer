'use strict';

const PLANE_COLORS = ['#3D54E5', '#1b1671', '#16A34A', '#D97706', '#7C3AED', '#0891B2'];
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
    const { ctx, W } = this;
    // Scale all coordinates from the 420×260 canonical layout
    const s       = W / 420;
    const cx      = Math.round(120 * s);
    const cy      = Math.round(122 * s);
    const R       = Math.round(98 * s);
    const PANEL_X = Math.round(252 * s);

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, W, this.H);

    if (!data || !data.peakCandela) return;

    this._drawGrid(cx, cy, R);
    this._drawAngleLabels(cx, cy, R, s);
    this._drawCdLabels(cx, cy, R, data.peakCandela);
    this._drawCurves(cx, cy, R, data, opts.planeIndices ?? null);
    if (opts.coneAngles && opts.coneAngles.length) this._drawCones(cx, cy, R, data, opts.coneAngles);
    this._drawLegend(cx, cy, R, data, opts.planeIndices ?? null, s);
    this._drawStatsPanel(PANEL_X, W, this.H, data, s);
  }

  // ── Grid: rings at 25/50/75/100% + radial lines every 15° ────────────────

  _drawGrid(cx, cy, R) {
    const ctx = this.ctx;

    [0.25, 0.5, 0.75, 1.0].forEach(ratio => {
      ctx.beginPath();
      ctx.arc(cx, cy, R * ratio, 0, 2 * Math.PI);
      ctx.strokeStyle = VISION_NAVY;
      ctx.globalAlpha = ratio === 1.0 ? 0.4 : 0.18;
      ctx.lineWidth   = ratio === 1.0 ? 0.9 : 0.6;
      ctx.stroke();
      ctx.globalAlpha = 1;
    });

    for (let deg = 0; deg <= 90; deg += 15) {
      const rad  = deg * Math.PI / 180;
      const sx   = Math.sin(rad) * R;
      const sy   = Math.cos(rad) * R;
      const isAx = (deg === 0 || deg === 90);
      ctx.strokeStyle = VISION_NAVY;
      ctx.globalAlpha = isAx ? 0.35 : 0.13;
      ctx.lineWidth   = isAx ? 0.7 : 0.5;

      ctx.beginPath();
      ctx.moveTo(cx + sx, cy + sy);
      ctx.lineTo(cx - sx, cy - sy);
      ctx.stroke();

      if (deg > 0 && deg < 90) {
        ctx.beginPath();
        ctx.moveTo(cx - sx, cy + sy);
        ctx.lineTo(cx + sx, cy - sy);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  // ── Angle labels at grid edges ─────────────────────────────────────────────

  _drawAngleLabels(cx, cy, R, s) {
    const ctx = this.ctx;
    const fs  = Math.max(7, Math.round(8.5 * s));
    ctx.fillStyle   = VISION_NAVY;
    ctx.globalAlpha = 0.55;
    ctx.font        = `bold ${fs}px 'Public Sans', Arial, sans-serif`;

    ctx.textAlign    = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText('90°', cx + R + Math.round(6 * s), cy);

    ctx.textAlign = 'right';
    ctx.fillText('90°', cx - R - Math.round(6 * s), cy);

    ctx.textAlign    = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText('180°', cx, cy - R - Math.round(3 * s));

    ctx.globalAlpha = 1;
  }

  // ── Candela labels on vertical axis (white knockout) ──────────────────────

  _drawCdLabels(cx, cy, R, maxCd) {
    const ctx = this.ctx;
    ctx.font = "bold 9.5px 'Public Sans', Arial, sans-serif";

    [0.25, 0.5, 0.75, 1.0].forEach(ratio => {
      const y   = cy - R * ratio;
      const val = Math.round(maxCd * ratio).toLocaleString();
      const tw  = ctx.measureText(val).width + 8;

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + 2, y - 7, tw, 14);

      ctx.fillStyle    = VISION_NAVY;
      ctx.globalAlpha  = 0.55;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(val, cx + 4, y);
      ctx.globalAlpha  = 1;
    });
  }

  // ── Intensity curves ───────────────────────────────────────────────────────

  _drawCurves(cx, cy, R, data, planeIndices) {
    const maxCd  = data.peakCandela;
    const idxArr = planeIndices != null ? planeIndices : data.candela.map((_, i) => i);

    idxArr.forEach((h, colorIdx) => {
      const plane    = data.candela[h];
      const oppAngle = (data.horizAngles[h] + 180) % 360;
      const oppIdx   = data.horizAngles.indexOf(oppAngle);
      const oppPlane = oppIdx >= 0 ? data.candela[oppIdx] : plane;
      const color    = PLANE_COLORS[colorIdx % PLANE_COLORS.length];

      const rightPts = this._buildPts(data.vertAngles, plane,    maxCd, R, cx, cy, +1);
      const leftPts  = this._buildPts(data.vertAngles, oppPlane, maxCd, R, cx, cy, -1);
      const leftInc  = [...leftPts].reverse();

      this.ctx.beginPath();
      this.ctx.moveTo(cx, cy);
      rightPts.forEach(([x, y]) => this.ctx.lineTo(x, y));
      leftInc.slice(1).forEach(([x, y]) => this.ctx.lineTo(x, y));
      this.ctx.closePath();
      this.ctx.fillStyle   = color;
      this.ctx.globalAlpha = 0.09;
      this.ctx.fill();
      this.ctx.globalAlpha = 1;

      this._polyline(rightPts, cx, cy, color);
      this._polyline(leftPts,  cx, cy, color);

      const [nx, ny] = rightPts[rightPts.length - 1];
      this.ctx.beginPath();
      this.ctx.arc(nx, ny, 3.5, 0, 2 * Math.PI);
      this.ctx.fillStyle   = '#ffffff';
      this.ctx.fill();
      this.ctx.strokeStyle = color;
      this.ctx.lineWidth   = 1.75;
      this.ctx.stroke();
    });
  }

  // ── Horizontal cone curves (maxmax mode) ──────────────────────────────────

  _drawCones(cx, cy, R, data, coneAngles) {
    const ctx   = this.ctx;
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

  // ── Legend: colour lines + C-plane labels, centred below chart ────────────

  _drawLegend(cx, cy, R, data, planeIndices, s) {
    const ctx    = this.ctx;
    const idxArr = planeIndices ?? data.candela.map((_, i) => i);
    const y      = cy + R + Math.round(14 * s);
    const lineLen = Math.round(10 * s);
    const gap     = Math.round(4 * s);
    const itemGap = Math.round(14 * s);
    const fs      = Math.max(6, Math.round(8 * s));

    ctx.font         = `bold ${fs}px 'Public Sans', Arial, sans-serif`;
    ctx.textBaseline = 'middle';

    let totalW = 0;
    idxArr.forEach((h, i) => {
      if (i > 0) totalW += itemGap;
      totalW += lineLen + gap + ctx.measureText(`C${data.horizAngles[h]}°`).width;
    });

    let x = cx - totalW / 2;
    idxArr.forEach((h, colorIdx) => {
      if (colorIdx > 0) x += itemGap;
      const color = PLANE_COLORS[colorIdx % PLANE_COLORS.length];
      const label = `C${data.horizAngles[h]}°`;

      ctx.strokeStyle = color;
      ctx.lineWidth   = 1.8;
      ctx.lineCap     = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + lineLen, y);
      ctx.stroke();

      ctx.fillStyle = VISION_NAVY;
      ctx.textAlign = 'left';
      ctx.fillText(label, x + lineLen + gap, y);
      x += lineLen + gap + ctx.measureText(label).width;
    });
  }

  // ── Stats panel: vertical divider + three labelled stats ──────────────────

  _drawStatsPanel(panelX, W, H, data, s) {
    const ctx  = this.ctx;
    const topY = Math.round(20 * s);
    const botY = Math.round(240 * s);
    const padX = Math.round(14 * s);

    ctx.strokeStyle = VISION_NAVY;
    ctx.globalAlpha = 0.18;
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(panelX, topY);
    ctx.lineTo(panelX, botY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    const stats = [
      { label: 'TOTAL LUMENS',   value: Math.round(data.totalLumens).toLocaleString(), unit: 'lm' },
      { label: 'PEAK INTENSITY', value: Math.round(data.peakCandela).toLocaleString(), unit: 'cd' },
      { label: 'BEAM ANGLE',     value: data.beamAngle.toFixed(0),                     unit: '°'  },
    ];

    const sectionH = (botY - topY) / 3;

    stats.forEach((stat, i) => {
      const y0 = topY + i * sectionH;

      if (i > 0) {
        ctx.strokeStyle = VISION_NAVY;
        ctx.globalAlpha = 0.16;
        ctx.lineWidth   = 0.6;
        ctx.beginPath();
        ctx.moveTo(panelX + padX, y0);
        ctx.lineTo(W - padX, y0);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      ctx.fillStyle    = VISION_NAVY;
      ctx.globalAlpha  = 0.55;
      ctx.font         = `bold ${Math.max(7, Math.round(9 * s))}px 'Public Sans', Arial, sans-serif`;
      ctx.textAlign    = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(stat.label, panelX + padX, y0 + sectionH * 0.165);
      ctx.globalAlpha  = 1;

      const valFs = Math.max(14, Math.round(22 * s));
      ctx.fillStyle    = VISION_NAVY;
      ctx.font         = `bold ${valFs}px Arial, sans-serif`;
      ctx.textBaseline = 'alphabetic';
      const valY = y0 + sectionH * 0.72;
      ctx.fillText(stat.value, panelX + padX, valY);

      const valW = ctx.measureText(stat.value).width;
      ctx.globalAlpha = 0.65;
      ctx.font        = `${Math.max(9, Math.round(11 * s))}px 'Public Sans', Arial, sans-serif`;
      ctx.fillText(stat.unit, panelX + padX + valW + 4, valY);
      ctx.globalAlpha = 1;
    });
  }

  // ── Shared helpers ─────────────────────────────────────────────────────────

  _buildConePoints(data, gamma, maxCd, R, cx, cy) {
    const step = 2;
    const pts  = [];
    for (let phi = 0; phi < 360; phi += step) {
      const cd     = this._intensityAt(data, phi, gamma);
      const r      = (cd / maxCd) * R;
      const phiRad = phi * Math.PI / 180;
      pts.push([cx + r * Math.cos(phiRad), cy + r * Math.sin(phiRad)]);
    }
    return pts;
  }

  _intensityAt(data, phi, gamma) {
    const { horizAngles, vertAngles, candela, numHorizAngles } = data;
    if (numHorizAngles === 1) return IESParser._interpCandela(vertAngles, candela[0], gamma);

    phi = ((phi % 360) + 360) % 360;
    const maxH = horizAngles[horizAngles.length - 1];
    let lp;
    if (maxH <= 90) {
      if      (phi <= 90)  lp = phi;
      else if (phi <= 180) lp = 180 - phi;
      else if (phi <= 270) lp = phi - 180;
      else                 lp = 360 - phi;
    } else if (maxH <= 180) {
      lp = phi <= 180 ? phi : 360 - phi;
    } else {
      lp = phi;
    }

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
    ctx.lineWidth   = 2.25;
    ctx.lineJoin    = 'round';
    ctx.lineCap     = 'round';
    ctx.stroke();
  }

  // ── SVG export ────────────────────────────────────────────────────────────

  exportSVG(data, opts = {}) {
    const W = 420, H = 260;
    const PANEL_X = 252;
    const cx = 120, cy = 122, R = 98;
    const r2 = n => Math.round(n * 100) / 100;
    const els = [];

    const svgLine = (x1, y1, x2, y2, stroke, sw, op) =>
      `<line x1="${r2(x1)}" y1="${r2(y1)}" x2="${r2(x2)}" y2="${r2(y2)}" stroke="${stroke}" stroke-width="${sw}" stroke-opacity="${op}"/>`;

    // Background + panel divider
    els.push(`<rect width="${W}" height="${H}" fill="#ffffff"/>`);
    els.push(svgLine(PANEL_X, 20, PANEL_X, 240, VISION_NAVY, 1, 0.18));

    // Grid rings
    [0.25, 0.5, 0.75, 1.0].forEach(ratio => {
      const sw = ratio === 1.0 ? 0.9 : 0.6;
      const op = ratio === 1.0 ? 0.4 : 0.18;
      els.push(`<circle cx="${cx}" cy="${cy}" r="${r2(R * ratio)}" fill="none" stroke="${VISION_NAVY}" stroke-width="${sw}" stroke-opacity="${op}"/>`);
    });

    // Radial lines every 15°
    for (let deg = 0; deg <= 90; deg += 15) {
      const rad  = deg * Math.PI / 180;
      const sx   = Math.sin(rad) * R;
      const sy   = Math.cos(rad) * R;
      const isAx = (deg === 0 || deg === 90);
      els.push(svgLine(cx + sx, cy + sy, cx - sx, cy - sy, VISION_NAVY, isAx ? 0.7 : 0.5, isAx ? 0.35 : 0.13));
      if (deg > 0 && deg < 90) els.push(svgLine(cx - sx, cy + sy, cx + sx, cy - sy, VISION_NAVY, 0.5, 0.13));
    }

    // Angle labels
    const aLbl = `font-family="'Public Sans', Arial, sans-serif" font-size="8.5" font-weight="700" fill="${VISION_NAVY}" opacity="0.55" letter-spacing="0.6"`;
    els.push(`<text x="${cx + R + 7}" y="${cy}" text-anchor="start" ${aLbl} dominant-baseline="middle">90°</text>`);
    els.push(`<text x="${cx - R - 7}" y="${cy}" text-anchor="end" ${aLbl} dominant-baseline="middle">90°</text>`);
    els.push(`<text x="${cx}" y="${cy - R - 6}" text-anchor="middle" ${aLbl}>180°</text>`);

    // Cd labels (white knockout rect)
    [0.25, 0.5, 0.75, 1.0].forEach(ratio => {
      const y   = cy - R * ratio;
      const val = Math.round(data.peakCandela * ratio).toLocaleString();
      const tw  = val.length * 5.5 + 12;
      els.push(`<rect x="${r2(cx + 4)}" y="${r2(y - 7)}" width="${r2(tw)}" height="14" rx="2" fill="#ffffff"/>`);
      els.push(`<text x="${r2(cx + 7)}" y="${r2(y)}" font-family="'Public Sans', Arial, sans-serif" font-size="9.5" font-weight="700" fill="${VISION_NAVY}" opacity="0.55" letter-spacing="0.3" dominant-baseline="middle">${escSVG(val)}</text>`);
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

      const allPts = [[cx, cy], ...rightPts, ...leftInc.slice(1)];
      els.push(`<polygon points="${allPts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(' ')}" fill="${color}" fill-opacity="0.09"/>`);
      els.push(`<polyline points="${r2(cx)},${r2(cy)} ${ptStr(rightPts)}" fill="none" stroke="${color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>`);
      els.push(`<polyline points="${r2(cx)},${r2(cy)} ${ptStr(leftPts)}"  fill="none" stroke="${color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>`);
      const [nx, ny] = rightPts[rightPts.length - 1];
      els.push(`<circle cx="${r2(nx)}" cy="${r2(ny)}" r="3.5" fill="#ffffff" stroke="${color}" stroke-width="1.75"/>`);
    });

    // Cone curves (maxmax mode)
    if (opts.coneAngles && opts.coneAngles.length) {
      opts.coneAngles.forEach((gamma, i) => {
        const pts = this._buildConePoints(data, gamma, data.peakCandela, R, cx, cy);
        if (pts.length < 3) return;
        const d = pts.map(([x, y], j) => `${j === 0 ? 'M' : 'L'} ${r2(x)} ${r2(y)}`).join(' ') + ' Z';
        els.push(`<path d="${d}" fill="none" stroke="${PLANE_COLORS[i % PLANE_COLORS.length]}" stroke-width="1.5" stroke-dasharray="5,3" opacity="0.75"/>`);
      });
    }

    // Legend centred below polar chart
    const legendY  = cy + R + 12;
    const charW    = 5.2;
    const items    = idxArr.map((h, colorIdx) => ({
      color: PLANE_COLORS[colorIdx % PLANE_COLORS.length],
      label: `C${data.horizAngles[h]}°`,
    }));
    const totalLW  = items.reduce((s, item, i) => s + (i > 0 ? 14 : 0) + 10 + 4 + item.label.length * charW, 0);
    let lx = cx - totalLW / 2;
    items.forEach((item, i) => {
      if (i > 0) lx += 14;
      els.push(`<line x1="${r2(lx)}" y1="${legendY}" x2="${r2(lx + 10)}" y2="${legendY}" stroke="${item.color}" stroke-width="1.8" stroke-linecap="round"/>`);
      els.push(`<text x="${r2(lx + 14)}" y="${legendY + 3}" font-family="'Public Sans', Arial, sans-serif" font-size="8" font-weight="700" fill="${VISION_NAVY}" letter-spacing="0.3">${escSVG(item.label)}</text>`);
      lx += 10 + 4 + item.label.length * charW;
    });

    // Stats panel
    const labelX = PANEL_X + 14;
    const lFont  = `font-family="'Public Sans', Arial, sans-serif" font-size="9" font-weight="700" fill="${VISION_NAVY}" opacity="0.55" letter-spacing="1.4"`;
    const stats  = [
      { label: 'TOTAL LUMENS',   value: Math.round(data.totalLumens).toLocaleString(), unit: 'lm',  labelY: 32,     valueY: 62,     divY: 92.67  },
      { label: 'PEAK INTENSITY', value: Math.round(data.peakCandela).toLocaleString(), unit: 'cd',  labelY: 106.67, valueY: 136.67, divY: 167.33 },
      { label: 'BEAM ANGLE',     value: data.beamAngle.toFixed(0),                     unit: '°',   labelY: 181.33, valueY: 211.33, divY: null   },
    ];

    stats.forEach(stat => {
      if (stat.divY) els.push(svgLine(labelX, stat.divY, W - 14, stat.divY, VISION_NAVY, 0.6, 0.16));
      els.push(`<text x="${labelX}" y="${stat.labelY}" ${lFont}>${escSVG(stat.label)}</text>`);
      els.push(`<text x="${labelX}" y="${stat.valueY}" font-family="'Neulis Neue', 'Public Sans', Arial, sans-serif" font-size="22" font-weight="700" fill="${VISION_NAVY}" letter-spacing="-0.3">${escSVG(stat.value)}<tspan dx="5" font-size="11" font-weight="400" fill-opacity="0.65" letter-spacing="0">${escSVG(stat.unit)}</tspan></text>`);
    });

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
