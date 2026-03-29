import { initDB } from "./db.ts";

const settings: {
  dropbox_refresh_token?: string;
  dropbox_client_id?: string;
  dropbox_client_secret?: string;
  dropbox_app_name?: string;
  tmdb_key?: string;
  autoconnect?: boolean;
} = JSON.parse(localStorage.getItem("settings") || "{}");

export const local = $state({
  tmdb_key: settings.tmdb_key ?? "",
  autoconnect: settings.autoconnect ?? false,
  dropbox_refresh_token: settings.dropbox_refresh_token ?? "",
  dropbox_client_id: settings.dropbox_client_id ?? "",
  dropbox_client_secret: settings.dropbox_client_secret ?? "",
  dropbox_app_name: settings.dropbox_app_name ?? "",
  db_connected: false,
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
    }),
  );
}

export async function connect() {
  try {
    await initDB(
      local.dropbox_refresh_token,
      local.dropbox_client_id,
      local.dropbox_client_secret,
      local.dropbox_app_name,
    );

    saveLocal();

    local.db_connected = true;
    local.error = "";
  } catch (e: unknown) {
    local.db_connected = false;
    local.error = e instanceof Error ? e.message : String(e);
  }
}

export function disconnect() {
  local.db_connected = false;
  local.error = "";
  // might want to send a 'close' message to worker here
}
