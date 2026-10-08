// Copy the built plugin into a vault: `npm run install-plugin -- /path/to/vault`
// Without a path it installs into ./demo-vault.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "fs"
import { join, resolve } from "path"

const vault = resolve(process.argv[2] ?? "demo-vault")
if (!existsSync(join(vault, ".obsidian"))) {
  console.error(`No .obsidian folder in ${vault}. Open it once in Obsidian first.`)
  process.exit(1)
}
const target = join(vault, ".obsidian", "plugins", "mdxcn")
mkdirSync(target, { recursive: true })
for (const file of ["main.js", "manifest.json", "styles.css"]) copyFileSync(file, join(target, file))

const list = join(vault, ".obsidian", "community-plugins.json")
const enabled = existsSync(list) ? JSON.parse(readFileSync(list, "utf8")) : []
if (!enabled.includes("mdxcn")) writeFileSync(list, JSON.stringify([...enabled, "mdxcn"], null, 2))
console.log(`Installed into ${target}. Reload Obsidian (or toggle the plugin) to pick it up.`)
