/**
 * Interactive SVG chart with MATLAB-style drag-to-zoom.
 *
 * createChart(spec) returns a DOM element (the chart). The caller supplies the
 * data as a list of series; the chart draws axes, ticks, gridlines, legend, and
 * the curves, and handles:
 *   - drag a rectangle to zoom into that region
 *   - double-click to reset to the full view
 *   - a small "reset" hint appears once zoomed
 *
 * spec = {
 *   series: [{ x:[], y:[], color, width?, dash?, label, marker? }],
 *   xLabel, yLabel,
 *   xLog: bool,                  // log x axis
 *   xFmt, yFmt,                  // tick formatters
 *   xUnitScale?: number,         // multiply x data for display (e.g. 1e3 for ms) -- handled by caller
 * }
 */

const NS = 'http://www.w3.org/2000/svg';
const W = 540, H = 300, ML = 64, MR = 18, MT = 16, MB = 46;
const innerW = W - ML - MR, innerH = H - MT - MB;

export function createChart(spec) {
  const wrap = document.createElement('div');
  wrap.className = 'chart-wrap';

  // full data extent
  const full = dataExtent(spec);
  // current view window (mutable)
  let view = { ...full };

  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('width', '100%');
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  svg.classList.add('plot-svg');
  svg.style.touchAction = 'none';
  wrap.appendChild(svg);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'chart-reset';
  resetBtn.textContent = 'Reset zoom';
  resetBtn.hidden = true;
  resetBtn.addEventListener('click', () => { view = { ...full }; render(); });
  wrap.appendChild(resetBtn);

  const expandBtn = document.createElement('button');
  expandBtn.type = 'button';
  expandBtn.className = 'chart-expand';
  expandBtn.textContent = 'Expand';
  expandBtn.title = 'Open this plot full screen';
  expandBtn.addEventListener('click', () => toggleFullscreen(wrap, expandBtn));
  wrap.appendChild(expandBtn);

  function render() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    const xLog = spec.xLog;
    const lx = v => xLog ? Math.log10(v) : v;
    const xLo = lx(view.xMin), xHi = lx(view.xMax);
    const xScale = v => ML + (lx(v) - xLo) / (xHi - xLo) * innerW;
    const yScale = v => MT + innerH - (v - view.yMin) / (view.yMax - view.yMin) * innerH;

    // panel — literal light fill so ticks (dark) always have contrast
    svg.appendChild(rect(ML, MT, innerW, innerH, '#fbfaf6', '#cfcdc2', 1, 4));

    // gridlines + ticks
    for (const tv of niceTicks(view.xMin, view.xMax, 5, xLog)) {
      const px = xScale(tv);
      if (px < ML - 0.5 || px > ML + innerW + 0.5) continue;
      svg.appendChild(line(px, MT, px, MT + innerH, '#cfcdc2', 0.5));
      svg.appendChild(text(px, MT + innerH + 17, (spec.xFmt || fmtNum)(tv), 'middle', 'plot-tick'));
    }
    for (const tv of niceTicks(view.yMin, view.yMax, 5, false)) {
      const py = yScale(tv);
      if (py < MT - 0.5 || py > MT + innerH + 0.5) continue;
      svg.appendChild(line(ML, py, ML + innerW, py, '#cfcdc2', 0.5));
      svg.appendChild(text(ML - 8, py + 4, (spec.yFmt || fmtNum)(tv), 'end', 'plot-tick'));
    }

    // axis titles
    svg.appendChild(text(ML + innerW / 2, H - 8, spec.xLabel || '', 'middle', 'plot-axis'));
    const yl = text(15, MT + innerH / 2, spec.yLabel || '', 'middle', 'plot-axis');
    yl.setAttribute('transform', `rotate(-90 15 ${MT + innerH / 2})`);
    svg.appendChild(yl);

    // legend
    let ly = MT + 14;
    for (const s of spec.series) {
      if (!s.label) continue;
      svg.appendChild(lineDash(ML + 10, ly, ML + 30, ly, s.color, 2.4, s.dash));
      const t = text(ML + 36, ly + 4, s.label, 'start', 'plot-legend');
      t.setAttribute('fill', s.color);
      svg.appendChild(t);
      ly += 16;
    }

    // clip + curves
    const clipId = 'c' + Math.random().toString(36).slice(2, 8);
    const defs = document.createElementNS(NS, 'defs');
    const cp = document.createElementNS(NS, 'clipPath');
    cp.setAttribute('id', clipId);
    cp.appendChild(rect(ML, MT, innerW, innerH));
    defs.appendChild(cp);
    svg.appendChild(defs);

    const g = document.createElementNS(NS, 'g');
    g.setAttribute('clip-path', `url(#${clipId})`);
    for (const s of spec.series) {
      if (s.marker === 'cross') {
        for (let i = 0; i < s.x.length; i++) g.appendChild(cross(xScale(s.x[i]), yScale(s.y[i]), s.color));
      } else {
        g.appendChild(curve(s.x, s.y, xScale, yScale, s.color, s.width || 1.5, s.dash));
      }
    }
    svg.appendChild(g);

    // selection rectangle layer (added on top during drag)
    selRect = rect(0, 0, 0, 0, 'rgba(43,108,176,0.15)', 'var(--c-blue)', 1, 2);
    selRect.style.display = 'none';
    svg.appendChild(selRect);

    resetBtn.hidden = (view.xMin === full.xMin && view.xMax === full.xMax &&
                       view.yMin === full.yMin && view.yMax === full.yMax);

    // store scales for the drag handler
    chartState = { xScale, yScale, xLog };
  }

  let selRect = null;
  let chartState = null;
  let dragStart = null;

  function clientToData(evt) {
    const pt = svgPoint(svg, evt);
    // invert pixel -> data
    const xLog = chartState.xLog;
    const fx = (pt.x - ML) / innerW;          // 0..1
    const fy = (pt.y - MT) / innerH;
    const lxMin = xLog ? Math.log10(view.xMin) : view.xMin;
    const lxMax = xLog ? Math.log10(view.xMax) : view.xMax;
    const lxVal = lxMin + fx * (lxMax - lxMin);
    const xVal = xLog ? Math.pow(10, lxVal) : lxVal;
    const yVal = view.yMax - fy * (view.yMax - view.yMin);
    return { x: xVal, y: yVal, px: pt.x, py: pt.y };
  }

  svg.addEventListener('pointerdown', (e) => {
    const pt = svgPoint(svg, e);
    if (pt.x < ML || pt.x > ML + innerW || pt.y < MT || pt.y > MT + innerH) return;
    dragStart = clientToData(e);
    svg.setPointerCapture(e.pointerId);
  });
  svg.addEventListener('pointermove', (e) => {
    if (!dragStart || !selRect) return;
    const cur = clientToData(e);
    const x = Math.min(dragStart.px, cur.px);
    const y = Math.min(dragStart.py, cur.py);
    selRect.style.display = '';
    selRect.setAttribute('x', x);
    selRect.setAttribute('y', y);
    selRect.setAttribute('width', Math.abs(cur.px - dragStart.px));
    selRect.setAttribute('height', Math.abs(cur.py - dragStart.py));
  });
  svg.addEventListener('pointerup', (e) => {
    if (!dragStart) return;
    const cur = clientToData(e);
    const dx = Math.abs(cur.px - dragStart.px), dy = Math.abs(cur.py - dragStart.py);
    if (dx > 8 && dy > 8) {
      view = {
        xMin: Math.min(dragStart.x, cur.x), xMax: Math.max(dragStart.x, cur.x),
        yMin: Math.min(dragStart.y, cur.y), yMax: Math.max(dragStart.y, cur.y),
      };
      render();
    }
    dragStart = null;
    if (selRect) selRect.style.display = 'none';
  });
  svg.addEventListener('dblclick', () => { view = { ...full }; render(); });

  render();
  return wrap;
}

// ------------------------------------------------------------------ extent
function dataExtent(spec) {
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const s of spec.series) {
    for (const v of s.x) { if (v < xMin) xMin = v; if (v > xMax) xMax = v; }
    for (const v of s.y) { if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
  }
  if (!isFinite(xMin)) { xMin = 0; xMax = 1; }
  if (!isFinite(yMin)) { yMin = 0; yMax = 1; }
  // pad y a little
  const yp = (yMax - yMin) * 0.06 || 1;
  yMin -= yp; yMax += yp;
  return { xMin, xMax, yMin, yMax };
}

// ------------------------------------------------------------------ svg utils
function svgPoint(svg, evt) {
  const rect = svg.getBoundingClientRect();
  const x = (evt.clientX - rect.left) / rect.width * W;
  const y = (evt.clientY - rect.top) / rect.height * H;
  return { x, y };
}
function rect(x, y, w, h, fill = 'none', stroke = 'none', sw = 0, rx = 0) {
  const r = document.createElementNS(NS, 'rect');
  r.setAttribute('x', x); r.setAttribute('y', y);
  r.setAttribute('width', w); r.setAttribute('height', h);
  r.setAttribute('fill', fill);
  if (stroke !== 'none') { r.setAttribute('stroke', stroke); r.setAttribute('stroke-width', sw); }
  if (rx) r.setAttribute('rx', rx);
  return r;
}
function line(x1, y1, x2, y2, stroke, sw) {
  const l = document.createElementNS(NS, 'line');
  l.setAttribute('x1', x1); l.setAttribute('y1', y1);
  l.setAttribute('x2', x2); l.setAttribute('y2', y2);
  l.setAttribute('stroke', stroke); l.setAttribute('stroke-width', sw);
  return l;
}
function lineDash(x1, y1, x2, y2, stroke, sw, dash) {
  const l = line(x1, y1, x2, y2, stroke, sw);
  if (dash) l.setAttribute('stroke-dasharray', dash);
  return l;
}
function curve(xs, ys, xScale, yScale, color, width, dash) {
  let d = '';
  for (let i = 0; i < xs.length; i++) d += (i ? 'L' : 'M') + xScale(xs[i]).toFixed(1) + ' ' + yScale(ys[i]).toFixed(1) + ' ';
  const p = document.createElementNS(NS, 'path');
  p.setAttribute('d', d); p.setAttribute('fill', 'none');
  p.setAttribute('stroke', color); p.setAttribute('stroke-width', width);
  if (dash) p.setAttribute('stroke-dasharray', dash);
  return p;
}
function cross(cx, cy, color, size = 5) {
  const g = document.createElementNS(NS, 'g');
  g.setAttribute('stroke', color); g.setAttribute('stroke-width', 1.8);
  g.appendChild(line(cx - size, cy - size, cx + size, cy + size, color, 1.8));
  g.appendChild(line(cx - size, cy + size, cx + size, cy - size, color, 1.8));
  return g;
}
function text(x, y, str, anchor, cls) {
  const t = document.createElementNS(NS, 'text');
  t.setAttribute('x', x); t.setAttribute('y', y);
  t.setAttribute('text-anchor', anchor); t.setAttribute('class', cls);
  // Set fill + size directly (not only via CSS class) so the labels always
  // render with the right contrast on the light plot panel, regardless of
  // how the SVG is inserted or themed.
  if (cls === 'plot-tick') {
    t.setAttribute('fill', '#1a1a18');
    t.setAttribute('font-size', '12');
    t.setAttribute('font-weight', '600');
    t.setAttribute('font-family', 'ui-monospace, monospace');
  } else if (cls === 'plot-axis') {
    t.setAttribute('fill', '#000000');
    t.setAttribute('font-size', '13');
    t.setAttribute('font-weight', '700');
  } else if (cls === 'plot-legend') {
    t.setAttribute('font-size', '12');
    t.setAttribute('font-weight', '700');
    // fill is set by caller (matches the curve color)
  }
  t.textContent = str;
  return t;
}

function toggleFullscreen(wrap, btn) {
  const on = wrap.classList.toggle('chart-fullscreen');
  btn.textContent = on ? 'Close' : 'Expand';
  if (on) {
    document.body.style.overflow = 'hidden';
    const onKey = (e) => { if (e.key === 'Escape') toggleFullscreen(wrap, btn); };
    wrap._escHandler = onKey;
    document.addEventListener('keydown', onKey);
  } else {
    document.body.style.overflow = '';
    if (wrap._escHandler) document.removeEventListener('keydown', wrap._escHandler);
  }
}

export function fmtNum(v) {
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e4 || a < 1e-2) return v.toExponential(1);
  if (a >= 100) return v.toFixed(0);
  if (a >= 1) return v.toFixed(1);
  return v.toFixed(2);
}

function niceTicks(min, max, count, isLog) {
  if (isLog) {
    const lo = Math.floor(Math.log10(min)), hi = Math.ceil(Math.log10(max));
    const ticks = [];
    for (let e = lo; e <= hi; e++) ticks.push(Math.pow(10, e));
    return ticks;
  }
  if (min === max) return [min];
  const span = max - min, raw = span / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const norm = raw / mag;
  let step = norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10;
  step *= mag;
  const start = Math.ceil(min / step) * step;
  const ticks = [];
  for (let v = start; v <= max + step * 0.5; v += step) ticks.push(Number(v.toPrecision(12)));
  return ticks;
}
