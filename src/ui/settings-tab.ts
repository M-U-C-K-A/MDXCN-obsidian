import { App, Component, PluginSettingTab, Setting } from "obsidian"
import { div } from "../dom"
import { findSpec } from "../registry"
import { renderGraph } from "../render"
import type { TemplateSyntax } from "../serialize"
import { DEFAULT_SETTINGS, PRESETS, type AccentMode, type MdxcnSettings } from "../settings"
import type { Palette } from "../types"

export interface SettingsHost {
  app: App
  settings: MdxcnSettings
  save(options?: { rerender?: boolean; commands?: boolean }): Promise<void>
}

export class MdxcnSettingTab extends PluginSettingTab {
  private preview: Component | null = null
  private previewEl: HTMLElement | null = null

  constructor(
    app: App,
    private plugin: SettingsHost & import("obsidian").Plugin
  ) {
    super(app, plugin)
  }

  display() {
    const { containerEl } = this
    const settings = this.plugin.settings
    containerEl.empty()
    containerEl.addClass("mdxcn-settings")

    /* Live preview */
    this.previewEl = div(containerEl, "mdxcn-settings-preview")
    this.renderPreview()

    new Setting(containerEl).setName("Contrast color").setHeading()

    new Setting(containerEl)
      .setName("Accent")
      .setDesc("The one contrast color mdxcn uses: the current row, the playhead, the fill, the live timer.")
      .addDropdown((dropdown) => {
        for (const [id, preset] of Object.entries(PRESETS)) dropdown.addOption(id, preset.name)
        dropdown.addOption("obsidian", "Obsidian accent (follows your theme)")
        dropdown.addOption("custom", "Custom…")
        dropdown.setValue(settings.accent).onChange(async (value) => {
          settings.accent = value as AccentMode
          const preset = PRESETS[value]
          if (preset) {
            settings.accentLight = preset.light
            settings.accentDark = preset.dark
          }
          await this.plugin.save()
          this.display()
        })
      })

    const swatches = new Setting(containerEl).setName("Presets").setDesc("Click a swatch.")
    const row = div(swatches.controlEl, "mdxcn-swatches")
    for (const [id, preset] of Object.entries(PRESETS)) {
      const swatch = row.createEl("button", { cls: "mdxcn-swatch", attr: { "aria-label": preset.name } })
      swatch.setCssProps({ "--swatch-light": preset.light, "--swatch-dark": preset.dark })
      if (settings.accent === id) swatch.addClass("is-active")
      swatch.addEventListener("click", async () => {
        settings.accent = id as AccentMode
        settings.accentLight = preset.light
        settings.accentDark = preset.dark
        await this.plugin.save()
        this.display()
      })
    }

    if (settings.accent !== "obsidian") {
      new Setting(containerEl)
        .setName("Accent in light mode")
        .addColorPicker((picker) =>
          picker.setValue(settings.accentLight).onChange(async (value) => {
            settings.accent = "custom"
            settings.accentLight = value
            await this.plugin.save()
            this.refreshPreview()
          })
        )
      new Setting(containerEl)
        .setName("Accent in dark mode")
        .addColorPicker((picker) =>
          picker.setValue(settings.accentDark).onChange(async (value) => {
            settings.accent = "custom"
            settings.accentDark = value
            await this.plugin.save()
            this.refreshPreview()
          })
        )
    }

    new Setting(containerEl)
      .setName("Palette")
      .setDesc("Mono uses only the accent (mdxcn's default). Duo and multi add the second and third colors to series and secondary states. A block can override it with palette: duo.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ mono: "Mono — one accent", duo: "Duo — accent + second", multi: "Multi — three colors" })
          .setValue(settings.palette)
          .onChange(async (value) => {
            settings.palette = value as Palette
            await this.plugin.save({ rerender: true })
            this.refreshPreview()
          })
      )

    for (const [key, label] of [
      ["accent2", "Second color"],
      ["accent3", "Third color"],
    ] as const) {
      new Setting(containerEl)
        .setName(label)
        .setDesc("Light / dark.")
        .addColorPicker((picker) =>
          picker.setValue(settings[`${key}Light`]).onChange(async (value) => {
            settings[`${key}Light`] = value
            await this.plugin.save()
            this.refreshPreview()
          })
        )
        .addColorPicker((picker) =>
          picker.setValue(settings[`${key}Dark`]).onChange(async (value) => {
            settings[`${key}Dark`] = value
            await this.plugin.save()
            this.refreshPreview()
          })
        )
    }

    new Setting(containerEl).setName("Frame").setHeading()

    new Setting(containerEl).setName("Border").addDropdown((dropdown) =>
      dropdown
        .addOptions({ dotted: "Dotted (mdxcn)", dashed: "Dashed", solid: "Solid", none: "None" })
        .setValue(settings.frameStyle)
        .onChange(async (value) => {
          settings.frameStyle = value as MdxcnSettings["frameStyle"]
          await this.plugin.save()
        })
    )

    new Setting(containerEl)
      .setName("Corner mark")
      .setDesc("Drawn on the four corners. Empty hides them.")
      .addText((text) =>
        text
          .setPlaceholder("+")
          .setValue(settings.corner)
          .onChange(async (value) => {
            settings.corner = value.slice(0, 2)
            await this.plugin.save()
          })
      )

    new Setting(containerEl)
      .setName("Font")
      .setDesc("Any CSS font-family. Empty uses Obsidian's monospace font. mdxcn.dev uses Geist Mono.")
      .addText((text) =>
        text
          .setPlaceholder('"Geist Mono", ui-monospace')
          .setValue(settings.font)
          .onChange(async (value) => {
            settings.font = value
            await this.plugin.save()
          })
      )

    new Setting(containerEl)
      .setName("Text size")
      .setDesc("Relative to the note's text.")
      .addSlider((slider) =>
        slider
          .setLimits(70, 120, 2.5)
          .setValue(settings.fontSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            settings.fontSize = value
            await this.plugin.save()
          })
      )

    new Setting(containerEl)
      .setName("Animations")
      .setDesc("Fade-up and fill-in when a figure scrolls into view (~220ms, no loops). Reduced-motion is always respected.")
      .addToggle((toggle) =>
        toggle.setValue(settings.animations).onChange(async (value) => {
          settings.animations = value
          await this.plugin.save({ rerender: true })
          this.refreshPreview()
        })
      )

    new Setting(containerEl).setName("Rendering").setHeading()

    new Setting(containerEl)
      .setName("Render plain ``` fences")
      .setDesc("A fence with no language that holds an mdxcn frame (+--- [ TITLE ] ---+) renders too, in reading view and Live Preview. Off: only ```mdx blocks render.")
      .addToggle((toggle) =>
        toggle.setValue(settings.renderUntagged).onChange(async (value) => {
          settings.renderUntagged = value
          await this.plugin.save({ rerender: true })
        })
      )

    new Setting(containerEl)
      .setName("Toolbar")
      .setDesc("Copy as ASCII / MDX / Comark and convert in place, on hover.")
      .addToggle((toggle) =>
        toggle.setValue(settings.toolbar).onChange(async (value) => {
          settings.toolbar = value
          await this.plugin.save()
        })
      )

    new Setting(containerEl).setName("Templates").setHeading()

    new Setting(containerEl)
      .setName("Template syntax")
      .setDesc("What the picker, the suggester and the commands insert.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({
            comark: "Comark — ::graph-gantt + YAML (recommended)",
            mdx: "MDX — <GraphGantt> with Markdown children",
            short: "Short — ```mdx gantt",
            ascii: "ASCII — the official fenced drawing",
          })
          .setValue(settings.templateSyntax)
          .onChange(async (value) => {
            settings.templateSyntax = value as TemplateSyntax
            await this.plugin.save()
          })
      )

    new Setting(containerEl)
      .setName("Suggester trigger")
      .setDesc("Type this at the start of a line, then a name (::gantt) to insert a template. Empty turns it off.")
      .addText((text) =>
        text
          .setPlaceholder("::")
          .setValue(settings.suggestTrigger)
          .onChange(async (value) => {
            settings.suggestTrigger = value.trim()
            await this.plugin.save()
          })
      )

    new Setting(containerEl)
      .setName("One command per component")
      .setDesc("Adds “Insert Gantt”, “Insert Timeline”… to the command palette and to slash commands. Needs a reload to remove them.")
      .addToggle((toggle) =>
        toggle.setValue(settings.componentCommands).onChange(async (value) => {
          settings.componentCommands = value
          await this.plugin.save({ commands: true })
        })
      )

    new Setting(containerEl).addButton((button) =>
      button.setButtonText("Reset to defaults").onClick(async () => {
        Object.assign(settings, { ...DEFAULT_SETTINGS, welcomed: true })
        await this.plugin.save({ rerender: true })
        this.display()
      })
    )
  }

  hide() {
    this.preview?.unload()
    this.preview = null
  }

  private refreshPreview() {
    this.renderPreview()
  }

  private renderPreview() {
    if (!this.previewEl) return
    this.preview?.unload()
    this.preview = new Component()
    this.preview.load()
    this.previewEl.empty()
    const spec = findSpec("gantt")!
    const { title, props = {}, body } = spec.template
    renderGraph(this.previewEl, spec, { title, ...props }, body, {
      app: this.app,
      component: this.preview,
      sourcePath: "",
      settings: this.plugin.settings,
      noToolbar: true,
    })
  }
}
