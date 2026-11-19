import type {
  KercadMcpCommand,
  KercadMcpCommandName,
  KercadMcpCommandResult,
  KercadMcpEditorSummary,
} from "@/lib/kercadMcpProtocol";
import { KERCAD_MCP_STALE_MS } from "@/lib/kercadMcpProtocol";

type PendingCommand = {
  editorId: string;
  resolve: (value: KercadMcpCommandResult) => void;
  timer: ReturnType<typeof setTimeout>;
};

type KercadMcpStore = {
  editors: Map<string, KercadMcpEditorSummary>;
  queues: Map<string, KercadMcpCommand[]>;
  pending: Map<string, PendingCommand>;
};

declare global {
  // eslint-disable-next-line no-var
  var __kercadMcpStore: KercadMcpStore | undefined;
}

function store() {
  globalThis.__kercadMcpStore ??= {
    editors: new Map<string, KercadMcpEditorSummary>(),
    queues: new Map<string, KercadMcpCommand[]>(),
    pending: new Map<string, PendingCommand>(),
  };
  return globalThis.__kercadMcpStore;
}

function createCommandId() {
  return globalThis.crypto?.randomUUID?.() ?? `sketchforge-mcp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function prune(current = Date.now()) {
  const state = store();
  for (const [editorId, editor] of state.editors) {
    if (current - editor.lastSeen <= KERCAD_MCP_STALE_MS) {
      continue;
    }
    state.editors.delete(editorId);
    state.queues.delete(editorId);
    for (const [commandId, pending] of state.pending) {
      if (pending.editorId !== editorId) {
        continue;
      }
      clearTimeout(pending.timer);
      state.pending.delete(commandId);
      pending.resolve({
        commandId,
        ok: false,
        error: `SketchForge editor ${editor.editorNumber} is no longer open`,
        completedAt: current,
      });
    }
  }
}

export function registerKercadMcpEditor(editor: Omit<KercadMcpEditorSummary, "lastSeen">) {
  const current = Date.now();
  prune(current);
  const state = store();
  state.editors.set(editor.editorId, { ...editor, lastSeen: current });
  state.queues.set(editor.editorId, state.queues.get(editor.editorId) ?? []);
}

export function listKercadMcpEditors() {
  prune();
  return [...store().editors.values()].sort((a, b) => a.editorNumber - b.editorNumber);
}

export function pollKercadMcpCommand(editorId: string) {
  prune();
  const queue = store().queues.get(editorId);
  return queue?.shift() ?? null;
}

export function completeKercadMcpCommand(editorId: string, result: KercadMcpCommandResult) {
  const state = store();
  const pending = state.pending.get(result.commandId);
  if (!pending || pending.editorId !== editorId) {
    return false;
  }
  clearTimeout(pending.timer);
  state.pending.delete(result.commandId);
  pending.resolve({ ...result, completedAt: result.completedAt ?? Date.now() });
  return true;
}

export function dispatchKercadMcpCommand({
  editorId,
  editorNumber,
  action,
  params = {},
  timeoutMs = 15000,
}: {
  editorId?: string;
  editorNumber?: number;
  action: KercadMcpCommandName;
  params?: Record<string, unknown>;
  timeoutMs?: number;
}) {
  prune();
  const state = store();
  const editor =
    (editorId ? state.editors.get(editorId) : null) ??
    (typeof editorNumber === "number" ? [...state.editors.values()].find((candidate) => candidate.editorNumber === editorNumber) : null);
  if (!editor) {
    return Promise.resolve({
      commandId: "",
      ok: false,
      error: typeof editorNumber === "number" ? `No open SketchForge editor ${editorNumber}` : "No matching open SketchForge editor",
      completedAt: Date.now(),
    } satisfies KercadMcpCommandResult);
  }

  const command: KercadMcpCommand = {
    id: createCommandId(),
    action,
    params,
    createdAt: Date.now(),
  };
  const queue = state.queues.get(editor.editorId) ?? [];
  queue.push(command);
  state.queues.set(editor.editorId, queue);

  return new Promise<KercadMcpCommandResult>((resolve) => {
    const timer = setTimeout(() => {
      state.pending.delete(command.id);
      resolve({
        commandId: command.id,
        ok: false,
        error: `Timed out waiting for SketchForge editor ${editor.editorNumber}`,
        completedAt: Date.now(),
      });
    }, Math.max(1000, Math.min(timeoutMs, 60000)));
    state.pending.set(command.id, { editorId: editor.editorId, resolve, timer });
  });
}
