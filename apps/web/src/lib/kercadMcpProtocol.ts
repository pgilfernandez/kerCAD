import type { GridSize, ShapeKind, WorkplaneWorkspaceSettings } from "@/types/workplane";

export const KERCAD_MCP_ROUTE = "/api/sketchforge-mcp";
export const KERCAD_MCP_STALE_MS = 6500;
export const KERCAD_MCP_POLL_MS = 220;

export type KercadMcpViewFace = "current" | "home" | "top" | "bottom" | "front" | "back" | "right" | "left";

export type KercadMcpShapeSummary = {
  id: string;
  name: string;
  kind: ShapeKind;
  color: string;
  hole: boolean;
  locked: boolean;
  hidden: boolean;
  position: {
    x: number;
    z: number;
    elevation: number;
  };
  dimensions: {
    width: number;
    depth: number;
    height: number;
    size: number;
  };
  rotation: {
    x: number;
    y: number;
    z: number;
  };
  mirror: {
    x: boolean;
    y: boolean;
    z: boolean;
  };
  edgeTreatments: unknown[];
  groupedCount: number;
  importedTriangles: number;
  cadDisplayEdgeCount: number | null;
  sketchPointCount: number;
  sketchSegmentCount: number;
  children?: KercadMcpShapeSummary[];
};

export type KercadMcpSceneSummary = {
  projectId: string | null;
  projectName: string;
  notice: string;
  selectedIds: string[];
  shapeCount: number;
  workspace: WorkplaneWorkspaceSettings;
  snap: GridSize | null;
  shapes: KercadMcpShapeSummary[];
};

export type KercadMcpEditorSummary = {
  editorId: string;
  editorNumber: number;
  projectId: string | null;
  projectName: string;
  url: string;
  focused: boolean;
  shapeCount: number;
  selectedCount: number;
  notice: string;
  lastError: string | null;
  lastSeen: number;
};

export type KercadMcpCommandName =
  | "get_scene"
  | "list_objects"
  | "select_objects"
  | "delete_objects"
  | "create_shape"
  | "import_mesh"
  | "update_object"
  | "align_objects"
  | "group_objects"
  | "ungroup_objects"
  | "boolean_cut"
  | "separate_parts"
  | "list_edges"
  | "apply_edge_treatment"
  | "inspect_errors"
  | "capture_image";

export type KercadMcpCommand = {
  id: string;
  action: KercadMcpCommandName;
  params: Record<string, unknown>;
  createdAt: number;
};

export type KercadMcpCommandResult = {
  commandId: string;
  ok: boolean;
  data?: unknown;
  error?: string;
  completedAt?: number;
};

export type KercadMcpHeartbeatPayload = {
  type: "heartbeat";
  editor: Omit<KercadMcpEditorSummary, "lastSeen">;
};

export type KercadMcpPollPayload = {
  type: "poll";
  editorId: string;
};

export type KercadMcpResultPayload = {
  type: "result";
  editorId: string;
  result: KercadMcpCommandResult;
};

export type KercadMcpDispatchPayload = {
  type: "command";
  editorId?: string;
  editorNumber?: number;
  action: KercadMcpCommandName;
  params?: Record<string, unknown>;
  timeoutMs?: number;
};

export type KercadMcpApiPayload =
  | KercadMcpHeartbeatPayload
  | KercadMcpPollPayload
  | KercadMcpResultPayload
  | KercadMcpDispatchPayload;
