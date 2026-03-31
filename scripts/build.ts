import fs from "node:fs";
import path from "node:path";
import esbuild, { type Plugin, type PluginBuild } from "esbuild";
import { compile } from "svelte/compiler";
import type { CompileOptions } from "svelte/compiler";
import { fileURLToPath } from "node:url";
import { walk } from "@std/fs/walk";

// --- Paths --------------------------------------------------------------------

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "client");
const PUB = path.join(ROOT, "public");
const OUT = path.join(ROOT, "dist");
const MANIFEST = path.join(OUT, ".build-manifest.json");

const isDev =
  Deno.env.get("NODE_ENV") === "development" || Deno.args.includes("--dev");

const BASE_PATH = isDev ? "" : "/watchlog";
// --- Config -------------------------------------------------------------------

const TAILWIND_IN = path.join(SRC, "styles.css");
const TAILWIND_OUT = path.join(OUT, "watchlog.css");

const SVELTE_COMPILE_OPTIONS = {
  dev: isDev,
  css: "external",
} satisfies CompileOptions;

// --- Build step contract ------------------------------------------------------

type BuildStep<
  TInput = void,
  TOutput extends { files: string[] } = { files: string[] },
> = {
  name: string;
  /** Runs the step and returns every file path it wrote, plus any data downstream steps need. */
  run: (input: TInput) => Promise<TOutput>;
};

// --- Terminal colours ---------------------------------------------------------

const ansi = (c: number) => (s: string) => `\x1b[${c}m${s}\x1b[0m`;
const bold = ansi(1),
  dim = ansi(2),
  red = ansi(31),
  yellow = ansi(33),
  cyan = ansi(36),
  gray = ansi(90),
  white = ansi(97);

// --- Svelte diagnostics -------------------------------------------------------

type SvelteError = {
  message: string;
  start?: { line: number; column: number };
  frame?: string;
  code?: string;
};

function renderFrame(frame: string, paint: (s: string) => string): string {
  return frame
    .split("\n")
    .map((line) => {
      const m = line.match(/^(\s*\d+\s*\|\s?)(.*)/);
      if (m) return `   ${gray("|")}  ${gray(m[1])}${m[2]}`;
      if (/^\s*\^+/.test(line)) return `   ${gray("|")}  ${bold(paint(line))}`;
      return `   ${gray("|")}  ${dim(line)}`;
    })
    .join("\n");
}

function printDiagnostic(
  level: "ERROR" | "WARN",
  filePath: string,
  err: SvelteError,
): void {
  const paint = level === "ERROR" ? red : yellow;
  const icon = level === "ERROR" ? "✖" : "⚠";
  const loc = err.start ? `${err.start.line}:${err.start.column}` : "?:?";
  const rule = dim("-".repeat(60));
  const out = level === "ERROR" ? console.error : console.warn;

  out(
    [
      `\n   ${rule}`,
      `   ${bold(paint(`${icon} svelte[${level}]`))}  ${dim(err.code ?? "")}`,
      `   ${rule}`,
      `   ${gray(".-")} ${cyan(path.relative(ROOT, filePath))}${gray(`:${loc}`)}`,
      `   ${gray("|")}`,
      err.frame
        ? renderFrame(err.frame, paint)
        : `   ${gray("|")}  ${dim("(no source available)")}`,
      `   ${gray("|")}`,
      `   ${gray(".-")} ${bold(white(err.message))}`,
      "\n",
    ].join("\n"),
  );
}

function throwSvelteError(err: unknown, filePath: string): never {
  printDiagnostic("ERROR", filePath, err as SvelteError);
  throw new Error(
    `[svelte] ${path.relative(ROOT, filePath)} — ${(err as SvelteError).message}`,
  );
}

// --- Svelte compilation -------------------------------------------------------

function wrapRuneModule(source: string): string {
  return `<script lang="ts" module>${source}</script>`;
}

function compileSvelte(
  source: string,
  filePath: string,
  componentCss: string[],
): string {
  const { js, css, warnings } = compile(source, {
    filename: filePath,
    generate: "client",
    ...SVELTE_COMPILE_OPTIONS,
  });

  for (const w of warnings) printDiagnostic("WARN", filePath, w as SvelteError);
  if (css?.code?.trim()) componentCss.push(css.code);

  return js.code;
}

// --- esbuild plugin -----------------------------------------------------------

function makeSveltePlugin(componentCss: string[]): Plugin {
  return {
    name: "svelte",
    setup(build: PluginBuild) {
      const handle =
        (runeModule: boolean) => async (args: { path: string }) => {
          try {
            const raw = await fs.promises.readFile(args.path, "utf8");
            const source = runeModule ? wrapRuneModule(raw) : raw;
            return {
              contents: compileSvelte(source, args.path, componentCss),
              loader: "js" as const,
            };
          } catch (err) {
            throwSvelteError(err, args.path);
          }
        };

      build.onLoad({ filter: /\.svelte\.(ts|js)$/ }, handle(true));
      build.onLoad({ filter: /\.svelte$/ }, handle(false));
    },
  };
}

// --- Manifest -----------------------------------------------------------------

async function readManifest(): Promise<string[]> {
  try {
    const raw = JSON.parse(await fs.promises.readFile(MANIFEST, "utf8"));
    if (!Array.isArray(raw) || !raw.every((x) => typeof x === "string"))
      throw new Error("Manifest corrupt or malformed");
    return raw;
  } catch (err) {
    console.warn(
      `⚠ Manifest unreadable, skipping cleanup: ${(err as Error).message}`,
    );
    return [];
  }
}

async function writeManifest(paths: string[]): Promise<void> {
  await fs.promises.writeFile(MANIFEST, JSON.stringify(paths, null, 2));
}

// --- Build steps --------------------------------------------------------------

async function clean(): Promise<void> {
  await fs.promises.mkdir(OUT, { recursive: true });
  const prev = await readManifest();
  await Promise.all(prev.map((f) => fs.promises.rm(f, { force: true })));
}

const copyPublic: BuildStep = {
  name: "Public",
  async run(): Promise<{ files: string[] }> {
    if (!fs.existsSync(PUB)) return { files: [] };

    const files: string[] = [];

    async function copy(src: string, dest: string): Promise<void> {
      await fs.promises.mkdir(dest, { recursive: true });
      for await (const entry of Deno.readDir(src)) {
        const s = path.join(src, entry.name);
        const d = path.join(dest, entry.name);
        if (entry.isDirectory) {
          await copy(s, d);
        } else {
          await fs.promises.copyFile(s, d);
          files.push(d);
        }
      }
    }

    await copy(PUB, OUT);

    async function findWasm(): Promise<string> {
      for await (const entry of walk(path.join(ROOT, "node_modules"), {
        match: [/sqlite3\.wasm$/],
        maxDepth: 8,
      })) {
        return entry.path;
      }
      throw new Error("sqlite3.wasm not found in node_modules");
    }

    await fs.promises.copyFile(
      await findWasm(),
      path.join(OUT, "sqlite3.wasm"),
    );

    console.log(
      `✅ ${path.relative(ROOT, PUB)}/ → ${path.relative(ROOT, OUT)}/`,
    );
    return { files };
  },
};

const buildSvelte: BuildStep<
  void,
  { files: string[]; componentCss: string[] }
> = {
  name: "Svelte",
  async run(): Promise<{ files: string[]; componentCss: string[] }> {
    const outfile = path.join(OUT, "watchlog.js");
    const componentCss: string[] = [];
    const result = await esbuild.build({
      entryPoints: [path.join(SRC, "main.ts"), path.join(SRC, "db.worker.ts")],
      bundle: true,
      outdir: OUT,
      format: "esm",
      loader: { ".sql": "text" },
      minify: !isDev,
      sourcemap: isDev,
      platform: "browser",
      target: "esnext",
      drop: isDev ? [] : ["console", "debugger"],
      define: {
        ...(isDev ? {} : { "process.env.NODE_ENV": '"production"' }),
        "import.meta.env.BASE": `"${BASE_PATH}"`,
      },
      plugins: [makeSveltePlugin(componentCss)],
      metafile: true,
    });

    if (!result.metafile)
      throw new Error("esbuild metafile missing — this should never happen");
    const files = Object.keys(result.metafile.outputs).map((p) =>
      path.resolve(p),
    );
    console.log(`✅ WatchLog → ${path.relative(ROOT, outfile)}`);
    return { files, componentCss };
  },
};

const buildCss: BuildStep<string[]> = {
  name: "CSS",
  async run(componentCss: string[]): Promise<{ files: string[] }> {
    // Rewrite relative @import paths to absolute so they resolve from any
    // working directory — the temp input file won't live next to the source.
    const globalCss = (await fs.promises.readFile(TAILWIND_IN, "utf8")).replace(
      /@import\s+["'](\..*?)["']/g,
      (_, p) => `@import "${path.resolve(SRC, p)}"`,
    );

    const extra = componentCss.length
      ? `\n@reference "${TAILWIND_IN}";\n${componentCss.join("\n")}`
      : "";

    const tmpIn = path.join(ROOT, "tmp", "_input.css");
    await fs.promises.mkdir(path.dirname(tmpIn), { recursive: true });
    await fs.promises.writeFile(tmpIn, globalCss + extra, "utf8");

    try {
      const { code, stderr } = await new Deno.Command("tailwindcss", {
        args: ["-i", tmpIn, "-o", TAILWIND_OUT, ...(isDev ? [] : ["-m"])],
      }).output();

      if (code !== 0)
        throw new Error(`Tailwind Error:\n${new TextDecoder().decode(stderr)}`);

      console.log(`✅ TailwindCSS → ${path.relative(ROOT, TAILWIND_OUT)}`);
      return { files: [TAILWIND_OUT] };
    } finally {
      await fs.promises.rm(tmpIn, { force: true });
    }
  },
};

const writeGithubPages: BuildStep = {
  name: "GitHub Pages",
  async run(): Promise<{ files: string[] }> {
    if (isDev) return { files: [] };

    const notFoundHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <script>sessionStorage.redirect = location.pathname;</script>
  <meta http-equiv="refresh" content="0;url=${BASE_PATH}/">
</head>
</html>`;

    const redirectSnippet = `<script>
  const r = sessionStorage.redirect;
  delete sessionStorage.redirect;
  if (r && r !== location.pathname) history.replaceState(null, null, r);
</script>`;

    const notFoundPath = path.join(OUT, "404.html");
    await fs.promises.writeFile(notFoundPath, notFoundHtml, "utf8");

    const indexPath = path.join(OUT, "index.html");
    const index = await fs.promises.readFile(indexPath, "utf8");
    await fs.promises.writeFile(
      indexPath,
      index.replace("<head>", `<head>\n  ${redirectSnippet}`),
      "utf8",
    );

    console.log(`✅ GitHub Pages → 404.html + index.html patched`);
    return { files: [notFoundPath] };
  },
};

// --- Entry --------------------------------------------------------------------

const t = "🎉 Build complete";
console.time(t);

try {
  await clean();

  // copyPublic and buildSvelte are independent. buildCss receives componentCss
  // as an explicit argument — no shared mutable state.
  const [{ files: publicFiles }, { files: svelteFiles, componentCss }] =
    await Promise.all([copyPublic.run(), buildSvelte.run()]);

  const { files: cssFiles } = await buildCss.run(componentCss);
  const { files: pagesFiles } = await writeGithubPages.run();

  await writeManifest([
    ...publicFiles,
    ...svelteFiles,
    ...cssFiles,
    ...pagesFiles,
    MANIFEST,
  ]);

  console.timeEnd(t);
} catch (err) {
  console.error(
    `\n✖ Build failed:\n  ${err instanceof Error ? err.message : String(err)}\n`,
    err,
  );
  if (!isDev) Deno.exit(1);
} finally {
  await esbuild.stop();
}
