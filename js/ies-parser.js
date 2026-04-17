'use strict';

/**
 * IES Photometric File Parser
 * Supports IESNA LM-63 (1986, 1991, 1995, 2002) and older IES formats
 * Type A, B, and C photometry
 */
const IESParser = {

  /**
   * Parse an IES file from its text content.
   * Returns a data object with all photometric information and calculated metrics.
   */
  parse(text, filename) {
    const data = {
      filename: filename || 'Unknown',
      raw: text,
      format: 'Unknown',
      keywords: {},
      tilt: 'NONE',
      tiltData: null,
      // Photometric parameters
      numLamps: 1,
      lumensPerLamp: -1,
      candelaMultiplier: 1,
      numVertAngles: 0,
      numHorizAngles: 0,
      photometricType: 1,   // 1=C, 2=B, 3=A
      unitsType: 2,         // 1=feet, 2=meters
      luminaireWidth: 0,
      luminaireLength: 0,
      luminaireHeight: 0,
      ballastFactor: 1,
      futureUse: 1,
      inputWatts: 0,
      vertAngles: [],
      horizAngles: [],
      candela: [],          // [horizIdx][vertIdx] = cd value
      // Calculated metrics
      totalLumens: 0,
      reportedLumens: null,
      efficacy: 0,
      peakCandela: 0,
      peakVertAngle: 0,
      nadirCandela: 0,
      beamAngle: 0,
      fieldAngle: 0,
      percentUpward: 0,
      percentDownward: 100,
      cieClass: '',
      errors: [],
      warnings: []
    };

    try {
      const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
      let lineIdx = 0;

      // --- Parse format header ---
      const firstLine = lines[0] ? lines[0].trim() : '';
      if (firstLine.startsWith('IESNA') || firstLine.startsWith('IES')) {
        data.format = firstLine;
        lineIdx = 1;
      }

      // --- Parse keyword lines ---
      while (lineIdx < lines.length) {
        const line = lines[lineIdx].trim();

        if (line === '' || line.startsWith('#')) {
          lineIdx++;
          continue;
        }

        if (line.startsWith('[')) {
          // Keyword line: [KEYWORD] value
          const match = line.match(/^\[([^\]]+)\]\s*(.*)/);
          if (match) {
            const key = match[1].trim().toUpperCase();
            const val = match[2].trim();
            data.keywords[key] = data.keywords[key]
              ? data.keywords[key] + ' ' + val
              : val;
          }
          lineIdx++;
          continue;
        }

        if (line.toUpperCase().startsWith('TILT=')) {
          data.tilt = line.substring(5).trim().toUpperCase();
          lineIdx++;

          if (data.tilt === 'INCLUDE') {
            // Tilt data follows: geometry, count, angles, multipliers
            const geometry = parseInt(lines[lineIdx++] || '1', 10);
            const numTiltAngles = parseInt(lines[lineIdx++] || '0', 10);

            // Collect all tilt tokens
            const tiltTokens = [];
            while (tiltTokens.length < numTiltAngles * 2 && lineIdx < lines.length) {
              const parts = (lines[lineIdx++] || '').trim().split(/\s+/);
              for (const p of parts) {
                if (p !== '' && !isNaN(Number(p))) tiltTokens.push(Number(p));
              }
            }

            const tiltAngles = tiltTokens.slice(0, numTiltAngles);
            const tiltFactors = tiltTokens.slice(numTiltAngles, numTiltAngles * 2);
            data.tiltData = { geometry, tiltAngles, tiltFactors };
          } else if (data.tilt !== 'NONE') {
            // External tilt file - we ignore it but warn
            data.warnings.push(`TILT file reference "${data.tilt}" not supported; assuming no tilt.`);
          }
          break;
        }

        // Unrecognized line before TILT — skip
        lineIdx++;
      }

      // --- Collect all remaining numeric tokens ---
      const tokens = [];
      for (let i = lineIdx; i < lines.length; i++) {
        const line = lines[i].trim();
        if (line.startsWith('#')) continue;
        // Split on whitespace and commas
        const parts = line.split(/[\s,]+/);
        for (const p of parts) {
          if (p === '') continue;
          const n = Number(p);
          if (!isNaN(n)) tokens.push(n);
        }
      }

      if (tokens.length < 13) {
        data.errors.push(`Insufficient photometric data (found ${tokens.length} values, need at least 13).`);
        return data;
      }

      // --- Line 1: Photometric parameters ---
      let ti = 0;
      data.numLamps         = tokens[ti++];
      data.lumensPerLamp    = tokens[ti++];
      data.candelaMultiplier = tokens[ti++];
      data.numVertAngles    = tokens[ti++];
      data.numHorizAngles   = tokens[ti++];
      data.photometricType  = tokens[ti++];
      data.unitsType        = tokens[ti++];
      data.luminaireWidth   = tokens[ti++];
      data.luminaireLength  = tokens[ti++];
      data.luminaireHeight  = tokens[ti++];

      // --- Line 2: Electrical parameters ---
      data.ballastFactor    = tokens[ti++];
      data.futureUse        = tokens[ti++];
      data.inputWatts       = tokens[ti++];

      // Validate counts
      if (data.numVertAngles < 1 || data.numHorizAngles < 1) {
        data.errors.push('Invalid angle counts.');
        return data;
      }

      // --- Vertical angles ---
      for (let i = 0; i < data.numVertAngles; i++) {
        if (ti >= tokens.length) {
          data.errors.push('File truncated while reading vertical angles.');
          return data;
        }
        data.vertAngles.push(tokens[ti++]);
      }

      // --- Horizontal angles ---
      for (let i = 0; i < data.numHorizAngles; i++) {
        if (ti >= tokens.length) {
          data.errors.push('File truncated while reading horizontal angles.');
          return data;
        }
        data.horizAngles.push(tokens[ti++]);
      }

      // --- Candela values ---
      // Arranged as: for each horizontal angle, all vertical angles
      for (let h = 0; h < data.numHorizAngles; h++) {
        data.candela.push([]);
        for (let v = 0; v < data.numVertAngles; v++) {
          const raw = ti < tokens.length ? tokens[ti++] : 0;
          data.candela[h].push(raw * data.candelaMultiplier);
        }
      }

      if (ti < tokens.length) {
        data.warnings.push(`${tokens.length - ti} extra tokens at end of file (ignored).`);
      }

      // --- Calculate all derived metrics ---
      this._calculateMetrics(data);

    } catch (err) {
      data.errors.push('Unexpected parse error: ' + err.message);
    }

    return data;
  },

  // ─── Metric Calculations ───────────────────────────────────────────────────

  _calculateMetrics(data) {
    if (!data.candela.length || !data.vertAngles.length) return;

    // Peak candela and peak vertical angle
    data.peakCandela = 0;
    data.peakVertAngle = 0;
    for (let h = 0; h < data.candela.length; h++) {
      for (let v = 0; v < data.candela[h].length; v++) {
        if (data.candela[h][v] > data.peakCandela) {
          data.peakCandela = data.candela[h][v];
          data.peakVertAngle = data.vertAngles[v];
        }
      }
    }

    // Nadir candela (at 0° vertical angle)
    const nadirIdx = data.vertAngles.indexOf(0);
    if (nadirIdx >= 0) {
      // Average over all horizontal planes
      let sum = 0;
      for (const plane of data.candela) sum += plane[nadirIdx];
      data.nadirCandela = sum / data.candela.length;
    }

    // Total lumens via zonal integration
    data.totalLumens = this._zonalLumens(data, 0, 180);

    // Reported lumens (from file, if specified)
    if (data.lumensPerLamp > 0 && data.numLamps > 0) {
      data.reportedLumens = data.lumensPerLamp * data.numLamps;
    }

    // Efficacy
    data.efficacy = data.inputWatts > 0 ? data.totalLumens / data.inputWatts : 0;

    // Beam and field angles
    const angles = this._calculateBeamAngles(data);
    data.beamAngle  = angles.beamAngle;
    data.fieldAngle = angles.fieldAngle;

    // Flux distribution
    const downLumens = this._zonalLumens(data, 0, 90);
    const upLumens   = this._zonalLumens(data, 90, 180);
    const total = downLumens + upLumens;
    if (total > 0) {
      data.percentDownward = (downLumens / total) * 100;
      data.percentUpward   = (upLumens   / total) * 100;
    }

    data.cieClass = this._getCIEClass(data.percentUpward);
  },

  /**
   * Zonal lumen calculation using trapezoidal integration.
   * Handles both symmetric (1 C-plane) and multi-plane distributions.
   *
   * For vertical angles measured from nadir (0° = down):
   *   Ω_zone = 2π × (cos θ₁ − cos θ₂)   [for a full revolution]
   *   Φ_zone = I_avg × Ω_zone
   */
  _zonalLumens(data, fromDeg, toDeg) {
    const { vertAngles, horizAngles, candela, numHorizAngles } = data;
    let totalFlux = 0;

    if (numHorizAngles === 1) {
      // Rotationally symmetric
      for (let v = 0; v < vertAngles.length - 1; v++) {
        const a1 = vertAngles[v];
        const a2 = vertAngles[v + 1];
        if (a2 <= fromDeg || a1 >= toDeg) continue;

        // Clamp to requested range
        const lo = Math.max(a1, fromDeg);
        const hi = Math.min(a2, toDeg);

        // Interpolate candela at clamped bounds
        const cdLo = this._interpCandela(vertAngles, candela[0], lo);
        const cdHi = this._interpCandela(vertAngles, candela[0], hi);
        const cdAvg = (cdLo + cdHi) / 2;

        const t1 = lo * Math.PI / 180;
        const t2 = hi * Math.PI / 180;
        totalFlux += cdAvg * 2 * Math.PI * (Math.cos(t1) - Math.cos(t2));
      }
    } else {
      // Multiple C-planes
      const maxHoriz = horizAngles[horizAngles.length - 1];
      // Symmetry: 0-90° → ×4, 0-180° → ×2, 0-360° → ×1
      let symFactor = 1;
      if (maxHoriz <= 90)       symFactor = 4;
      else if (maxHoriz <= 180) symFactor = 2;

      for (let h = 0; h < numHorizAngles - 1; h++) {
        const dPhi = (horizAngles[h + 1] - horizAngles[h]) * Math.PI / 180;

        for (let v = 0; v < vertAngles.length - 1; v++) {
          const a1 = vertAngles[v];
          const a2 = vertAngles[v + 1];
          if (a2 <= fromDeg || a1 >= toDeg) continue;

          const lo = Math.max(a1, fromDeg);
          const hi = Math.min(a2, toDeg);
          const t  = (lo - a1) / (a2 - a1); // interpolation factor

          // Bilinear interpolation of candela at zone corners
          const c00 = candela[h][v];
          const c01 = candela[h][v + 1];
          const c10 = candela[h + 1][v];
          const c11 = candela[h + 1][v + 1];
          const cdAvg = (c00 + c01 + c10 + c11) / 4;

          const t1 = lo * Math.PI / 180;
          const t2 = hi * Math.PI / 180;
          totalFlux += cdAvg * dPhi * (Math.cos(t1) - Math.cos(t2));
        }
      }
      totalFlux *= symFactor;
    }

    return Math.abs(totalFlux);
  },

  _interpCandela(angles, values, targetAngle) {
    for (let i = 0; i < angles.length - 1; i++) {
      if (angles[i] <= targetAngle && targetAngle <= angles[i + 1]) {
        const t = (targetAngle - angles[i]) / (angles[i + 1] - angles[i]);
        return values[i] + t * (values[i + 1] - values[i]);
      }
    }
    return values[values.length - 1];
  },

  _calculateBeamAngles(data) {
    // Use the C-plane that contains the peak candela
    let peakPlaneIdx = 0;
    let peakCd = 0;
    for (let h = 0; h < data.candela.length; h++) {
      const max = Math.max(...data.candela[h]);
      if (max > peakCd) { peakCd = max; peakPlaneIdx = h; }
    }

    const plane      = data.candela[peakPlaneIdx];
    const vertAngles = data.vertAngles;

    // Find index of peak value
    let peakIdx = 0;
    for (let i = 1; i < plane.length; i++) {
      if (plane[i] > plane[peakIdx]) peakIdx = i;
    }

    const beam50 = peakCd * 0.50;
    const field10 = peakCd * 0.10;

    const beamHalf  = this._findHalfAngle(vertAngles, plane, peakIdx, beam50);
    const fieldHalf = this._findHalfAngle(vertAngles, plane, peakIdx, field10);

    return {
      beamAngle:  isFinite(beamHalf)  ? beamHalf  * 2 : 0,
      fieldAngle: isFinite(fieldHalf) ? fieldHalf * 2 : 0
    };
  },

  /**
   * Find the angle from the peak to where values drop below threshold.
   * Returns the half-angle (from peak direction).
   */
  _findHalfAngle(angles, values, peakIdx, threshold) {
    // Search outward (increasing angle)
    for (let i = peakIdx; i < angles.length - 1; i++) {
      if (values[i] >= threshold && values[i + 1] < threshold) {
        const t = (threshold - values[i]) / (values[i + 1] - values[i]);
        return (angles[i] + t * (angles[i + 1] - angles[i])) - angles[peakIdx];
      }
    }
    // If still above threshold at max angle, return max angular extent
    if (values[values.length - 1] >= threshold) {
      return angles[angles.length - 1] - angles[peakIdx];
    }
    return angles[angles.length - 1] - angles[peakIdx];
  },

  _getCIEClass(pctUp) {
    if (pctUp === 0)        return 'Direct (D)';
    if (pctUp < 10)         return 'Predominantly Direct (PD)';
    if (pctUp < 40)         return 'Mixed (M)';
    if (pctUp < 60)         return 'General Diffuse (GD)';
    if (pctUp < 90)         return 'Predominantly Indirect (PI)';
    return 'Indirect (I)';
  },

  // ─── Utility ───────────────────────────────────────────────────────────────

  /** Return a human-readable summary of the photometric type */
  photometricTypeName(type) {
    return { 1: 'Type C', 2: 'Type B', 3: 'Type A' }[type] || 'Unknown';
  },

  /** Return the distribution symmetry inferred from horizontal angles */
  getSymmetryLabel(data) {
    if (data.numHorizAngles === 1) return 'Rotationally Symmetric';
    const max = data.horizAngles[data.horizAngles.length - 1];
    if (max <= 90)  return 'Quadrant Symmetric';
    if (max <= 180) return 'Bilateral Symmetric';
    return 'Full Asymmetric';
  }
};
