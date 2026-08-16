export class VaultRecoveryRequiredError extends Error {
  constructor() {
    super('Le coffre local ne peut pas être ouvert avec la clé sécurisée de cet appareil.');
    this.name = 'VaultRecoveryRequiredError';
  }
}

export function isUnreadableVaultDatabaseError(error: unknown): boolean {
  const visited = new Set<unknown>();
  let current: unknown = error;
  for (let depth = 0; depth < 4 && current !== undefined && current !== null && !visited.has(current); depth += 1) {
    visited.add(current);
    const message = current instanceof Error ? `${current.name}: ${current.message}` : String(current);
    if (/file is not (?:a )?database|notadb/i.test(message)) return true;
    current = typeof current === 'object' && 'cause' in current
      ? (current as { cause?: unknown }).cause
      : undefined;
  }
  return false;
}
