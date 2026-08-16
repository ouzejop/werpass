import assert from 'node:assert/strict';
import nacl from 'tweetnacl';

const patient = nacl.box.keyPair();
const portal = nacl.box.keyPair();
const nonce = nacl.randomBytes(nacl.box.nonceLength);
const documentKey = nacl.randomBytes(32);
const wrapped = nacl.box(documentKey, nonce, portal.publicKey, patient.secretKey);
const opened = nacl.box.open(wrapped, nonce, patient.publicKey, portal.secretKey);
assert.deepEqual(opened, documentKey, 'only the portal private key opens the wrapped document key');
assert.equal(nacl.box.open(wrapped, nonce, patient.publicKey, nacl.box.keyPair().secretKey), null, 'a different browser cannot open the wrapped key');

const aad = new TextEncoder().encode('werpass:file:v1:patient-demo:doc-demo:1');
const plaintext = new TextEncoder().encode('synthetic image bytes');
const iv = crypto.getRandomValues(new Uint8Array(12));
const aesKey = await crypto.subtle.importKey('raw', documentKey, 'AES-GCM', false, ['encrypt', 'decrypt']);
const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad }, aesKey, plaintext));
const combined = new Uint8Array(iv.length + ciphertext.length);
combined.set(iv);
combined.set(ciphertext, iv.length);
const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: combined.slice(0, 12), additionalData: aad }, aesKey, combined.slice(12));
assert.deepEqual(new Uint8Array(decrypted), plaintext, 'the portal decrypts the existing IV|ciphertext|tag format locally');

console.log('ephemeral portal key tests passed');
