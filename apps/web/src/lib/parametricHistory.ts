import type { ParametricDocument } from "@/types/parametric";

export type ParametricHistoryState = {
  entries: ParametricDocument[];
  index: number;
  transaction: { baseIndex: number; draft: ParametricDocument } | null;
};

function sameDocumentContent(left: ParametricDocument, right: ParametricDocument) {
  const { updatedAt: _leftUpdatedAt, ...leftContent } = left;
  const { updatedAt: _rightUpdatedAt, ...rightContent } = right;
  return JSON.stringify(leftContent) === JSON.stringify(rightContent);
}

export function createParametricHistory(document: ParametricDocument): ParametricHistoryState {
  return { entries: [document], index: 0, transaction: null };
}

export function currentHistoryDocument(history: ParametricHistoryState) {
  return history.transaction?.draft ?? history.entries[history.index];
}

export function beginHistoryTransaction(history: ParametricHistoryState): ParametricHistoryState {
  if (history.transaction) return history;
  return {
    ...history,
    transaction: { baseIndex: history.index, draft: history.entries[history.index] },
  };
}

export function commitHistoryDocument(history: ParametricHistoryState, document: ParametricDocument, limit = 100): ParametricHistoryState {
  if (history.transaction) {
    if (sameDocumentContent(history.transaction.draft, document)) return history;
    return { ...history, transaction: { ...history.transaction, draft: document } };
  }
  const current = history.entries[history.index];
  if (sameDocumentContent(current, document)) return history;
  const entries = [...history.entries.slice(0, history.index + 1), document].slice(-Math.max(1, limit));
  return { entries, index: entries.length - 1, transaction: null };
}

export function finishHistoryTransaction(history: ParametricHistoryState, limit = 100): ParametricHistoryState {
  const transaction = history.transaction;
  if (!transaction) return history;
  const base = history.entries[transaction.baseIndex];
  if (sameDocumentContent(base, transaction.draft)) return { ...history, transaction: null };
  const entries = [...history.entries.slice(0, transaction.baseIndex + 1), transaction.draft].slice(-Math.max(1, limit));
  return { entries, index: entries.length - 1, transaction: null };
}

export function cancelHistoryTransaction(history: ParametricHistoryState): ParametricHistoryState {
  return history.transaction ? { ...history, transaction: null } : history;
}

export function undoParametricHistory(history: ParametricHistoryState): ParametricHistoryState {
  if (history.transaction) return cancelHistoryTransaction(history);
  return { ...history, index: Math.max(0, history.index - 1) };
}

export function redoParametricHistory(history: ParametricHistoryState): ParametricHistoryState {
  if (history.transaction) return cancelHistoryTransaction(history);
  return { ...history, index: Math.min(history.entries.length - 1, history.index + 1) };
}
