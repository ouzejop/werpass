export type ShareIntentState = 'pending_connection' | 'activating' | 'failed';

export type ShareIntent = {
  id: string;
  documentId: string;
  state: ShareIntentState;
  createdAt: string;
};

export const createPendingShareIntent = (
  id: string,
  documentId: string,
  createdAt: string,
): ShareIntent => {
  if (!/^[0-9a-f-]{36}$/i.test(id) || !/^[0-9a-f-]{36}$/i.test(documentId)) throw new Error('Identifiant de partage invalide.');
  return { id, documentId, state: 'pending_connection', createdAt };
};

export function transitionShareIntent(state: ShareIntentState, next: ShareIntentState): ShareIntentState {
  const allowed: Record<ShareIntentState, ShareIntentState[]> = {
    pending_connection: ['activating'],
    activating: ['failed'],
    failed: ['activating'],
  };
  if (!allowed[state].includes(next)) throw new Error(`Transition de partage invalide: ${state} -> ${next}`);
  return next;
}
