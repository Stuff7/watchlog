<script lang="ts">
  import { local } from "./storage.svelte.ts";

  let step1_open = $state(false);
  let step2_open = $state(false);
  let step3_open = $state(false);

  $effect(() => {
    if (!local.dropbox_client_id || !local.dropbox_client_secret) {
      step1_open = true;
    } else if (!local.dropbox_refresh_token) {
      step2_open = true;
      step3_open = true;
    }
  });

  let auth_url = $derived(
    `https://www.dropbox.com/oauth2/authorize?client_id=${local.dropbox_client_id || "CLIENT_ID"}&response_type=code&token_access_type=offline`,
  );

  let curl_cmd = $derived(
    `curl -s https://api.dropbox.com/oauth2/token \\
  -d code=YOUR_CODE \\
  -d grant_type=authorization_code \\
  -u ${local.dropbox_client_id || "ID"}:${local.dropbox_client_secret || "SECRET"} \\
  | perl -ne 'print $1 if /"refresh_token":\\s*"([^"]+)"/'`,
  );
</script>

<div
  class="flex flex-col gap-3 bg-black/40 p-4 rounded border border-neutral-800 animate-in fade-in"
>
  <h3
    class="text-[10px] text-neutral-500 uppercase tracking-[0.2em] font-bold mb-1"
  >
    Setup Guide
  </h3>

  <details
    bind:open={step1_open}
    class="group border-b border-neutral-800/50 pb-3"
  >
    <summary
      class="flex justify-between items-center cursor-pointer list-none hover:text-amber-400 transition-colors"
    >
      <span class="text-sm font-bold text-neutral-300 group-open:text-amber-500"
        >1. Create Dropbox App</span
      >
      <span
        class="text-xs opacity-50 group-open:rotate-180 transition-transform"
        >↓</span
      >
    </summary>
    <div class="mt-3 text-sm text-neutral-400 pl-2 space-y-2 leading-relaxed">
      <p>
        Go to the <a
          href="https://www.dropbox.com/developers/apps/create"
          target="_blank"
          class="text-white underline">App Console</a
        >:
      </p>
      <ul class="list-disc ml-5 space-y-1">
        <li>Choose <b>Scoped Access</b> + <b>App Folder</b>.</li>
        <li>
          <b>Permissions:</b> Check <code>files.content.write</code> and
          <code>read</code>.
        </li>
        <li>
          <b>Settings:</b> Copy the <b>App Key</b> and <b>App Secret</b> into the
          inputs below.
        </li>
      </ul>
    </div>
  </details>

  <details
    bind:open={step2_open}
    class="group border-b border-neutral-800/50 pb-3"
  >
    <summary
      class="flex justify-between items-center cursor-pointer list-none hover:text-amber-400 transition-colors"
    >
      <span class="text-sm font-bold text-neutral-300 group-open:text-amber-500"
        >2. Get Authorization Code</span
      >
      <span
        class="text-xs opacity-50 group-open:rotate-180 transition-transform"
        >↓</span
      >
    </summary>
    <div class="mt-3 pl-2">
      <p class="text-sm text-neutral-400 mb-2">
        Authorize the app and copy the code provided:
      </p>
      <a
        href={auth_url}
        target="_blank"
        class="block p-3 bg-black rounded border border-neutral-800 text-blue-400 text-xs font-mono break-all hover:border-blue-900 transition-colors"
      >
        {auth_url}
      </a>
    </div>
  </details>

  <details bind:open={step3_open} class="group">
    <summary
      class="flex justify-between items-center cursor-pointer list-none hover:text-amber-400 transition-colors"
    >
      <span class="text-sm font-bold text-neutral-300 group-open:text-amber-500"
        >3. Generate Refresh Token</span
      >
      <span
        class="text-xs opacity-50 group-open:rotate-180 transition-transform"
        >↓</span
      >
    </summary>
    <div class="mt-3 pl-2">
      <p class="text-sm text-neutral-400 mb-2">
        Run this in your terminal (replace <code>YOUR_CODE</code>):
      </p>
      <code
        class="block bg-black p-4 rounded border border-neutral-800 text-amber-200 text-xs font-mono break-all leading-normal select-all"
      >
        {curl_cmd}
      </code>
    </div>
  </details>
</div>
