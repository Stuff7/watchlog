import { initDB } from "./db.ts";

type Settings = {
  dropbox_refresh_token?: string;
  dropbox_client_id?: string;
  dropbox_client_secret?: string;
  dropbox_app_name?: string;
  tmdb_key?: string;
  autoconnect?: boolean;
  autosave?: boolean;
  autosave_delay_ms?: number;
};

const settings: Settings = JSON.parse(localStorage.getItem("settings") || "{}");

export const local = $state({
  dropbox_refresh_token: settings.dropbox_refresh_token ?? "",
  dropbox_client_id: settings.dropbox_client_id ?? "",
  dropbox_client_secret: settings.dropbox_client_secret ?? "",
  dropbox_app_name: settings.dropbox_app_name ?? "",
  tmdb_key: settings.tmdb_key ?? "",
  autoconnect: settings.autoconnect ?? false,
  autosave: settings.autosave ?? true,
  autosave_delay_ms: settings.autosave_delay_ms ?? 10e3,
  db_connected: false,
  db_reload: 0,
  connecting_db: false,
  saving_db: false,
  db_dirty: false,
  error: "",
});

export function saveLocal() {
  localStorage.setItem(
    "settings",
    JSON.stringify({
      tmdb_key: local.tmdb_key,
      autoconnect: local.autoconnect,
      dropbox_refresh_token: local.dropbox_refresh_token,
      dropbox_client_id: local.dropbox_client_id,
      dropbox_client_secret: local.dropbox_client_secret,
      dropbox_app_name: local.dropbox_app_name,
      autosave: local.autosave,
      autosave_delay_ms: local.autosave_delay_ms,
    } satisfies Settings),
  );
}

export async function connect() {
  try {
    local.connecting_db = true;
    await initDB(
      local.dropbox_refresh_token,
      local.dropbox_client_id,
      local.dropbox_client_secret,
      local.dropbox_app_name,
    );

    saveLocal();

    local.db_connected = true;
    local.db_reload++;
    local.error = "";
  } catch (e: unknown) {
    local.db_connected = false;
    local.error = e instanceof Error ? e.message : String(e);
  } finally {
    local.connecting_db = false;
  }
}

export function disconnect() {
  local.db_connected = false;
  local.error = "";
  // might want to send a 'close' message to worker here
}
