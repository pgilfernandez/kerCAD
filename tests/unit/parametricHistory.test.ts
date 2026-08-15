import { describe, expect, it } from "vitest";
import { cloneDocument, createStarterDocument } from "../../apps/web/src/lib/parametricDocument";
import {
  beginHistoryTransaction,
  cancelHistoryTransaction,
  commitHistoryDocument,
  createParametricHistory,
  currentHistoryDocument,
  finishHistoryTransaction,
  redoParametricHistory,
  undoParametricHistory,
} from "../../apps/web/src/lib/parametricHistory";

function renamed(document: ReturnType<typeof createStarterDocument>, name: string) {
  const next = cloneDocument(document);
  next.name = name;
  next.updatedAt += 1;
  return next;
}

describe("parametric history transactions", () => {
  it("coalesces continuous edits into one undo entry", () => {
    const original = createStarterDocument(1);
    let history = beginHistoryTransaction(createParametricHistory(original));
    history = commitHistoryDocument(history, renamed(currentHistoryDocument(history), "A"));
    history = commitHistoryDocument(history, renamed(currentHistoryDocument(history), "AB"));

    expect(history.entries).toHaveLength(1);
    expect(currentHistoryDocument(history).name).toBe("AB");

    history = finishHistoryTransaction(history);
    expect(history.entries).toHaveLength(2);
    expect(undoParametricHistory(history).entries[0]).toBe(original);
    expect(currentHistoryDocument(undoParametricHistory(history)).name).toBe(original.name);
  });

  it("cancels a transaction without destroying the redo branch", () => {
    const original = createStarterDocument(1);
    const edited = renamed(original, "Committed");
    let history = commitHistoryDocument(createParametricHistory(original), edited);
    history = undoParametricHistory(history);
    history = beginHistoryTransaction(history);
    history = commitHistoryDocument(history, renamed(currentHistoryDocument(history), "Cancelled"));
    history = cancelHistoryTransaction(history);

    expect(currentHistoryDocument(history).name).toBe(original.name);
    expect(currentHistoryDocument(redoParametricHistory(history)).name).toBe("Committed");
  });

  it("does not create entries for no-op transactions and trims redo only on confirmation", () => {
    const original = createStarterDocument(1);
    let history = commitHistoryDocument(createParametricHistory(original), renamed(original, "Old redo"));
    history = undoParametricHistory(history);
    history = beginHistoryTransaction(history);
    history = commitHistoryDocument(history, renamed(currentHistoryDocument(history), "Replacement"));

    expect(history.entries).toHaveLength(2);
    expect(history.entries[1].name).toBe("Old redo");

    history = finishHistoryTransaction(history);
    expect(history.entries).toHaveLength(2);
    expect(history.entries[1].name).toBe("Replacement");

    history = beginHistoryTransaction(history);
    history = finishHistoryTransaction(history);
    expect(history.entries).toHaveLength(2);
  });
});
