'use strict';

const App = {
  files:      [],
  current:    null,
  polarChart: null,

  // Compare-table sort state
  sortCol: 'filename',
  sortDir: 1,   // 1 = asc, -1 = desc

  // Multi-select state
  selectedFiles:  new Set(),
  lastCheckedIdx: -1,

  // Polar display mode
  polarMode:          '0-90',
  customPlaneIndices: [],
  customConeAngles:   [],

  // ─── Boot ───────────────────────────────────────────────────────────────────

  init() {
    this.polarChart = new PolarChart(document.getElementById('polarCanvas'));

    this._setupUpload();
    this._setupDrop();
    this._setupTabs();
    this._setupExport();
    this._setupCompareSort();
    this._setupTransformDropdown();
    this._setupPolarControls();
    this._setupWindowResize();
  },

  // ─── File Loading ────────────────────────────────────────────────────────────

  _setupUpload() {
    const input = document.getElementById('fileInput');
    ['uploadBtn', 'uploadBtn2'].forEach(id => {
      const btn = document.getElementById(id);
      if (btn) btn.addEventListener('click', () => input.click());
    });
    input.addEventListener('change', e => {
      this._loadFileList(e.target.files);
      e.target.value = '';
    });
  },

  _setupDrop() {
    const sideZone  = document.getElementById('dropZone');
    const emptyRing = document.getElementById('emptyDropRing');

    const hi  = el => el && el.classList.add('drag-active');
    const unhi = el => el && el.classList.remove('drag-active');

    document.addEventListener('dragenter', e => {
      e.preventDefault();
      const emptyVisible = document.getElementById('emptyState').style.display !== 'none';
      if (emptyRing && emptyVisible) hi(emptyRing);
      if (sideZone && sideZone.contains(e.target)) hi(sideZone);
    });

    document.addEventListener('dragover', e => e.preventDefault());

    document.addEventListener('dragleave', e => {
      if (!e.relatedTarget || e.relatedTarget === document.documentElement) {
        unhi(sideZone);
        unhi(emptyRing);
      }
    });

    document.addEventListener('drop', e => {
      e.preventDefault();
      unhi(sideZone);
      unhi(emptyRing);
      if (e.dataTransfer.files.length) this._loadFileList(e.dataTransfer.files);
    });
  },

  _loadFileList(fileList) {
    const iesFiles = Array.from(fileList).filter(f => /\.(ies|ldt)$/i.test(f.name));
    if (!iesFiles.length) { this._toast('No .ies files found.', 'warn'); return; }
    iesFiles.forEach(f => this._readFile(f));
  },

  _readFile(file) {
    const reader = new FileReader();
    reader.onload  = e => this._onLoaded(file.name, file.size, e.target.result);
    reader.onerror = () => this._toast(`Could not read "${file.name}"`, 'error');
    reader.readAsText(file);
  },

  _onLoaded(name, size, text) {
    const data = IESParser.parse(text, name);
    data.filesize = size;
    if (data.errors.length) this._toast(`Parse error in "${name}": ${data.errors[0]}`, 'error');

    const idx = this.files.findIndex(f => f.filename === name);
    if (idx >= 0) this.files[idx] = data; else this.files.push(data);

    this._renderSidebar();
    this._select(data);
  },

  // ─── Sidebar ─────────────────────────────────────────────────────────────────

  _renderSidebar() {
    const list = document.getElementById('fileList');
    list.innerHTML = '';
    document.getElementById('fileCount').textContent = this.files.length;

    if (!this.files.length) {
      list.innerHTML = '<p class="sidebar-empty">No files loaded</p>';
      return;
    }

    this.files.forEach(data => {
      const active = data === this.current;
      const item   = document.createElement('div');
      item.className = 'file-item' + (active ? ' active' : '');
      item.innerHTML = `
        <div class="file-item-icon">⚡</div>
        <div class="file-item-body">
          <div class="file-item-name" title="${data.filename}">${data.filename}</div>
          <div class="file-item-sub">${fmt(data.totalLumens, 0)} lm &nbsp;·&nbsp; ${data.inputWatts} W &nbsp;·&nbsp; ${fmt(data.efficacy, 1)} lm/W</div>
        </div>
        <button class="file-remove" title="Remove">✕</button>
      `;
      item.querySelector('.file-remove').addEventListener('click', e => { e.stopPropagation(); this._remove(data); });
      item.addEventListener('click', () => this._select(data));
      list.appendChild(item);
    });
  },

  _remove(data) {
    this.files = this.files.filter(f => f !== data);
    if (this.current === data) this.current = this.files[0] || null;
    this._renderSidebar();
    if (this.current) this._display(this.current);
    else this._showEmpty();
  },

  // ─── Display ─────────────────────────────────────────────────────────────────

  _select(data) {
    this.current = data;
    this._renderSidebar();
    this._display(data);
  },

  _display(data) {
    document.getElementById('emptyState').style.display  = 'none';
    document.getElementById('fileDisplay').style.display = 'flex';

    document.getElementById('dispFilename').textContent  = data.filename;
    document.getElementById('dispFormat').textContent    = data.format && data.format !== 'Unknown'
      ? data.format.replace('IESNA:', '') : 'IES';
    document.getElementById('dispPhotoType').textContent = IESParser.photometricTypeName(data.photometricType);
    document.getElementById('dispSymmetry').textContent  = IESParser.getSymmetryLabel(data);

    // Banners
    const banners = document.getElementById('banners');
    banners.innerHTML = '';
    data.errors.forEach(msg => {
      const el = document.createElement('div');
      el.className = 'banner banner-error';
      el.textContent = '⚠ ' + msg;
      banners.appendChild(el);
    });

    this._updateMetrics(data);
    this._updateCompareTable();
    this._buildOtherPanel(data);
    this._updateCharts(data);
    this._updateMetadata(data);
    this._updateLegend(data);
  },

  _showEmpty() {
    document.getElementById('emptyState').style.display  = 'flex';
    document.getElementById('fileDisplay').style.display = 'none';
  },

  // ─── Metrics ─────────────────────────────────────────────────────────────────

  _updateMetrics(data) {
    const set = (id, val, dec = 0) => {
      const el = document.getElementById(id);
      if (el) el.textContent = (typeof val === 'number' && isFinite(val)) ? fmt(val, dec) : '—';
    };
    set('mLumens',   data.totalLumens,      0);
    set('mWatts',    data.inputWatts,        1);
    set('mEfficacy', data.efficacy,          1);
    set('mPeakCd',   data.peakCandela,       0);
    set('mNadirCd',  data.nadirCandela,      0);
    set('mBeam',     data.beamAngle,         1);
    set('mField',    data.fieldAngle,        1);
    set('mDown',     data.percentDownward,   1);
    set('mUp',       data.percentUpward,     1);

    const reportedRow = document.getElementById('reportedRow');
    if (data.reportedLumens != null) {
      document.getElementById('mReported').textContent = fmt(data.reportedLumens, 0);
      const diff = ((data.totalLumens - data.reportedLumens) / data.reportedLumens) * 100;
      document.getElementById('mLumenDiff').textContent = (diff >= 0 ? '+' : '') + diff.toFixed(1) + '% vs reported';
      reportedRow.style.display = '';
    } else {
      reportedRow.style.display = 'none';
    }

    document.getElementById('cieClass').textContent    = data.cieClass || '—';
  },

  // ─── Compare Table ───────────────────────────────────────────────────────────

  _setupCompareSort() {
    document.querySelectorAll('#compareTable th[data-col]').forEach(th => {
      th.addEventListener('click', () => {
        const col = th.dataset.col;
        if (this.sortCol === col) {
          this.sortDir *= -1;
        } else {
          this.sortCol = col;
          this.sortDir = 1;
        }
        this._updateCompareTable();
      });
    });
  },

  _updateCompareTable() {
    const info = document.getElementById('compareInfo');
    const body = document.getElementById('compareBody');
    info.textContent = `${this.files.length} file${this.files.length !== 1 ? 's' : ''} loaded`;

    // Update sort indicators
    document.querySelectorAll('#compareTable th').forEach(th => {
      th.classList.remove('sort-asc', 'sort-desc');
      if (th.dataset.col === this.sortCol) {
        th.classList.add(this.sortDir === 1 ? 'sort-asc' : 'sort-desc');
      }
    });

    if (!this.files.length) { body.innerHTML = ''; return; }

    // Sort
    const col = this.sortCol;
    const dir = this.sortDir;
    const sorted = [...this.files].sort((a, b) => {
      const av = col === 'filename' ? a.filename.toLowerCase()
               : col === 'manufac'  ? (a.keywords.MANUFAC || '').toLowerCase()
               : col === 'cieClass' ? (a.cieClass || '')
               : (a[col] ?? 0);
      const bv = col === 'filename' ? b.filename.toLowerCase()
               : col === 'manufac'  ? (b.keywords.MANUFAC || '').toLowerCase()
               : col === 'cieClass' ? (b.cieClass || '')
               : (b[col] ?? 0);
      if (av < bv) return -dir;
      if (av > bv) return  dir;
      return 0;
    });

    // Compute column ranges for heat bars
    const numCols = ['totalLumens','inputWatts','efficacy','peakCandela','nadirCandela','beamAngle','fieldAngle','percentDownward'];
    const ranges = {};
    numCols.forEach(c => {
      const vals = this.files.map(f => f[c] || 0);
      ranges[c] = { min: Math.min(...vals), max: Math.max(...vals) };
    });

    body.innerHTML = sorted.map(data => {
      const active  = data === this.current;
      const checked = this.selectedFiles.has(data.filename) ? 'checked' : '';

      const heatPct = (col, val) => {
        const r = ranges[col];
        if (!r || r.max === r.min) return 0;
        return ((val - r.min) / (r.max - r.min)) * 100;
      };

      const heatCell = (col, val, dec = 1) => `
        <td class="heat-cell" style="position:relative">
          <div class="heat-bar" style="width:${heatPct(col, val)}%"></div>
          <span style="position:relative">${fmt(val, dec)}</span>
        </td>`;

      return `<tr class="${active ? 'row-active' : ''}" data-file="${data.filename}">
        <td class="td-check" data-file="${data.filename}"><input type="checkbox" class="row-cb" data-file="${data.filename}" ${checked}></td>
        <td class="td-filename ${active ? 'row-active' : ''}" title="${data.filename}">${data.filename}</td>
        <td>${data.keywords.MANUFAC || '—'}</td>
        ${heatCell('totalLumens',     data.totalLumens,     0)}
        ${heatCell('inputWatts',      data.inputWatts,      1)}
        ${heatCell('efficacy',        data.efficacy,        1)}
        ${heatCell('peakCandela',     data.peakCandela,     0)}
        ${heatCell('nadirCandela',    data.nadirCandela,    0)}
        ${heatCell('beamAngle',       data.beamAngle,       1)}
        ${heatCell('fieldAngle',      data.fieldAngle,      1)}
        ${heatCell('percentDownward', data.percentDownward, 1)}
        <td>${data.cieClass || '—'}</td>
      </tr>`;
    }).join('');

    // Checkbox click — shift for range, ctrl/normal for toggle
    const checkboxes = [...body.querySelectorAll('.row-cb')];
    checkboxes.forEach((cb, idx) => {
      cb.addEventListener('click', e => {
        e.stopPropagation();
        const fn = cb.dataset.file;
        if (e.shiftKey && this.lastCheckedIdx >= 0) {
          const lo  = Math.min(this.lastCheckedIdx, idx);
          const hi  = Math.max(this.lastCheckedIdx, idx);
          const tgt = cb.checked;
          for (let i = lo; i <= hi; i++) {
            checkboxes[i].checked = tgt;
            if (tgt) this.selectedFiles.add(checkboxes[i].dataset.file);
            else     this.selectedFiles.delete(checkboxes[i].dataset.file);
          }
        } else {
          if (cb.checked) this.selectedFiles.add(fn);
          else            this.selectedFiles.delete(fn);
        }
        this.lastCheckedIdx = idx;
        this._updateSelectAll();
      });
    });

    // Row click (non-checkbox area) → detail view
    body.querySelectorAll('tr').forEach(tr => {
      tr.addEventListener('click', e => {
        if (e.target.closest('.td-check')) return;
        const f = this.files.find(f => f.filename === tr.dataset.file);
        if (f) this._select(f);
      });
    });

    // Select-all checkbox
    const selectAll = document.getElementById('selectAllCb');
    if (selectAll) {
      selectAll.addEventListener('change', e => {
        checkboxes.forEach(cb => {
          cb.checked = e.target.checked;
          if (e.target.checked) this.selectedFiles.add(cb.dataset.file);
          else                  this.selectedFiles.delete(cb.dataset.file);
        });
      });
    }

    this._updateSelectAll();
  },

  _updateSelectAll() {
    const selectAll = document.getElementById('selectAllCb');
    if (!selectAll) return;
    const checkboxes = [...document.querySelectorAll('.row-cb')];
    if (!checkboxes.length) { selectAll.checked = false; selectAll.indeterminate = false; return; }
    const checkedCount = checkboxes.filter(cb => cb.checked).length;
    selectAll.checked       = checkedCount === checkboxes.length;
    selectAll.indeterminate = checkedCount > 0 && checkedCount < checkboxes.length;
  },

  // ─── Charts ─────────────────────────────────────────────────────────────────

  _updateCharts(data) {
    this._resizeCanvas('polarCanvas');
    this.polarChart = new PolarChart(document.getElementById('polarCanvas'));
    this.polarChart.draw(data, this._getPolarOpts(data));
  },

  _resizeCanvas(id) {
    const canvas = document.getElementById(id);
    const rect   = canvas.getBoundingClientRect();
    canvas.width  = rect.width  || canvas.clientWidth;
    canvas.height = rect.height || canvas.clientHeight;
  },

  _setupWindowResize() {
    let t;
    window.addEventListener('resize', () => {
      clearTimeout(t);
      t = setTimeout(() => { if (this.current) this._updateCharts(this.current); }, 200);
    });
  },

  // ─── Legend ─────────────────────────────────────────────────────────────────

  _updateLegend(data) {
    const container = document.getElementById('chartLegend');
    container.innerHTML = '';
    data.horizAngles.forEach((angle, h) => {
      const color = PLANE_COLORS[h % PLANE_COLORS.length];
      const item  = document.createElement('div');
      item.className = 'legend-item';
      item.innerHTML = `
        <span class="legend-swatch" style="background:${color}"></span>
        C${angle}° / C${(angle + 180) % 360}°
      `;
      container.appendChild(item);
    });
  },

  // ─── Metadata ────────────────────────────────────────────────────────────────

  _updateMetadata(data) {
    const kw   = data.keywords;
    const rows = [
      ['Manufacturer',    kw.MANUFAC    || '—'],
      ['Catalog No.',     kw.LUMCAT     || '—'],
      ['Luminaire',       kw.LUMINAIRE  || '—'],
      ['Lamp',            kw.LAMP       || '—'],
      ['Ballast',         kw.BALLAST    || '—'],
      ['Test Report',     kw.TEST       || '—'],
      [null, null],
      ['Ballast Factor',  data.ballastFactor],
      ['Input Watts',     data.inputWatts + ' W'],
      ['C-Planes',        data.numHorizAngles],
      ['Vert. Angles',    data.numVertAngles],
      ['Angular Range',   `${data.vertAngles[0]}° – ${data.vertAngles[data.vertAngles.length - 1]}°`],
      ['Photometric Type', IESParser.photometricTypeName(data.photometricType)],
      ['Symmetry',        IESParser.getSymmetryLabel(data)],
      ['Units',           data.unitsType === 2 ? 'Metres' : 'Feet'],
      ['Luminaire Size',  `${data.luminaireWidth} × ${data.luminaireLength} × ${data.luminaireHeight} m`],
    ];

    // Append any extra keywords from the file not already shown
    const knownKeys = new Set(['MANUFAC','LUMCAT','LUMINAIRE','LAMP','BALLAST','TEST']);
    const extraKws = Object.entries(kw).filter(([k]) => !knownKeys.has(k));
    if (extraKws.length) {
      rows.push([null, null]);
      extraKws.forEach(([k, v]) => rows.push([k, v]));
    }

    document.getElementById('metaBody').innerHTML = rows.map(([label, val]) => {
      if (label === null) return '<tr class="meta-divider"><td colspan="2"></td></tr>';
      return `<tr><td class="meta-label">${label}</td><td class="meta-val">${val}</td></tr>`;
    }).join('');
  },

  // ─── Tabs ───────────────────────────────────────────────────────────────────

  // ─── Polar controls ──────────────────────────────────────────────────────────

  _setupPolarControls() {
    document.querySelectorAll('input[name="polarMode"]').forEach(radio => {
      radio.addEventListener('change', () => {
        this.polarMode = radio.value;
        const panel = document.getElementById('polarOtherPanel');
        if (panel) panel.hidden = (radio.value !== 'other');
        if (this.current) this._updateCharts(this.current);
      });
    });

    const dlBtn = document.getElementById('downloadSvgBtn');
    if (dlBtn) dlBtn.addEventListener('click', () => this._downloadSVG());
  },

  _getPolarOpts(data) {
    if (!data) return {};

    if (this.polarMode === '0-90') {
      const nearest = target => {
        let best = 0, bestDiff = Infinity;
        data.horizAngles.forEach((a, i) => {
          const d = Math.min(Math.abs(a - target), 360 - Math.abs(a - target));
          if (d < bestDiff) { bestDiff = d; best = i; }
        });
        return best;
      };
      const i0 = nearest(0), i90 = nearest(90);
      return { planeIndices: i0 === i90 ? [i0] : [i0, i90] };
    }

    if (this.polarMode === 'maxmax') {
      let peakIdx = 0, peakCd = 0;
      data.candela.forEach((plane, h) => {
        const m = Math.max(...plane);
        if (m > peakCd) { peakCd = m; peakIdx = h; }
      });
      return {
        planeIndices: [peakIdx],
        coneAngles:   data.beamAngle > 0 ? [data.beamAngle / 2] : []
      };
    }

    // 'other'
    return {
      planeIndices: this.customPlaneIndices.length ? this.customPlaneIndices : null,
      coneAngles:   this.customConeAngles
    };
  },

  _buildOtherPanel(data) {
    const vertContainer = document.getElementById('vertPlaneRows');
    const coneContainer = document.getElementById('horizConeRows');
    if (!vertContainer || !coneContainer || !data) return;

    // Find peak plane
    let peakIdx = 0, peakCd = 0;
    data.candela.forEach((plane, h) => {
      const m = Math.max(...plane);
      if (m > peakCd) { peakCd = m; peakIdx = h; }
    });

    // Build unique C-plane pairs
    const seen  = new Set();
    const pairs = [];

    // Peak plane first
    const peakA = data.horizAngles[peakIdx];
    const peakOpp = (peakA + 180) % 360;
    seen.add(peakIdx);
    const peakOppIdx = data.horizAngles.indexOf(peakOpp);
    if (peakOppIdx >= 0) seen.add(peakOppIdx);
    pairs.push({ idx: peakIdx, label: `Max &nbsp;<span class="other-angle-dim">C${peakA}° / C${peakOpp}°</span>`, checked: true });

    data.horizAngles.forEach((a, i) => {
      if (seen.has(i)) return;
      seen.add(i);
      const opp    = (a + 180) % 360;
      const oppIdx = data.horizAngles.indexOf(opp);
      if (oppIdx >= 0) seen.add(oppIdx);
      pairs.push({ idx: i, label: `C${a}° / C${opp}°`, checked: false });
    });

    vertContainer.innerHTML = pairs.map(p => `
      <label class="other-row">
        <input type="checkbox" class="vert-plane-cb" data-idx="${p.idx}" ${p.checked ? 'checked' : ''}>
        <span class="other-row-label">${p.label}</span>
      </label>`).join('');

    this.customPlaneIndices = [peakIdx];

    // Build cone options
    const maxV    = data.vertAngles[data.vertAngles.length - 1];
    const bHalf   = data.beamAngle / 2;
    const coneOpts = [];
    if (data.beamAngle > 0) {
      coneOpts.push({ angle: bHalf, label: `Max &nbsp;<span class="other-angle-dim">${bHalf.toFixed(0)}°</span>` });
    }
    [15, 30, 45, 60, 75, 90].forEach(a => {
      if (a <= maxV && Math.abs(a - bHalf) > 3) coneOpts.push({ angle: a, label: `${a}°` });
    });

    coneContainer.innerHTML = coneOpts.map(c => `
      <label class="other-row">
        <input type="checkbox" class="horiz-cone-cb" data-angle="${c.angle}">
        <span class="other-row-label">${c.label}</span>
      </label>`).join('');

    this.customConeAngles = [];

    // Wire checkboxes
    vertContainer.querySelectorAll('.vert-plane-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        this.customPlaneIndices = [...document.querySelectorAll('.vert-plane-cb:checked')]
          .map(el => parseInt(el.dataset.idx));
        if (this.polarMode === 'other' && this.current) this._updateCharts(this.current);
      });
    });

    coneContainer.querySelectorAll('.horiz-cone-cb').forEach(cb => {
      cb.addEventListener('change', () => {
        this.customConeAngles = [...document.querySelectorAll('.horiz-cone-cb:checked')]
          .map(el => parseFloat(el.dataset.angle));
        if (this.polarMode === 'other' && this.current) this._updateCharts(this.current);
      });
    });
  },

  _downloadSVG() {
    if (!this.current || !this.polarChart) return;
    const svg  = this.polarChart.exportSVG(this.current, this._getPolarOpts(this.current));
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = this.current.filename.replace(/\.ies$/i, '') + '-polar.svg';
    a.click();
    URL.revokeObjectURL(url);
  },

  _setupTransformDropdown() {
    const btn  = document.getElementById('transformBtn');
    const menu = document.getElementById('transformMenu');
    if (!btn || !menu) return;

    btn.addEventListener('click', e => {
      e.stopPropagation();
      menu.hidden = !menu.hidden;
    });

    // Close when clicking outside
    document.addEventListener('click', () => { menu.hidden = true; });
  },

  _setupTabs() {
    document.querySelectorAll('[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tab = btn.dataset.tab;
        document.querySelectorAll('[data-tab]').forEach(b => b.classList.remove('active'));
        document.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        btn.classList.add('active');
        document.getElementById('tab-' + tab).classList.add('active');
        if (tab === 'detail' && this.current) {
          setTimeout(() => this._updateCharts(this.current), 50);
        }
        if (tab === 'compare') {
          this._updateCompareTable();
        }
      });
    });
  },

  // ─── Export ─────────────────────────────────────────────────────────────────

  _setupExport() {
    // Single file text export
    document.getElementById('exportBtn').addEventListener('click', () => {
      const d = this.current;
      if (!d) return;
      const lines = [
        `Vision Lighting — IES Analyzer`,
        `File: ${d.filename}`,
        ``,
        `Total Lumens:      ${fmt(d.totalLumens, 1)} lm`,
        `Input Power:       ${d.inputWatts} W`,
        `Efficacy:          ${fmt(d.efficacy, 2)} lm/W`,
        `Peak Intensity:    ${fmt(d.peakCandela, 1)} cd`,
        `Nadir Intensity:   ${fmt(d.nadirCandela, 1)} cd`,
        `Beam Angle (50%):  ${fmt(d.beamAngle, 1)}°`,
        `Field Angle (10%): ${fmt(d.fieldAngle, 1)}°`,
        `Downward Flux:     ${fmt(d.percentDownward, 1)}%`,
        `Upward Flux:       ${fmt(d.percentUpward, 1)}%`,
        `CIE Class:         ${d.cieClass}`,
        ``,
        `Manufacturer: ${d.keywords.MANUFAC || '—'}`,
        `Catalog No.:  ${d.keywords.LUMCAT  || '—'}`,
        `Lamp:         ${d.keywords.LAMP    || '—'}`,
      ];
      navigator.clipboard.writeText(lines.join('\n'))
        .then(() => this._toast('Metrics copied to clipboard', 'ok'))
        .catch(() => {
          const w = window.open('', '_blank');
          w.document.write('<pre style="font-family:monospace;padding:20px">' + lines.join('\n') + '</pre>');
        });
    });

    // CSV export of all files
    document.getElementById('exportCsvBtn').addEventListener('click', () => {
      if (!this.files.length) { this._toast('No files to export', 'warn'); return; }

      const headers = ['File','Manufacturer','Catalog No.','Lumens (lm)','Power (W)',
        'Efficacy (lm/W)','Peak cd','Nadir cd','Beam Angle (°)','Field Angle (°)',
        'Down %','Up %','CIE Class','C-Planes','Vert Angles'];

      const rows = this.files.map(d => [
        d.filename,
        d.keywords.MANUFAC  || '',
        d.keywords.LUMCAT   || '',
        d.totalLumens.toFixed(1),
        d.inputWatts,
        d.efficacy.toFixed(2),
        d.peakCandela.toFixed(1),
        d.nadirCandela.toFixed(1),
        d.beamAngle.toFixed(1),
        d.fieldAngle.toFixed(1),
        d.percentDownward.toFixed(1),
        d.percentUpward.toFixed(1),
        d.cieClass,
        d.numHorizAngles,
        d.numVertAngles,
      ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

      const csv  = [headers.join(','), ...rows].join('\r\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href     = url;
      a.download = 'ies-comparison.csv';
      a.click();
      URL.revokeObjectURL(url);
      this._toast('CSV exported', 'ok');
    });
  },

  // ─── Toast ───────────────────────────────────────────────────────────────────

  _toast(msg, type = 'ok') {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className   = `toast toast-${type} toast-show`;
    clearTimeout(this._toastT);
    this._toastT = setTimeout(() => el.classList.remove('toast-show'), 3200);
  },
};

function fmt(n, dec = 0) {
  if (!isFinite(n)) return '—';
  return n.toLocaleString(undefined, { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

document.addEventListener('DOMContentLoaded', () => App.init());
