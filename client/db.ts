import type { SqlValue } from "@sqlite.org/sqlite-wasm";
import type { OutboundMsg } from "$/db.worker.ts";

type PendingEntry = {
  resolve: (value: OutboundMsg) => void;
  reject: (reason: Error) => void;
};

let worker: Worker;
const pending = new Map<number, PendingEntry>();
let seq = 0;

function send(type: string, payload: unknown): Promise<OutboundMsg> {
  return new Promise<OutboundMsg>((resolve, reject) => {
    const id = seq++;
    pending.set(id, { resolve, reject });
    worker.postMessage({ id, type, payload });
  });
}

export function initWorker(): Promise<void> {
  return new Promise((res, rej) => {
    worker = new Worker(new URL("./db.worker.js", import.meta.url), {
      type: "module",
    });

    worker.addEventListener(
      "message",
      (e: MessageEvent<string>) => {
        if (e.data === "ready") {
          worker.addEventListener(
            "message",
            (e: MessageEvent<OutboundMsg>): void => {
              const msg = e.data;
              const entry = pending.get(msg.id);
              if (entry === undefined) return;
              pending.delete(msg.id);
              if (msg.type === "error") {
                entry.reject(new Error(msg.error));
              } else {
                entry.resolve(msg);
              }
            },
          );
          res();
        } else {
          rej(`Expected "ready" as first message, instead got ${e.data}`);
        }
      },
      { once: true },
    );
  });
}

export async function initDB(
  refresh_token: string,
  client_id: string,
  client_secret: string,
  app_name: string,
): Promise<void> {
  const reply = await send("init", {
    refresh_token,
    client_id,
    client_secret,
    app_name,
  });
  if (reply.type !== "init") throw new Error("Unexpected reply type");
}

export async function saveDB(app_name: string): Promise<void> {
  await send("save", { app_name });
}

export async function query<T extends Record<string, SqlValue>>(
  sql: string,
  bind?: SqlValue[],
): Promise<T[]> {
  const reply = await send("query", { sql, bind });
  if (reply.type !== "query") throw new Error("Unexpected reply type");
  return reply.rows as T[];
}
