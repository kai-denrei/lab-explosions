// The radar: Stalheart's PPI scope (src/radar.js and src/fx/radar-scope.js in that
// checkout) brought to a flat sea. Heading-up around the sphere, a rotating beam,
// contacts that flare as it passes and decay behind it, never dark, and the car-style
// proximity arcs for solid contacts. The maths is exported for the Node test.

export const SWEEP_PERIOD = 2.6;    // seconds per revolution
export const PHOSPHOR_DECAY = 1.12; // brightness lost per full turn behind the beam
const TAU = Math.PI * 2;

export function sweepAngle(t) { return ((t / SWEEP_PERIOD) * TAU) % TAU; }

// bearing of a scope point, radians clockwise from screen-north
export function radarBearing(x, y) { return Math.atan2(x, -y); }

export function radarPhosphor(bearing, sweep) {
  const age = (((sweep - bearing) % TAU) + TAU) % TAU / TAU;
  return Math.max(0.16, 1 - age * PHOSPHOR_DECAY);
}

// A world position onto the scope, heading-up, in scope-radius units. x is screen
// right (the pilot's right, -X at yaw 0), y is screen DOWN. `clamped` pins a contact
// beyond range to the rim: off-scope creatures still exist.
export function radarProject(pos, centre, yaw, range, out = { x: 0, y: 0, clamped: false }) {
  const dx = pos[0] - centre[0], dz = pos[2] - centre[2];
  const sy = Math.sin(yaw), cy = Math.cos(yaw);
  const fwd = dx * sy + dz * cy, right = -dx * cy + dz * sy;
  let x = right / range, y = -fwd / range;
  const len = Math.hypot(x, y);
  out.clamped = len > 1;
  if (out.clamped) { x /= len; y /= len; }
  out.x = x; out.y = y;
  return out;
}

// proximity: ahead / starboard / astern / port, graded by the nearest solid contact
export const SENSOR_RINGS = [
  { metres: 8, level: 3, color: '#ff4433' },
  { metres: 14, level: 2, color: '#ff8a3d' },
  { metres: 22, level: 1, color: '#3fa9ff' },
];
export function sensorLevel(metres) {
  if (!(metres >= 0)) return 0;
  for (const r of SENSOR_RINGS) if (metres <= r.metres + 1e-9) return r.level;
  return 0;
}
export function sensorColor(level) { return SENSOR_RINGS.find((r) => r.level === level)?.color ?? null; }
export function sensorSector(bearing) {
  const b = ((bearing % TAU) + TAU) % TAU;
  return Math.floor(((b + Math.PI / 4) % TAU) / (Math.PI / 2)) % 4;
}
export function proximitySectors(contacts, centre, yaw) {
  const out = [0, 1, 2, 3].map(() => ({ level: 0, metres: Infinity }));
  const q = {};
  for (const pos of contacts) {
    radarProject(pos, centre, yaw, 1e9, q);   // an unclamped projection: metres are what count here
    const metres = Math.hypot(q.x, q.y) * 1e9, level = sensorLevel(metres);
    if (!level) continue;
    const sec = sensorSector(radarBearing(q.x, q.y));
    if (metres < out[sec].metres) out[sec] = { level, metres };
  }
  return out;
}

// host: { centre(): [x,y,z], yaw(): rad, range(): m, contacts(): [{ pos: [x,y,z], kind }] }
// kinds: 'soft' (rammable creature), 'hard' (solid core), 'nih' (the big one), 'colony' (a fixture)
export function createRadarScope(canvas, host) {
  const ctx = canvas.getContext('2d');
  function draw(t) {
    const dpr = Math.min(devicePixelRatio || 1, 2), m = canvas.clientWidth || 180;
    if (canvas.width !== Math.round(m * dpr)) { canvas.width = canvas.height = Math.round(m * dpr); }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, m, m);
    const cx = m / 2, cy = m / 2, R = m / 2 - 3;
    const centre = host.centre(), yaw = host.yaw(), range = host.range(), sweep = sweepAngle(t);
    const contacts = host.contacts();

    // ground: near-black green, three range rings, crosshair, rim
    ctx.fillStyle = '#031007';
    ctx.beginPath(); ctx.arc(cx, cy, R + 3, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(90, 255, 140, 0.18)';
    ctx.lineWidth = 1;
    for (const f of [1 / 3, 2 / 3, 1]) { ctx.beginPath(); ctx.arc(cx, cy, R * f, 0, TAU); ctx.stroke(); }
    ctx.beginPath();
    ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
    ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
    ctx.stroke();

    // the beam: a conic trail building toward the beam line, then the hot edge
    const phi = sweep - Math.PI / 2;
    const grad = ctx.createConicGradient(phi, cx, cy);
    grad.addColorStop(0, 'rgba(90, 255, 140, 0)');
    grad.addColorStop(0.72, 'rgba(90, 255, 140, 0)');
    grad.addColorStop(1, 'rgba(90, 255, 140, 0.30)');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(140, 255, 180, 0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + R * Math.sin(sweep), cy - R * Math.cos(sweep)); ctx.stroke();

    const q = {};
    const blip = (pos, style, size, always = false) => {
      radarProject(pos, centre, yaw, range, q);
      const bri = always ? 1 : radarPhosphor(radarBearing(q.x, q.y), sweep);
      const bx = cx + q.x * R, by = cy + q.y * R;
      ctx.globalAlpha = q.clamped ? bri * 0.5 : bri;
      ctx.fillStyle = style;
      ctx.fillRect(bx - size / 2, by - size / 2, size, size);
      ctx.globalAlpha = 1;
      return q;
    };

    const hard = [];
    for (const c of contacts) {
      if (c.kind === 'colony') {
        // the colony's centre: a dim cyan fixture, always drawn, so the way there reads even from far off
        blip(c.pos, '#4bd7e0', 2.5, true);
      } else if (c.kind === 'nih') {
        // the big one: an amber ring that breathes, as the gates do
        radarProject(c.pos, centre, yaw, range, q);
        const r2 = 3.5 + 1.4 * Math.sin(t * 4);
        ctx.globalAlpha = (q.clamped ? 0.5 : 1) * (0.55 + 0.45 * radarPhosphor(radarBearing(q.x, q.y), sweep));
        ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(cx + q.x * R, cy + q.y * R, Math.max(1.5, r2), 0, TAU); ctx.stroke();
        ctx.globalAlpha = 1;
        hard.push(c.pos);
      } else {
        blip(c.pos, '#5aff8c', c.kind === 'hard' ? 4 : 2.5);
        if (c.kind === 'hard') hard.push(c.pos);
      }
    }

    // proximity arcs inside the rim, one sector each, one to three arcs by how close the nearest solid contact is
    const secs = proximitySectors(hard, centre, yaw);
    const pulse = 0.72 + 0.28 * Math.sin(t * 9);
    for (let i = 0; i < secs.length; i++) {
      const lv = secs[i].level;
      if (!lv) continue;
      const mid = i * Math.PI / 2 - Math.PI / 2, half = Math.PI / 4 - 0.14;
      for (let k = 0; k < lv; k++) {
        ctx.strokeStyle = sensorColor(lv);
        ctx.globalAlpha = (lv >= 3 ? pulse : 0.85) * (k === 2 ? 1 : 0.8);
        ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(cx, cy, R - 3 - k * 4.5, mid - half, mid + half); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    // you: a heading wedge at centre
    ctx.fillStyle = '#f2f8ff';
    ctx.beginPath(); ctx.moveTo(cx, cy - 6); ctx.lineTo(cx - 4, cy + 5); ctx.lineTo(cx + 4, cy + 5); ctx.closePath(); ctx.fill();
    // the range, small, at the bottom
    ctx.fillStyle = 'rgba(90, 255, 140, 0.55)';
    ctx.font = '9px ui-monospace, Menlo, monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.round(range)} m`, cx, m - 8);
  }
  return { draw };
}
