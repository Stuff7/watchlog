import sqlite3InitModule, {
  type Sqlite3Static,
  type Database,
  type WasmPointer,
  type SqlValue,
} from "@sqlite.org/sqlite-wasm";
import schema from "$/sql/migrations/0000.sql";

// -- Types --------------------------------------------------------------------

type InitMsg = {
  id: number;
  type: "init";
  payload: {
    refresh_token: string;
    client_id: string;
    client_secret: string;
    app_name: string;
  };
};

type SaveMsg = {
  id: number;
  type: "save";
  payload: { app_name: string };
};

type QueryMsg = {
  id: number;
  type: "query";
  payload: { sql: string; bind?: SqlValue[] };
};

type InboundMsg = InitMsg | SaveMsg | QueryMsg;

type InitReply = { id: number; type: "init" };
type SaveReply = { id: number; type: "save" };
type QueryReply = {
  id: number;
  type: "query";
  rows: Record<string, SqlValue>[];
};
type ErrorReply = { id: number; type: "error"; error: string };

export type OutboundMsg = InitReply | SaveReply | QueryReply | ErrorReply;

// -- State --------------------------------------------------------------------

const sqlite3: Sqlite3Static = await sqlite3InitModule();
let db: Database | null = null;

let refresh_token: string | null = null;
let client_id: string | null = null;
let client_secret: string | null = null;

let access_token: string | null = null;
let access_token_expires_at: number = 0; // epoch ms

// -- Token management ---------------------------------------------------------

async function refreshAccessToken(): Promise<void> {
  if (!refresh_token || !client_id || !client_secret) {
    throw new Error("OAuth credentials not initialized");
  }

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refresh_token,
    client_id: client_id,
    client_secret: client_secret,
  });

  const response = await fetch("https://api.dropbox.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = await response.json();

  access_token = data.access_token;
  // expires_in is in seconds; subtract 60s buffer to refresh slightly early
  access_token_expires_at = Date.now() + (data.expires_in - 60) * 1000;
}

async function getAccessToken(): Promise<string> {
  if (!access_token || Date.now() >= access_token_expires_at) {
    await refreshAccessToken();
  }
  return access_token!;
}

// -- Helpers ------------------------------------------------------------------

function dbPath(app_name: string): string {
  return `/Apps/${app_name}/db.sqlite`;
}

function serializeInternal(db_ptr: WasmPointer): Uint8Array {
  const p_size = sqlite3.wasm.alloc(8);
  try {
    const p_output = sqlite3.capi.sqlite3_serialize(db_ptr, "main", p_size, 0);

    if (p_output === 0) {
      throw new Error("Serialization failed: returned null pointer");
    }

    const size = Number(sqlite3.wasm.peek(p_size, "i64"));

    const binary = new Uint8Array(
      sqlite3.wasm.heap8u().buffer,
      p_output,
      size,
    ).slice();

    sqlite3.capi.sqlite3_free(p_output);

    return binary;
  } finally {
    sqlite3.wasm.dealloc(p_size);
  }
}

// -- Dropbox Actions ----------------------------------------------------------

async function loadFromDropbox(app_name: string): Promise<void> {
  const token = await getAccessToken();

  const response = await fetch(
    "https://content.dropboxapi.com/2/files/download",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({ path: dbPath(app_name) }),
      },
    },
  );

  if (db) db.close();
  db = new sqlite3.oo1.DB();

  if (response.status === 409) {
    db.exec(schema);
    return;
  }

  if (!response.ok) {
    throw new Error(`Dropbox download failed: ${response.status}`);
  }

  const binary = new Uint8Array(await response.arrayBuffer());
  const p = sqlite3.wasm.allocFromTypedArray(binary);

  const rc = sqlite3.capi.sqlite3_deserialize(
    db.pointer!,
    "main",
    p,
    binary.byteLength,
    binary.byteLength,
    sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE |
      sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE,
  );

  if (rc !== 0) {
    throw new Error(`SQLite deserialize failed with code: ${rc}`);
  }
}

async function saveToDropbox(app_name: string): Promise<void> {
  if (!db) throw new Error("No DB to save");

  const token = await getAccessToken();
  const binary = serializeInternal(db.pointer!);

  const response = await fetch(
    "https://content.dropboxapi.com/2/files/upload",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Dropbox-API-Arg": JSON.stringify({
          path: dbPath(app_name),
          mode: "overwrite",
          autorename: false,
          mute: false,
        }),
        "Content-Type": "application/octet-stream",
      },
      body: binary,
    },
  );

  if (!response.ok) {
    throw new Error(`Dropbox upload failed: ${response.status}`);
  }
}

// -- Message router -----------------------------------------------------------

self.addEventListener(
  "message",
  async (e: MessageEvent<InboundMsg>): Promise<void> => {
    const msg = e.data;
    try {
      switch (msg.type) {
        case "init": {
          refresh_token = msg.payload.refresh_token;
          client_id = msg.payload.client_id;
          client_secret = msg.payload.client_secret;
          await loadFromDropbox(msg.payload.app_name);
          self.postMessage({ id: msg.id, type: "init" } as InitReply);
          break;
        }
        case "save": {
          await saveToDropbox(msg.payload.app_name);
          self.postMessage({ id: msg.id, type: "save" } as SaveReply);
          break;
        }
        case "query": {
          if (!db) throw new Error("DB not initialized");
          const rows = db.exec({
            sql: msg.payload.sql,
            bind: msg.payload.bind,
            returnValue: "resultRows",
            rowMode: "object",
          });
          self.postMessage({ id: msg.id, type: "query", rows } as QueryReply);
          break;
        }
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      self.postMessage({ id: msg.id, type: "error", error } as ErrorReply);
    }
  },
);

self.postMessage("ready");
