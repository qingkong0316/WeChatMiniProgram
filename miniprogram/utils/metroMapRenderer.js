const { schematicLines } = require('../data/metroSchematic.js');
const { allLines } = require('../data/lines.js');

const LABEL_FONT = 'bold 24px sans-serif';
const LABEL_HEIGHT = 26;
const LABEL_PAD = 8;

const LANES_HORIZONTAL = [
  { dy: -20, dx: 0, align: 'center' },
  { dy: -54, dx: 0, align: 'center' },
  { dy: 30, dx: 0, align: 'center' },
  { dy: -88, dx: 0, align: 'center' },
  { dy: 58, dx: 0, align: 'center' },
  { dy: -20, dx: -12, align: 'center' },
  { dy: -20, dx: 12, align: 'center' },
];

const LANES_VERTICAL = [
  { dy: 0, dx: 14, align: 'left' },
  { dy: 0, dx: -14, align: 'right' },
  { dy: -22, dx: 14, align: 'left' },
  { dy: 22, dx: -14, align: 'right' },
  { dy: -44, dx: 14, align: 'left' },
  { dy: 44, dx: -14, align: 'right' },
];
const BG_STARS = (() => {
  const stars = [];
  let seed = 42;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  for (let i = 0; i < 100; i += 1) {
    stars.push({
      x: rand(),
      y: rand() * 0.8,
      r: rand() * 1.4 + 0.5,
      phase: rand() * Math.PI * 2
    });
  }
  return stars;
})();

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  };
}

function lightenColor(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const mix = c => Math.min(255, Math.round(c + (255 - c) * amount));
  return `rgb(${mix(r)},${mix(g)},${mix(b)})`;
}

function strokePolyline(ctx, pts) {
  ctx.beginPath();
  ctx.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i += 1) {
    ctx.lineTo(pts[i][0], pts[i][1]);
  }
  ctx.stroke();
}

function drawNightSkyStatic(ctx, w, h) {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#060818');
  grad.addColorStop(0.55, '#0f1535');
  grad.addColorStop(1, '#121830');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);
}

function drawNightSkyScreen(ctx, w, h, tick, options = {}) {
  const dimmed = !!options.dimmed;
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  if (dimmed) {
    grad.addColorStop(0, '#030510');
    grad.addColorStop(0.55, '#080c22');
    grad.addColorStop(1, '#0a0e1e');
  } else {
    grad.addColorStop(0, '#060818');
    grad.addColorStop(0.55, '#0f1535');
    grad.addColorStop(1, '#121830');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  const starMul = dimmed ? 0.28 : 0.8;
  BG_STARS.forEach(st => {
    const tw = 0.6 + 0.4 * Math.sin(tick * 0.002 + st.phase);
    ctx.globalAlpha = tw * starMul;
    ctx.fillStyle = '#FFF8E7';
    ctx.beginPath();
    ctx.arc(st.x * w, st.y * h, st.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  if (dimmed) {
    ctx.fillStyle = 'rgba(2, 4, 14, 0.38)';
    ctx.fillRect(0, 0, w, h);
  }
}

function drawMetroLine(ctx, line, { alpha, width, emphasized }) {
  const pts = line.points;
  if (!pts || pts.length < 2) return;

  const rgb = hexToRgb(line.color);
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.globalAlpha = alpha * 0.35;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
  ctx.lineWidth = width + 5;
  strokePolyline(ctx, pts);

  ctx.globalAlpha = alpha;
  ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},1)`;
  ctx.lineWidth = width;
  strokePolyline(ctx, pts);

  if (emphasized) {
    ctx.globalAlpha = alpha * 0.42;
    ctx.strokeStyle = lightenColor(line.color, 0.55);
    ctx.lineWidth = width + 10;
    strokePolyline(ctx, pts);

    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = lightenColor(line.color, 0.42);
    ctx.lineWidth = Math.max(4, width * 0.42);
    strokePolyline(ctx, pts);
  }

  ctx.restore();
}

function drawDarkRegularStation(ctx, st, emphasized = false) {
  const outerR = emphasized ? 9 : 7.5;
  const innerR = emphasized ? 4 : 3.2;
  const glowR = outerR + (emphasized ? 5 : 3.5);
  const outerAlpha = emphasized ? 0.9 : 0.62;
  const innerAlpha = emphasized ? 1 : 0.88;

  ctx.save();
  ctx.globalAlpha = outerAlpha * 0.45;
  ctx.fillStyle = '#9EB0D8';
  ctx.beginPath();
  ctx.arc(st.x, st.y, glowR, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = outerAlpha;
  ctx.fillStyle = emphasized ? '#D8E2F4' : '#B8C6E0';
  ctx.beginPath();
  ctx.arc(st.x, st.y, outerR, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = innerAlpha;
  ctx.fillStyle = emphasized ? '#FFFFFF' : '#EEF2FA';
  ctx.beginPath();
  ctx.arc(st.x, st.y, innerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawDarkTransferHub(ctx, st, options = {}) {
  const emphasized = !!options.emphasized;
  const subdued = !!options.subdued;

  if (subdued && !emphasized) {
    ctx.save();
    ctx.globalAlpha = 0.3;
    ctx.fillStyle = '#7888A8';
    ctx.beginPath();
    ctx.arc(st.x, st.y, 5.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 0.42;
    ctx.strokeStyle = '#98A4BC';
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.arc(st.x, st.y, 4.8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#B8C2D4';
    ctx.beginPath();
    ctx.arc(st.x, st.y, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    return;
  }

  const outerR = emphasized ? 10 : 8.5;
  const ringW = emphasized ? 2.4 : 1.8;
  const arm = outerR + (emphasized ? 4 : 3);

  ctx.save();
  ctx.globalAlpha = emphasized ? 0.28 : 0.16;
  ctx.fillStyle = '#E8D9A8';
  ctx.beginPath();
  ctx.arc(st.x, st.y, outerR + 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = emphasized ? 0.78 : 0.55;
  ctx.strokeStyle = '#C9B878';
  ctx.lineWidth = ringW;
  ctx.beginPath();
  ctx.arc(st.x, st.y, outerR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = emphasized ? 0.75 : 0.58;
  ctx.fillStyle = '#8A9AB8';
  ctx.beginPath();
  ctx.arc(st.x, st.y, Math.max(outerR - ringW - 1.2, 2.8), 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = emphasized ? 0.92 : 0.8;
  ctx.fillStyle = emphasized ? '#F2EBD8' : '#D4DCE8';
  ctx.beginPath();
  ctx.arc(st.x, st.y, emphasized ? 3.6 : 2.8, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = emphasized ? 0.72 : 0.48;
  ctx.strokeStyle = '#D8C890';
  ctx.lineWidth = emphasized ? 1.6 : 1.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(st.x - arm, st.y);
  ctx.lineTo(st.x + arm, st.y);
  ctx.moveTo(st.x, st.y - arm);
  ctx.lineTo(st.x, st.y + arm);
  ctx.stroke();
  ctx.restore();
}

function drawDarkStation(ctx, st, options = {}) {
  const isTransfer = st.lines && st.lines.length > 1;
  if (isTransfer) {
    drawDarkTransferHub(ctx, st, options);
  } else {
    drawDarkRegularStation(ctx, st, !!options.emphasized);
  }
}

function drawStar(ctx, x, y, outerR, innerR, rotation) {
  const spikes = 5;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i += 1) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = rotation + (Math.PI * i) / spikes - Math.PI / 2;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function drawLitStar(ctx, st, tick) {
  const pulse = 0.9 + 0.1 * Math.sin(tick * 0.004 + st.x * 0.01);
  const outer = 13 * pulse;
  const inner = 5.5 * pulse;

  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.fillStyle = '#FFE566';
  drawStar(ctx, st.x, st.y, outer + 6, inner + 3, tick * 0.001);
  ctx.fill();

  ctx.globalAlpha = 0.85;
  ctx.fillStyle = '#FFF4C2';
  drawStar(ctx, st.x, st.y, outer + 2, inner + 1, tick * 0.001);
  ctx.fill();

  ctx.globalAlpha = 1;
  ctx.fillStyle = '#FFFBE6';
  drawStar(ctx, st.x, st.y, outer, inner, tick * 0.001);
  ctx.fill();

  ctx.fillStyle = '#FFFFFF';
  drawStar(ctx, st.x, st.y, outer * 0.5, inner * 0.5, tick * 0.001);
  ctx.fill();
  ctx.restore();
}

function drawLitMoon(ctx, st, tick) {
  const pulse = 0.97 + 0.03 * Math.sin(tick * 0.003 + st.y * 0.01);
  const r = 11 * pulse;

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.fillStyle = '#E8D48A';
  ctx.beginPath();
  ctx.arc(st.x, st.y, r + 3.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.62;
  ctx.fillStyle = '#F0E6C4';
  ctx.beginPath();
  ctx.arc(st.x, st.y, r + 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.88;
  ctx.fillStyle = '#F5EFDA';
  ctx.beginPath();
  ctx.arc(st.x, st.y, r, -0.5, Math.PI * 1.5);
  ctx.arc(st.x + r * 0.55, st.y - r * 0.12, r * 0.88, Math.PI * 0.55, -Math.PI * 0.35, true);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function findClosestPointIndex(x, y, points) {
  let best = 0;
  let bestDist = Infinity;
  points.forEach((p, i) => {
    const dx = p[0] - x;
    const dy = p[1] - y;
    const dist = dx * dx + dy * dy;
    if (dist < bestDist) {
      bestDist = dist;
      best = i;
    }
  });
  return best;
}

function findBestLinePolyline(lineKey, stA, stB) {
  const candidates = schematicLines.filter(l => l.key === lineKey);
  let best = null;
  let bestScore = Infinity;
  candidates.forEach(line => {
    const iA = findClosestPointIndex(stA.x, stA.y, line.points);
    const iB = findClosestPointIndex(stB.x, stB.y, line.points);
    const pA = line.points[iA];
    const pB = line.points[iB];
    const distA = (pA[0] - stA.x) ** 2 + (pA[1] - stA.y) ** 2;
    const distB = (pB[0] - stB.x) ** 2 + (pB[1] - stB.y) ** 2;
    const score = distA + distB;
    if (score < bestScore) {
      bestScore = score;
      best = { line, iA, iB };
    }
  });
  return best;
}

function buildLitSegments(schematicStations, checkedSet) {
  const stationMap = new Map();
  schematicStations.forEach(st => stationMap.set(st.name, st));
  const segments = [];

  Object.entries(allLines).forEach(([lineKey, stations]) => {
    const orderedNames = stations.map(s => s.name);
    let runStart = -1;

    const flushRun = (runEnd) => {
      if (runStart < 0 || runEnd - runStart < 1) {
        runStart = -1;
        return;
      }
      const fromName = orderedNames[runStart];
      const toName = orderedNames[runEnd];
      const stA = stationMap.get(fromName);
      const stB = stationMap.get(toName);
      if (!stA || !stB) {
        runStart = -1;
        return;
      }
      const match = findBestLinePolyline(lineKey, stA, stB);
      if (!match) {
        runStart = -1;
        return;
      }
      const start = Math.min(match.iA, match.iB);
      const end = Math.max(match.iA, match.iB);
      segments.push({
        line: match.line,
        points: match.line.points.slice(start, end + 1),
        fromName,
        toName
      });
      runStart = -1;
    };

    orderedNames.forEach((name, i) => {
      if (checkedSet.has(name)) {
        if (runStart < 0) runStart = i;
      } else {
        flushRun(i - 1);
      }
    });
    if (runStart >= 0) flushRun(orderedNames.length - 1);
  });

  return segments;
}

function drawLitPathSegment(ctx, line, subPoints, tick) {
  if (!subPoints || subPoints.length < 2) return;
  const pulse = 0.82 + 0.18 * Math.sin(tick * 0.003);
  const rgb = hexToRgb(line.color);

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.globalAlpha = 0.55 * pulse;
  ctx.strokeStyle = '#FFE566';
  ctx.lineWidth = 30;
  strokePolyline(ctx, subPoints);

  ctx.globalAlpha = 0.75;
  ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},1)`;
  ctx.lineWidth = 20;
  strokePolyline(ctx, subPoints);

  ctx.globalAlpha = 0.9 * pulse;
  ctx.strokeStyle = lightenColor(line.color, 0.55);
  ctx.lineWidth = 12;
  strokePolyline(ctx, subPoints);

  ctx.globalAlpha = 0.85;
  ctx.strokeStyle = '#FFF8D0';
  ctx.lineWidth = 5;
  strokePolyline(ctx, subPoints);

  ctx.restore();
}

function drawSelectedStationHighlight(ctx, st, tick) {
  const pulse = 0.55 + 0.45 * Math.sin(tick * 0.006);
  const ring = 22 + 4 * Math.sin(tick * 0.004);

  ctx.save();

  ctx.globalAlpha = 0.35 * pulse;
  ctx.fillStyle = '#FFE566';
  ctx.beginPath();
  ctx.arc(st.x, st.y, ring + 16, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(st.x, st.y, ring, 0, Math.PI * 2);
  ctx.stroke();

  ctx.globalAlpha = 0.95;
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#FFB800';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(st.x, st.y, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.globalAlpha = 1;
  ctx.fillStyle = '#FFFBE6';
  ctx.beginPath();
  ctx.arc(st.x, st.y, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function boxesOverlap(a, b) {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function getLineStationOrder(lineKey, stations) {
  const lineStations = allLines[lineKey];
  if (!lineStations) {
    return [...stations].sort((a, b) => a.x - b.x || a.y - b.y);
  }
  const byName = new Map(stations.map(s => [s.name, s]));
  const ordered = [];
  lineStations.forEach(s => {
    const st = byName.get(s.name);
    if (st) ordered.push(st);
  });
  stations.forEach(s => {
    if (!ordered.includes(s)) ordered.push(s);
  });
  return ordered;
}

function detectLineOrientation(stations) {
  if (stations.length < 2) return 'horizontal';
  const xs = stations.map(s => s.x);
  const ys = stations.map(s => s.y);
  const xRange = Math.max(...xs) - Math.min(...xs);
  const yRange = Math.max(...ys) - Math.min(...ys);
  return xRange >= yRange ? 'horizontal' : 'vertical';
}

function labelBox(st, width, lane) {
  const align = lane.align || 'center';
  const cx = st.x + (lane.dx || 0);
  const labelY = st.y + lane.dy;
  const top = labelY - LABEL_HEIGHT;
  const bottom = labelY + LABEL_PAD;

  if (align === 'right') {
    return {
      left: cx - width - LABEL_PAD,
      right: cx + LABEL_PAD,
      top,
      bottom,
    };
  }
  if (align === 'left') {
    return {
      left: cx - LABEL_PAD,
      right: cx + width + LABEL_PAD,
      top,
      bottom,
    };
  }
  return {
    left: cx - width / 2 - LABEL_PAD,
    right: cx + width / 2 + LABEL_PAD,
    top,
    bottom,
  };
}

function buildStationLabelLayout(ctx, stations, lineKey) {
  const ordered = getLineStationOrder(lineKey, stations);
  const orientation = detectLineOrientation(ordered);
  const lanes = orientation === 'horizontal' ? LANES_HORIZONTAL : LANES_VERTICAL;
  const layout = new Map();
  const placed = [];

  ctx.save();
  ctx.font = LABEL_FONT;

  ordered.forEach((st, idx) => {
    const width = ctx.measureText(st.name).width;
    const startAt = idx % 2;
    const tryLanes = LANES_HORIZONTAL === lanes
      ? [...lanes.slice(startAt), ...lanes.slice(0, startAt)]
      : lanes;
    let chosen = tryLanes[0];
    for (let i = 0; i < tryLanes.length; i += 1) {
      const lane = tryLanes[i];
      const box = labelBox(st, width, lane);
      const hit = placed.some(p => boxesOverlap(box, p.box));
      if (!hit) {
        chosen = lane;
        break;
      }
    }
    const box = labelBox(st, width, chosen);
    placed.push({ box });
    layout.set(st.name, { ...chosen, width });
  });

  ctx.restore();
  return layout;
}

function drawStationLabel(ctx, st, lineColor, layout) {
  const lane = layout || { dy: -20, dx: 0, align: 'center' };
  const labelY = st.y + lane.dy;
  const labelX = st.x + (lane.dx || 0);
  const align = lane.align || 'center';

  ctx.save();
  ctx.font = LABEL_FONT;
  ctx.textAlign = align;
  ctx.textBaseline = 'bottom';

  ctx.lineWidth = 5;
  ctx.strokeStyle = 'rgba(6, 8, 24, 0.85)';
  ctx.strokeText(st.name, labelX, labelY);

  ctx.fillStyle = '#F4F6FF';
  ctx.fillText(st.name, labelX, labelY);

  if (align === 'center') {
    ctx.fillStyle = lineColor || '#E8ECFF';
    ctx.globalAlpha = 0.95;
    ctx.fillRect(labelX - 3, labelY + 4, 6, 3);
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawStationLabels(ctx, stations, lineColor, lineKey) {
  if (!stations.length) return;
  const layout = buildStationLabelLayout(ctx, stations, lineKey);
  stations.forEach(st => {
    drawStationLabel(ctx, st, lineColor, layout.get(st.name));
  });
}

module.exports = {
  drawNightSkyStatic,
  drawNightSkyScreen,
  drawMetroLine,
  drawDarkStation,
  drawLitStar,
  drawLitMoon,
  drawSelectedStationHighlight,
  drawStationLabel,
  drawStationLabels,
  buildLitSegments,
  drawLitPathSegment
};
