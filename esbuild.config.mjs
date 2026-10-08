import esbuild from "esbuild"
import process from "process"
import builtins from "builtin-modules"

const banner = `/*
obsidian-mdxcn — mdxcn components, native in Obsidian.
Source: https://github.com/M-U-C-K-A/MDXCN-obsidian · mdxcn: https://mdxcn.dev (MIT, shadcn-labs).
*/`

const prod = process.argv[2] === "production"

const context = await esbuild.context({
  banner: { js: banner },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: [
    "obsidian",
    "electron",
    "@codemirror/autocomplete",
    "@codemirror/collab",
    "@codemirror/commands",
    "@codemirror/language",
    "@codemirror/lint",
    "@codemirror/search",
    "@codemirror/state",
    "@codemirror/view",
    "@lezer/common",
    "@lezer/highlight",
    "@lezer/lr",
    ...builtins,
  ],
  format: "cjs",
  target: "es2020",
  logLevel: "info",
  sourcemap: prod ? false : "inline",
  treeShaking: true,
  minify: prod,
  outfile: "main.js",
})

if (prod) {
  await context.rebuild()
  process.exit(0)
} else {
  await context.watch()
}
