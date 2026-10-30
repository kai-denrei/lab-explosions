// The radar's orientation conventions, which flip silently without a test.
// node --test tests/radar.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { radarProject, radarBearing, radarPhosphor, sweepAngle, proximitySectors, sensorLevel, SWEEP_PERIOD } from '../lab-water/radar.js';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b}`);

test('heading-up: ahead is screen-up, the pilot\'s right is screen-right', () => {
  // yaw 0: forward +Z, right -X
  let q = radarProject([0, 0, 10], [0, 0, 0], 0, 20);
  near(q.x, 0, 1e-9, 'ahead has no x'); near(q.y, -0.5, 1e-9, 'ahead is up'); assert.equal(q.clamped, false);
  q = radarProject([-10, 0, 0], [0, 0, 0], 0, 20);
  near(q.x, 0.5, 1e-9, 'right is +x'); near(q.y, 0, 1e-9, 'right has no y');
  // a quarter turn left (yaw +90°): forward +X, so a contact at +X is now ahead
  q = radarProject([10, 0, 0], [0, 0, 0], Math.PI / 2, 20);
  near(q.x, 0, 1e-9, 'ahead after turning'); near(q.y, -0.5, 1e-9, 'ahead is up after turning');
});

test('beyond range pins to the rim and says so', () => {
  const q = radarProject([0, 0, 300], [0, 0, 0], 0, 40);
  assert.equal(q.clamped, true);
  near(Math.hypot(q.x, q.y), 1, 1e-9, 'on the rim');
  near(q.y, -1, 1e-9, 'still straight up');
});

test('bearing, sweep and phosphor agree: a contact is brightest as the beam passes', () => {
  near(radarBearing(0, -1), 0, 1e-9, 'north');
  near(radarBearing(1, 0), Math.PI / 2, 1e-9, 'east');
  near(sweepAngle(SWEEP_PERIOD / 4), Math.PI / 2, 1e-9, 'quarter turn');
  near(radarPhosphor(Math.PI / 2, Math.PI / 2), 1, 1e-9, 'lit as the beam passes');
  assert.ok(radarPhosphor(Math.PI / 2, Math.PI / 2 + 3) < 0.6, 'decays behind the beam');
  assert.ok(radarPhosphor(0, Math.PI * 1.99) >= 0.16, 'never dark');
});

test('proximity sectors grade the nearest solid contact per sector', () => {
  assert.equal(sensorLevel(5), 3); assert.equal(sensorLevel(12), 2); assert.equal(sensorLevel(20), 1); assert.equal(sensorLevel(30), 0);
  const secs = proximitySectors([[0, 0, 6], [-13, 0, 0], [0, 0, -21], [40, 0, 0]], [0, 0, 0], 0);
  assert.deepEqual(secs.map((s) => s.level), [3, 2, 1, 0], 'ahead red, starboard orange, astern blue, port clear');
});
