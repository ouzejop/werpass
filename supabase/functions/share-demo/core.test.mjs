import assert from 'node:assert/strict';
import { constantTimeEqual, digestMedicalCode, generateMedicalCode, validCode, validOpaqueToken } from './core.ts';

assert.equal(validCode('123456'), true);
assert.equal(validCode('12345'), false);
assert.equal(validOpaqueToken('00000000-0000-4000-8000-000000000001'), true);
assert.equal(generateMedicalCode(new Uint8Array([0, 0, 0, 7])), '000007');
const digest = await digestMedicalCode('server-only-pepper', '00000000-0000-4000-8000-000000000001', '123456');
assert.equal(digest.length, 64);
assert.equal(constantTimeEqual(digest, digest), true);
assert.equal(constantTimeEqual(digest, `${digest.slice(0, -1)}0`), false);
console.log('share demo security tests passed');
