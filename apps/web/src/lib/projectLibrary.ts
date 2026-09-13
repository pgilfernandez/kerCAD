import type { ParametricDocument } from "@/types/parametric";

export type ProjectLibraryEntry = {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  document: ParametricDocument;
  thumbnail?: string;
  thumbnailDocumentKey?: string;
  assets?: import("@/types/sketchforge").ProjectAsset[];
  sharedSource?: { fileName: string; revision: string };
};

const DATABASE_NAME = "educad.project-library";
const STORE_NAME = "projects";
const DATABASE_VERSION = 1;

function openProjectLibrary() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) database.createObjectStore(STORE_NAME, { keyPath: "id" });
    };
    request.onerror = () => reject(request.error ?? new Error("Could not open the project library."));
    request.onsuccess = () => resolve(request.result);
  });
}

export async function listLibraryProjects() {
  const database = await openProjectLibrary();
  try {
    return await new Promise<ProjectLibraryEntry[]>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).getAll();
      request.onerror = () => reject(request.error ?? new Error("Could not read the project library."));
      request.onsuccess = () => resolve((request.result as ProjectLibraryEntry[]).sort((a, b) => b.updatedAt - a.updatedAt));
    });
  } finally {
    database.close();
  }
}

export async function getLibraryProject(id: string) {
  const database = await openProjectLibrary();
  try {
    return await new Promise<ProjectLibraryEntry | null>((resolve, reject) => {
      const request = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME).get(id);
      request.onerror = () => reject(request.error ?? new Error("Could not read the project."));
      request.onsuccess = () => resolve((request.result as ProjectLibraryEntry | undefined) ?? null);
    });
  } finally {
    database.close();
  }
}

export async function saveLibraryProject(entry: ProjectLibraryEntry) {
  const database = await openProjectLibrary();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(entry);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not save the project."));
    });
  } finally {
    database.close();
  }
}

export async function updateLibraryProjectThumbnail(id: string, thumbnail: string, thumbnailDocumentKey?: string) {
  const database = await openProjectLibrary();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => {
        const current = request.result as ProjectLibraryEntry | undefined;
        if (current) store.put({ ...current, thumbnail, thumbnailDocumentKey });
      };
      request.onerror = () => reject(request.error ?? new Error("Could not update the project thumbnail."));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not update the project thumbnail."));
    });
  } finally {
    database.close();
  }
}

export async function deleteLibraryProject(id: string) {
  const database = await openProjectLibrary();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).delete(id);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not delete the project."));
    });
  } finally {
    database.close();
  }
}

export function newProjectLibraryId() {
  return typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `project-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
