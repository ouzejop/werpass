import type { CryptoEnvelope } from './crypto';

export type VaultDocument = {
  id: string;
  patientId: string;
  version: number;
  kind: 'prescription' | 'lab-result';
  envelope: CryptoEnvelope;
  syncState: 'local' | 'queued' | 'syncing' | 'synced' | 'failed';
  createdAt: string;
};

export type OutboxItem = { id: string; documentId: string; attempts: number; state: 'queued' | 'failed' };

export type VaultSnapshot = { locked: boolean; documents: VaultDocument[]; outbox: OutboxItem[] };

export function createLockedVault(): VaultSnapshot {
  return { locked: true, documents: [], outbox: [] };
}

/**
 * PIN verification belongs behind the native SecureStore verifier. This state
 * transition receives only its result, never a PIN or persisted equivalent.
 */
export function unlockVault(snapshot: VaultSnapshot, verified: boolean): VaultSnapshot {
  if (!verified) throw new Error('Invalid PIN');
  return { ...snapshot, locked: false };
}

export function queueDocument(snapshot: VaultSnapshot, document: VaultDocument): VaultSnapshot {
  if (snapshot.locked) throw new Error('Vault is locked');
  return {
    ...snapshot,
    documents: [...snapshot.documents, { ...document, syncState: 'queued' }],
    outbox: [...snapshot.outbox, { id: `sync:${document.id}:${document.version}`, documentId: document.id, attempts: 0, state: 'queued' }],
  };
}

const transitions: Record<VaultDocument['syncState'], VaultDocument['syncState'][]> = {
  local: ['queued'],
  queued: ['syncing'],
  syncing: ['synced', 'failed'],
  synced: [],
  failed: ['queued'],
};

export function transitionSyncState(current: VaultDocument['syncState'], next: VaultDocument['syncState']): VaultDocument['syncState'] {
  if (!transitions[current].includes(next)) throw new Error('Invalid sync transition');
  return next;
}
