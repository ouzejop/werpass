import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../fixtures/synthetic/', import.meta.url);
const fixtures = ['prescription-demo.pdf', 'lab-result-demo.jpg'];

for (const name of fixtures) {
  const file = new URL(name, root);
  assert.ok(existsSync(file), `Missing synthetic fixture: ${name}`);
  assert.ok(readFileSync(file).byteLength > 1_000, `Fixture is unexpectedly small: ${name}`);
}

const expectations = JSON.parse(readFileSync(new URL('expectations.json', root), 'utf8'));
assert.match(expectations['prescription-demo'].syntheticMarker, /SYNTHETIC DEMO/);
assert.match(expectations['lab-result-demo'].syntheticMarker, /SYNTHETIC DEMO/);
console.log('synthetic fixtures verified');
