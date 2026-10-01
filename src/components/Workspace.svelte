<script lang="ts">
  import { onMount, tick } from "svelte";
  import { profileArchive, windowsProfileArchive } from "../lib/archive";
  import { reorderRules } from "../lib/reorder";
  import { importProfileZip } from "../lib/import-zip";
  import {
    example,
    blankRule,
    oval,
    xccdf,
    authoringIssues,
    readProject,
    type Project,
  } from "../lib/generate";
  import {
    blankWindowsRule,
    readWindowsProject,
    windowsAuthoringIssues,
    windowsExample,
    windowsOval,
    windowsXccdf,
    type WindowsProject,
  } from "../lib/windows-generate";
  let project: Project = structuredClone(example),
    windowsProject: WindowsProject = structuredClone(windowsExample),
    tab: "oval" | "xccdf" = "xccdf",
    windowsTab: "oval" | "xccdf" = "xccdf",
    workspaceView: "linux" | "windows" = "linux",
    active = 1,
    windowsActive = 1,
    ready = false,
    saved = "Loading local draft…",
    message = "";
  let draggedId: number | null = null,
    dropId: number | null = null,
    dropAfter = false,
    reorderStatus = "";
  let input: HTMLInputElement, zipInput: HTMLInputElement;
  let importingZip = false;
  const legacyWorkspaceKey = "toolbox:workspace:v1",
    linuxWorkspaceKey = "toolbox:workspace:linux:v1",
    windowsWorkspaceKey = "toolbox:workspace:windows:v1";
  type ThemeMode = "light" | "system" | "dark";
  let themeMode: ThemeMode = "system",
    resolvedTheme: "light" | "dark" = "light";
  let colorPickerOpen = false,
    accentHex = "#167c70",
    red = 22,
    green = 124,
    blue = 112;

  const themeColorKey = "toolbox:theme-color",
    legacyAccentKey = "toolbox:accent",
    themeKey = "toolbox:theme";
  function normalizeHex(value: string) {
    const compact = value.trim().replace(/^#/, "");
    return /^[0-9a-f]{6}$/i.test(compact) ? `#${compact.toLowerCase()}` : null;
  }
  function applyAccent(value: string, persist = true) {
    const hex = normalizeHex(value);
    if (!hex) return;
    accentHex = hex;
    red = Number.parseInt(hex.slice(1, 3), 16);
    green = Number.parseInt(hex.slice(3, 5), 16);
    blue = Number.parseInt(hex.slice(5, 7), 16);
    const luminance = 0.2126 * red + 0.7152 * green + 0.0722 * blue;
    const root = document.documentElement.style;
    root.setProperty("--accent", hex);
    root.setProperty("--accent-soft", `rgb(${red} ${green} ${blue} / 18%)`);
    root.setProperty("--accent-hover", `color-mix(in srgb, ${hex} 82%, black)`);
    root.setProperty(
      "--accent-contrast",
      luminance > 150 ? "#111827" : "#ffffff",
    );
    if (persist) localStorage.setItem(themeColorKey, hex);
  }
  function applyRgb() {
    red = Math.max(0, Math.min(255, Math.round(Number(red) || 0)));
    green = Math.max(0, Math.min(255, Math.round(Number(green) || 0)));
    blue = Math.max(0, Math.min(255, Math.round(Number(blue) || 0)));
    applyAccent(
      `#${[red, green, blue].map((value) => value.toString(16).padStart(2, "0")).join("")}`,
    );
  }
  function applyHex() {
    const hex = normalizeHex(accentHex);
    if (hex) applyAccent(hex);
  }
  function resetAccent() {
    localStorage.removeItem(themeColorKey);
    localStorage.removeItem(legacyAccentKey);
    document.documentElement.style.removeProperty("--accent");
    document.documentElement.style.removeProperty("--accent-soft");
    document.documentElement.style.removeProperty("--accent-hover");
    document.documentElement.style.removeProperty("--accent-contrast");
    accentHex = "#167c70";
    red = 22;
    green = 124;
    blue = 112;
  }
  function applyTheme(
    mode: ThemeMode,
    systemDark = window.matchMedia("(prefers-color-scheme: dark)").matches,
  ) {
    resolvedTheme =
      mode === "dark" || (mode === "system" && systemDark) ? "dark" : "light";
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.themeMode = mode;
  }
  function setTheme(mode: ThemeMode) {
    themeMode = mode;
    localStorage.setItem(themeKey, mode);
    applyTheme(mode);
  }
  onMount(() => {
    try {
      const savedLinuxWorkspace =
        localStorage.getItem(linuxWorkspaceKey) ??
        localStorage.getItem(legacyWorkspaceKey);
      if (savedLinuxWorkspace) {
        const state = JSON.parse(savedLinuxWorkspace);
        project = readProject(JSON.stringify(state.project));
        tab = state.tab === "xccdf" ? "xccdf" : "oval";
        active = project.rules.some((rule) => rule.id === state.active)
          ? state.active
          : (project.rules[0]?.id ?? 1);
      } else active = project.rules[0]?.id ?? 1;

      const savedWindowsWorkspace = localStorage.getItem(windowsWorkspaceKey);
      if (savedWindowsWorkspace) {
        const state = JSON.parse(savedWindowsWorkspace);
        windowsProject = readWindowsProject(JSON.stringify(state.project));
        windowsTab = state.tab === "oval" ? "oval" : "xccdf";
        windowsActive = windowsProject.rules.some(
          (rule) => rule.id === state.active,
        )
          ? state.active
          : (windowsProject.rules[0]?.id ?? 1);
      } else windowsActive = windowsProject.rules[0]?.id ?? 1;
    } catch {
      message =
        "Could not restore the saved workspace. A fresh draft was opened.";
      active = project.rules[0]?.id ?? 1;
    }
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const stored = localStorage.getItem(themeKey);
    themeMode =
      stored === "dark" || stored === "system" || stored === "light"
        ? stored
        : "system";
    applyTheme(themeMode, media.matches);
    const storedThemeColor =
      localStorage.getItem(themeColorKey) ??
      localStorage.getItem(legacyAccentKey);
    if (storedThemeColor) {
      applyAccent(storedThemeColor, false);
      localStorage.setItem(themeColorKey, storedThemeColor);
      localStorage.removeItem(legacyAccentKey);
    }
    const followSystem = (event: MediaQueryListEvent) => {
      if (themeMode === "system") applyTheme("system", event.matches);
    };
    media.addEventListener("change", followSystem);
    ready = true;
    return () => media.removeEventListener("change", followSystem);
  });
  $: if (ready) {
    try {
      localStorage.setItem(
        linuxWorkspaceKey,
        JSON.stringify({ project, tab, active }),
      );
      localStorage.setItem(
        windowsWorkspaceKey,
        JSON.stringify({
          project: windowsProject,
          tab: windowsTab,
          active: windowsActive,
        }),
      );
      saved = "Saved in this browser";
    } catch {
      saved = "Browser save failed — export JSON";
    }
  }
  $: rule = project.rules.find((r) => r.id === active);
  $: warnings = authoringIssues(project);
  $: errors = warnings.map((issue) => issue.message);
  $: xml = tab === "oval" ? oval(project) : xccdf(project);
  $: windowsRule = windowsProject.rules.find(
    (candidate) => candidate.id === windowsActive,
  );
  $: windowsWarnings = windowsAuthoringIssues(windowsProject);
  $: windowsErrors = windowsWarnings.map((issue) => issue.message);
  $: windowsXml =
    windowsTab === "oval"
      ? windowsOval(windowsProject)
      : windowsXccdf(windowsProject);
  function download(name: string, content: BlobPart, type = "application/xml") {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    message = `Downloaded ${name}`;
  }
  function moveRule(id: number, target: number, after = false) {
    const next = reorderRules(project.rules, id, target, after);
    if (next === project.rules) return;
    project = { ...project, rules: next };
    reorderStatus = `${next.find((r) => r.id === id)?.title || "Untitled rule"} moved to position ${next.findIndex((r) => r.id === id) + 1} of ${next.length}.`;
  }
  function moveWindowsRule(id: number, target: number, after = false) {
    const next = reorderRules(windowsProject.rules, id, target, after);
    if (next === windowsProject.rules) return;
    windowsProject = { ...windowsProject, rules: next };
    reorderStatus = `${next.find((candidate) => candidate.id === id)?.title || "Untitled rule"} moved to position ${next.findIndex((candidate) => candidate.id === id) + 1} of ${next.length}.`;
  }
  function startDrag(event: DragEvent, id: number) {
    draggedId = id;
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", String(id));
    }
  }
  function dragOver(event: DragEvent, id: number) {
    if (draggedId === null || draggedId === id) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect();
    dropId = id;
    dropAfter = event.clientY > bounds.top + bounds.height / 2;
  }
  function endDrag() {
    draggedId = null;
    dropId = null;
  }
  function dropRule(event: DragEvent, id: number) {
    event.preventDefault();
    if (draggedId !== null && dropId === id) moveRule(draggedId, id, dropAfter);
    endDrag();
  }
  function dropWindowsRule(event: DragEvent, id: number) {
    event.preventDefault();
    if (draggedId !== null && dropId === id) {
      moveWindowsRule(draggedId, id, dropAfter);
    }
    endDrag();
  }
  function moveWithKeys(event: KeyboardEvent, id: number, index: number) {
    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      moveRule(id, project.rules[index - 1].id);
    }
    if (event.key === "ArrowDown" && index < project.rules.length - 1) {
      event.preventDefault();
      moveRule(id, project.rules[index + 1].id, true);
    }
  }
  function moveWindowsWithKeys(
    event: KeyboardEvent,
    id: number,
    index: number,
  ) {
    if (event.key === "ArrowUp" && index > 0) {
      event.preventDefault();
      moveWindowsRule(id, windowsProject.rules[index - 1].id);
    }
    if (event.key === "ArrowDown" && index < windowsProject.rules.length - 1) {
      event.preventDefault();
      moveWindowsRule(id, windowsProject.rules[index + 1].id, true);
    }
  }
  function newProject() {
    if (
      !confirm(
        "Start a new project? Current work will be replaced. Export JSON first if you want to keep it.",
      )
    )
      return;
    project = structuredClone(example);
    active = 1;
    tab = "xccdf";
    endDrag();
    reorderStatus = "";
    message = "New Linux project started with an editable SSH example.";
  }
  function newWindowsProject() {
    if (
      !confirm(
        "Start a new experimental Windows project? Current Windows work will be replaced. Export JSON first if you want to keep it.",
      )
    )
      return;
    windowsProject = structuredClone(windowsExample);
    windowsActive = 1;
    windowsTab = "xccdf";
    message = "New experimental Windows project started.";
  }
  async function importZip(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    importingZip = true;
    try {
      if (file.size > 10 * 1024 * 1024)
        throw Error("ZIP must be smaller than 10 MB.");
      const next = importProfileZip(new Uint8Array(await file.arrayBuffer()));
      if (
        confirm(
          `Validated ${next.rules.length} rules in “${next.title}”. Replace the current project? Exported files will use this editor’s generated IDs and metadata.`,
        )
      ) {
        project = next;
        active = project.rules[0]?.id ?? 1;
        tab = "xccdf";
        endDrag();
        message =
          "ZIP imported. XML types, supported checks, and references verified; full XSD validation is not performed.";
      }
    } catch (e) {
      message = "ZIP import failed: " + (e as Error).message;
    } finally {
      importingZip = false;
      zipInput.value = "";
    }
  }
  function touch() {
    project = { ...project };
  }
  function touchWindows() {
    windowsProject = { ...windowsProject };
  }
  async function exportXml() {
    if (errors.length) {
      message = "Export blocked: " + errors[0];
      await tick();
      document.getElementById("export-issues")?.focus();
      return;
    }
    try {
      const archive = profileArchive(project);
      download(
        "toolbox-profile.zip",
        new Uint8Array(archive).buffer,
        "application/zip",
      );
    } catch (e) {
      message = "Could not export ZIP: " + (e as Error).message;
    }
  }
  async function exportWindowsXml() {
    if (windowsErrors.length) {
      message = "Export blocked: " + windowsErrors[0];
      await tick();
      document.getElementById("windows-export-issues")?.focus();
      return;
    }
    try {
      download(
        "toolbox-windows-profile.zip",
        new Uint8Array(windowsProfileArchive(windowsProject)).buffer,
        "application/zip",
      );
    } catch (error) {
      message = "Could not export Windows ZIP: " + (error as Error).message;
    }
  }
  async function editRule(id: number) {
    tab = "oval";
    active = id;
    await tick();
    document.getElementById("rule-title")?.focus();
  }
  function add() {
    const id = Math.max(0, ...project.rules.map((r) => r.id)) + 1;
    project.rules = [...project.rules, blankRule(id)];
    active = id;
  }
  function addWindowsRule() {
    const id = Math.max(0, ...windowsProject.rules.map((rule) => rule.id)) + 1;
    windowsProject.rules = [...windowsProject.rules, blankWindowsRule(id)];
    windowsActive = id;
  }
  function remove() {
    if (!rule || !confirm(`Delete “${rule.title}”?`)) return;
    project.rules = project.rules.filter((r) => r.id !== active);
    active = project.rules[0]?.id ?? 1;
  }
  function removeWindowsRule() {
    if (
      !windowsRule ||
      !confirm(`Delete “${windowsRule.title || "Untitled rule"}”?`)
    )
      return;
    windowsProject.rules = windowsProject.rules.filter(
      (candidate) => candidate.id !== windowsActive,
    );
    windowsActive = windowsProject.rules[0]?.id ?? 1;
  }
  async function restore(event: Event) {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    try {
      if (file.size > 2_000_000)
        throw Error("Project file must be smaller than 2 MB.");
      const raw = await file.text();
      if (workspaceView === "linux") {
        const next = readProject(raw);
        if (confirm("Replace the current Linux draft with this project?")) {
          project = next;
          active = project.rules[0]?.id ?? 1;
          message = "Linux workspace JSON imported successfully.";
        }
      } else {
        const next = readWindowsProject(raw);
        if (confirm("Replace the current Windows draft with this project?")) {
          windowsProject = next;
          windowsActive = windowsProject.rules[0]?.id ?? 1;
          message = "Windows workspace JSON imported successfully.";
        }
      }
    } catch (e) {
      message = (e as Error).message;
    }
    input.value = "";
  }
  async function copy() {
    try {
      await navigator.clipboard.writeText(xml);
      message = "XML copied to clipboard.";
    } catch {
      message = "Clipboard unavailable. Download the XML instead.";
    }
  }
  async function copyWindowsXml() {
    try {
      await navigator.clipboard.writeText(windowsXml);
      message = "Windows XML copied to clipboard.";
    } catch {
      message = "Clipboard unavailable. Download the XML instead.";
    }
  }
  function exportProjectJson() {
    const windows = workspaceView === "windows";
    download(
      windows ? "toolbox-windows-project.json" : "toolbox-linux-project.json",
      JSON.stringify(windows ? windowsProject : project, null, 2),
      "application/json",
    );
  }
</script>

<svelte:head
  ><meta
    name="theme-color"
    content={resolvedTheme === "dark" ? "#171a21" : "#f4f5f7"}
  /></svelte:head
>
<div class="app">
  <aside class="sidebar">
    <a class="brand" href="/" aria-label="Kade's VM Toolbox home"
      ><svg class="brand-icon" aria-hidden="true" viewBox="0 0 32 32"
        ><path d="M16 3 29 27H3Z" /></svg
      ><span>Kade's VM Toolbox</span></a
    >
    <div class="tool-nav" aria-label="Generators">
      <button
        class="nav-item"
        class:nav-active={workspaceView === "linux"}
        aria-current={workspaceView === "linux" ? "page" : undefined}
        on:click={() => (workspaceView = "linux")}
      >
        <svg class="icon" aria-hidden="true" viewBox="0 0 24 24"
          ><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></svg
        >
        OVAL &amp; XCCDF generator - Linux
      </button>
      <button
        class="nav-item"
        class:nav-active={workspaceView === "windows"}
        aria-current={workspaceView === "windows" ? "page" : undefined}
        on:click={() => (workspaceView = "windows")}
      >
        <svg class="icon" aria-hidden="true" viewBox="0 0 24 24"
          ><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /></svg
        >
        OVAL &amp; XCCDF generator - Windows
      </button>
    </div>

    <div class="sidebar-actions" aria-label="Project persistence">
      <div class="action-separator"><span>Workspace backup</span></div>
      <div class="action-group">
        <button class="secondary" on:click={() => input.click()}
          ><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"
            ><path d="M12 4v12m0 0 5-5m-5 5-5-5M5 20h14" /></svg
          >Import JSON</button
        ><button class="secondary" on:click={exportProjectJson}
          ><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"
            ><path d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14" /></svg
          >Export JSON</button
        >
      </div>
      <input
        hidden
        class="json-file-input"
        aria-label="Import OVAL and XCCDF ZIP"
        bind:this={zipInput}
        type="file"
        accept=".zip,application/zip"
        on:change={importZip}
      />
      <input
        hidden
        class="json-file-input"
        aria-label="Import project JSON file"
        bind:this={input}
        type="file"
        accept=".json,application/json"
        on:change={restore}
      />
      <div class="action-separator"><span>Appearance</span></div>
      <div class="appearance-controls">
        <div class="theme-switcher" role="radiogroup" aria-label="Color theme">
          <button
            class:active={themeMode === "light"}
            role="radio"
            aria-checked={themeMode === "light"}
            aria-label="Use light theme"
            title="Light"
            on:click={() => setTheme("light")}
            ><svg aria-hidden="true" viewBox="0 0 24 24"
              ><circle cx="12" cy="12" r="4" /><path
                d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"
              /></svg
            ></button
          >
          <button
            class:active={themeMode === "system"}
            role="radio"
            aria-checked={themeMode === "system"}
            aria-label="Use system theme"
            title="System"
            on:click={() => setTheme("system")}
            ><svg aria-hidden="true" viewBox="0 0 24 24"
              ><circle cx="12" cy="12" r="8" /><path
                class="system-fill"
                d="M12 4a8 8 0 0 0 0 16Z"
              /></svg
            ></button
          >
          <button
            class:active={themeMode === "dark"}
            role="radio"
            aria-checked={themeMode === "dark"}
            aria-label="Use dark theme"
            title="Dark"
            on:click={() => setTheme("dark")}
            ><svg aria-hidden="true" viewBox="0 0 24 24"
              ><path
                d="M20 15.2A8.5 8.5 0 0 1 8.8 4 8.5 8.5 0 1 0 20 15.2Z"
              /></svg
            ></button
          >
        </div>
        <div class="accent-picker">
          <button
            class="accent-button"
            aria-label="Choose theme color"
            aria-expanded={colorPickerOpen}
            title="Theme color"
            on:click={() => (colorPickerOpen = !colorPickerOpen)}
            ><svg aria-hidden="true" viewBox="0 0 24 24"
              ><path
                d="m19 3 2 2-9.5 9.5-3-3L18 2l1 1ZM7.5 12.5 4 16v4h4l3.5-3.5"
              /><path d="M3 21h7" /></svg
            ><span class="accent-dot" style={`background:${accentHex}`}
            ></span></button
          >
          {#if colorPickerOpen}<div class="color-menu">
              <strong>Theme color</strong>
              <button class="reset-accent" type="button" on:click={resetAccent}
                ><span></span>Default</button
              >
              <label
                >Hex <input
                  class="mono"
                  value={accentHex}
                  aria-invalid={!normalizeHex(accentHex)}
                  on:input={(event) => {
                    accentHex = event.currentTarget.value;
                    applyHex();
                  }}
                  placeholder="#167c70"
                /></label
              >
              <div class="rgb-fields">
                <label
                  >R <input
                    type="number"
                    min="0"
                    max="255"
                    bind:value={red}
                    inputmode="numeric"
                    on:change={applyRgb}
                  /></label
                >
                <label
                  >G <input
                    type="number"
                    min="0"
                    max="255"
                    bind:value={green}
                    inputmode="numeric"
                    on:change={applyRgb}
                  /></label
                >
                <label
                  >B <input
                    type="number"
                    min="0"
                    max="255"
                    bind:value={blue}
                    inputmode="numeric"
                    on:change={applyRgb}
                  /></label
                >
              </div>
            </div>{/if}
        </div>
      </div>
    </div>
  </aside>
  <main>
    {#if workspaceView === "linux"}
      <div class="content">
        <div class="page-heading">
          <h1>OVAL &amp; XCCDF generator - Linux</h1>
          <div class="header-actions">
            <button class="secondary" on:click={newProject}
              ><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"
                ><path d="M12 5v14M5 12h14" /></svg
              >New project</button
            ><button
              class="secondary"
              disabled={importingZip}
              on:click={() => zipInput.click()}
              ><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"
                ><path d="M12 4v12m0 0 5-5m-5 5-5-5M5 20h14" /></svg
              >{importingZip ? "Checking ZIP…" : "Import ZIP"}</button
            ><button class="primary" on:click={exportXml}
              ><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"
                ><path d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14" /></svg
              >Export ZIP</button
            >
          </div>
        </div>
        <div class="tabs" role="tablist" aria-label="File generator">
          <button
            role="tab"
            aria-selected={tab === "xccdf"}
            class:chosen={tab === "xccdf"}
            on:click={() => (tab = "xccdf")}>XCCDF profile</button
          ><button
            role="tab"
            aria-selected={tab === "oval"}
            class:chosen={tab === "oval"}
            on:click={() => (tab = "oval")}
            >OVAL definitions <span>{project.rules.length}</span></button
          >
        </div>
        {#if warnings.length}<div
            id="export-issues"
            class="export-errors"
            tabindex="-1"
            aria-label="Items to fix before export"
          >
            <strong>Fix these items before exporting</strong>
            <ul>
              {#each warnings as warning}<li>
                  <span>{warning.message}</span
                  >{#if warning.ruleId !== undefined}<button
                      class="edit-rule"
                      on:click={() => editRule(warning.ruleId!)}
                      >Edit rule</button
                    >{/if}
                </li>{/each}
            </ul>
          </div>{/if}
        <div class="work-grid">
          <section class="editor" aria-label="Generator form">
            <div class="panel-heading">
              <div>
                <h2>
                  {tab === "oval" ? "OVAL Rule settings" : "Benchmark settings"}
                </h2>
              </div>
            </div>
            <div class="form-body" on:input={touch} on:change={touch}>
              <label
                >Namespace <input
                  bind:value={project.namespace}
                  placeholder="org.example"
                  spellcheck="false"
                /><small>Used to create unique IDs across both files.</small
                ></label
              >
              {#if tab === "oval"}
                <div class="definition-bar">
                  <label class="grow"
                    >OVAL Rule <select bind:value={active}
                      >{#each project.rules as r}<option value={r.id}
                          >#{r.id} {r.title.trim() || "Untitled rule"}</option
                        >{/each}</select
                    ></label
                  ><button
                    class="square"
                    title="Add OVAL rule"
                    aria-label="Add OVAL rule"
                    on:click={add}>+</button
                  ><button
                    class="square remove-rule"
                    title="Delete selected OVAL rule"
                    aria-label="Delete selected OVAL rule"
                    disabled={!rule}
                    on:click={remove}>−</button
                  >
                </div>
                {#if rule}
                  <label
                    >Name <input
                      id="rule-title"
                      bind:value={rule.title}
                      placeholder="Disable SSH root login"
                    /></label
                  >
                  <label
                    >Description <textarea
                      bind:value={rule.description}
                      rows="2"
                      placeholder="Ensure direct root login over SSH is disabled."
                    ></textarea></label
                  >
                  <label
                    >Check type <select bind:value={rule.kind}
                      ><option value="textfile"
                        >Text File Content (Regular Expression)</option
                      ><option value="systemd">Systemd Unit Property</option
                      ><option value="dpkg">Debian Package Is Installed</option
                      ><option value="rpm">RPM Package Is Installed</option
                      ><option value="file"
                        >File Ownership and Permissions</option
                      ><option value="sysctl">Kernel sysctl Value</option
                      ></select
                    ></label
                  >
                  <div class="divider"></div>
                  {#if rule.kind === "textfile"}
                    <label
                      >File path <input
                        class="mono"
                        bind:value={rule.path}
                        placeholder="/etc/ssh/sshd_config"
                        spellcheck="false"
                      /></label
                    >
                    <label
                      >Required pattern <textarea
                        class="mono pattern"
                        bind:value={rule.pattern}
                        rows="2"
                        placeholder="^[\t ]*PermitRootLogin[\t ]+no[\t ]*$"
                        spellcheck="false"></textarea><small
                        >Passes when at least one line matches the OVAL regular
                        expression.</small
                      ></label
                    >
                  {:else if rule.kind === "systemd"}
                    <label
                      >Unit <input
                        class="mono"
                        bind:value={rule.unit}
                        placeholder="auditd.service"
                      /></label
                    >
                    <label
                      >Systemd property <input
                        class="mono"
                        bind:value={rule.property}
                        placeholder="ActiveState"
                        list="systemd-property-options"
                      /></label
                    >
                    <label
                      >Required property value <input
                        class="mono"
                        bind:value={rule.expectedValue}
                        placeholder="active"
                        list="systemd-value-options"
                      /><small
                        >Choose a common value or enter another value supported
                        by the selected property and unit.</small
                      ></label
                    >
                    <datalist id="systemd-property-options">
                      <option
                        value="ActiveState"
                        label="ActiveState (overall unit state)"
                      ></option>
                      <option
                        value="SubState"
                        label="SubState (unit-specific detailed state)"
                      ></option>
                      <option
                        value="LoadState"
                        label="LoadState (whether the unit loaded)"
                      ></option>
                      <option
                        value="UnitFileState"
                        label="UnitFileState (enablement state)"
                      ></option>
                    </datalist>
                    <datalist id="systemd-value-options">
                      <option
                        value="active"
                        label="active (active and operational)"
                      ></option>
                      <option value="inactive" label="inactive (not active)"
                      ></option>
                      <option value="failed" label="failed (unit failed)"
                      ></option>
                      <option value="activating" label="activating (starting)"
                      ></option>
                      <option
                        value="deactivating"
                        label="deactivating (stopping)"
                      ></option>
                      <option
                        value="reloading"
                        label="reloading (reloading configuration)"
                      ></option>
                      <option value="loaded" label="loaded (unit file loaded)"
                      ></option>
                      <option
                        value="not-found"
                        label="not-found (unit file not found)"
                      ></option>
                      <option value="enabled" label="enabled (enabled at boot)"
                      ></option>
                      <option
                        value="disabled"
                        label="disabled (disabled at boot)"
                      ></option>
                      <option
                        value="static"
                        label="static (no enable instructions)"
                      ></option>
                      <option
                        value="masked"
                        label="masked (prevented from starting)"
                      ></option>
                      <option
                        value="running"
                        label="running (service process running)"
                      ></option>
                      <option
                        value="exited"
                        label="exited (process completed successfully)"
                      ></option>
                      <option value="dead" label="dead (not running)"></option>
                    </datalist>
                  {:else if rule.kind === "dpkg" || rule.kind === "rpm"}
                    <label
                      >{rule.kind === "dpkg" ? "DEB" : "RPM"} package name
                      <input
                        class="mono"
                        bind:value={rule.packageName}
                        placeholder={rule.kind === "dpkg" ? "auditd" : "audit"}
                      /></label
                    >
                    <small
                      >The definition passes when the named package is
                      installed.</small
                    >
                  {:else if rule.kind === "file"}
                    <label
                      >File path <input
                        class="mono"
                        bind:value={rule.path}
                        placeholder="/etc/shadow"
                        spellcheck="false"
                      /></label
                    >
                    <div class="field-grid">
                      <label
                        >Owner UID <input
                          class="mono"
                          bind:value={rule.ownerId}
                          inputmode="numeric"
                          placeholder="0"
                        /></label
                      >
                      <label
                        >Group GID <input
                          class="mono"
                          bind:value={rule.groupId}
                          inputmode="numeric"
                          placeholder="0"
                        /></label
                      >
                    </div>
                    <label
                      >Exact mode <input
                        class="mono"
                        bind:value={rule.fileMode}
                        placeholder="0640"
                        maxlength="4"
                      /><small
                        >Three or four octal digits, including special
                        permission bits.</small
                      ></label
                    >
                  {:else if rule.kind === "sysctl"}
                    <label
                      >sysctl name <input
                        class="mono"
                        bind:value={rule.sysctlName}
                        placeholder="net.ipv4.ip_forward"
                        spellcheck="false"
                      /></label
                    >
                    <label
                      >Required value <input
                        class="mono"
                        bind:value={rule.expectedValue}
                        placeholder="0"
                      /><small
                        >Compared as an exact literal value through the matching
                        /proc/sys file.</small
                      ></label
                    >
                  {/if}
                  <div class="definition-footer">
                    <code>oval:{project.namespace}:def:{rule.id}</code>
                  </div>
                {:else}<div class="empty">
                    No definitions yet.<button class="primary" on:click={add}
                      >Add definition</button
                    >
                  </div>{/if}
              {:else}
                <label
                  >Benchmark title <input
                    bind:value={project.title}
                    placeholder="Linux security baseline"
                  /></label
                ><label
                  >Profile name <input
                    bind:value={project.profileTitle}
                    placeholder="Linux server hardening profile"
                  /></label
                ><label
                  >Description <textarea
                    rows="2"
                    bind:value={project.description}
                    placeholder="Custom configuration checks for managed Linux systems."
                  ></textarea></label
                >
                <div class="field-grid">
                  <label>Version <input bind:value={project.version} /></label>
                  <label
                    >Status <select bind:value={project.status}
                      ><option value="incomplete">Incomplete</option><option
                        value="draft">Draft</option
                      ><option value="interim">Interim</option><option
                        value="accepted">Accepted</option
                      ><option value="deprecated">Deprecated</option></select
                    ></label
                  >
                </div>
                <div class="divider"></div>
                <div class="check-title"><h3>Profile rules</h3></div>
                <p class="rule-help">
                  Drag the grip to reorder rules, or use the arrow buttons.
                </p>
                <div role="list" aria-label="Profile rules">
                  {#each project.rules as r, i (r.id)}<div
                      role="listitem"
                      class="rule-row"
                      class:dragging={draggedId === r.id}
                      class:drop-before={dropId === r.id && !dropAfter}
                      class:drop-after={dropId === r.id && dropAfter}
                      on:dragover={(event) => dragOver(event, r.id)}
                      on:drop={(event) => dropRule(event, r.id)}
                    >
                      <button
                        class="drag-handle"
                        draggable="true"
                        aria-label={`Reorder ${r.title || "Untitled rule"}. Use up and down arrow keys.`}
                        title="Drag to reorder; arrow keys also work"
                        on:dragstart={(event) => startDrag(event, r.id)}
                        on:dragend={endDrag}
                        on:keydown={(event) => moveWithKeys(event, r.id, i)}
                        >⠿</button
                      >
                      <div class="rule-name">{r.title || "Untitled rule"}</div>
                      <select
                        aria-label={`Severity for ${r.title}`}
                        bind:value={r.severity}
                        ><option value="low">Low</option><option value="medium"
                          >Medium</option
                        ><option value="high">High</option></select
                      >
                      <div class="reorder-buttons">
                        <button
                          aria-label={`Move ${r.title || "Untitled rule"} up`}
                          disabled={i === 0}
                          on:click={() =>
                            moveRule(r.id, project.rules[i - 1].id)}>↑</button
                        ><button
                          aria-label={`Move ${r.title || "Untitled rule"} down`}
                          disabled={i === project.rules.length - 1}
                          on:click={() =>
                            moveRule(r.id, project.rules[i + 1].id, true)}
                          >↓</button
                        >
                      </div>
                    </div>{/each}
                </div>
                <span class="sr-only" role="status" aria-live="polite"
                  >{reorderStatus}</span
                >
              {/if}
            </div>
          </section>
          <section class="preview" aria-label="XML preview">
            <div class="preview-heading">
              <div>
                <span class="code-icon">&lt;/&gt;</span>
                <h2>Live preview</h2>
              </div>
              <button on:click={copy}>Copy XML</button>
            </div>
            <div class="file-bar"><span>◇ &nbsp; {tab}.xml</span></div>
            <div class="code-scroll">
              <pre>{#each xml.split("\n") as line, i}<div
                    class="code-line"><span class="line-number">{i + 1}</span
                    ><code>{line}</code></div>{/each}</pre>
            </div>
            <div class="preview-footer">
              <span>{xml.split("\n").length} lines</span>
            </div>
          </section>
        </div>
        {#if message}<div class="toast" role="status">
            {message}<button
              aria-label="Dismiss notification"
              on:click={() => (message = "")}>×</button
            >
          </div>{/if}
      </div>
    {:else}
      <div class="content">
        <div class="page-heading">
          <h1>OVAL &amp; XCCDF generator - Windows</h1>
          <div class="header-actions">
            <button class="secondary" on:click={newWindowsProject}
              ><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"
                ><path d="M12 5v14M5 12h14" /></svg
              >New project</button
            ><button class="primary" on:click={exportWindowsXml}
              ><svg class="icon" aria-hidden="true" viewBox="0 0 24 24"
                ><path d="M12 16V4m0 0L7 9m5-5 5 5M5 20h14" /></svg
              >Export ZIP</button
            >
          </div>
        </div>
        <div class="experimental-notice" role="note">
          <strong>Experimental Windows generator</strong>
          <span>
            These Windows features are a work in progress and are experimental.
          </span>
        </div>
        <div class="tabs" role="tablist" aria-label="Windows file generator">
          <button
            role="tab"
            aria-selected={windowsTab === "xccdf"}
            class:chosen={windowsTab === "xccdf"}
            on:click={() => (windowsTab = "xccdf")}>XCCDF profile</button
          ><button
            role="tab"
            aria-selected={windowsTab === "oval"}
            class:chosen={windowsTab === "oval"}
            on:click={() => (windowsTab = "oval")}
            >OVAL definitions <span>{windowsProject.rules.length}</span></button
          >
        </div>
        {#if windowsWarnings.length}<div
            id="windows-export-issues"
            class="export-errors"
            tabindex="-1"
            aria-label="Windows items to fix before export"
          >
            <strong>Fix these items before exporting</strong>
            <ul>
              {#each windowsWarnings as warning}<li>
                  <span>{warning.message}</span>
                </li>{/each}
            </ul>
          </div>{/if}
        <div class="work-grid">
          <section class="editor" aria-label="Windows generator form">
            <div class="panel-heading">
              <div>
                <h2>
                  {windowsTab === "oval"
                    ? "Windows registry rule"
                    : "Benchmark settings"}
                </h2>
              </div>
            </div>
            <div
              class="form-body"
              on:input={touchWindows}
              on:change={touchWindows}
            >
              <label
                >Namespace <input
                  bind:value={windowsProject.namespace}
                  placeholder="org.example.windows"
                  spellcheck="false"
                /><small>Used to create unique IDs across both files.</small
                ></label
              >
              {#if windowsTab === "oval"}
                <div class="definition-bar">
                  <label class="grow"
                    >OVAL Rule <select bind:value={windowsActive}
                      >{#each windowsProject.rules as candidate}<option
                          value={candidate.id}
                          >#{candidate.id}
                          {candidate.title.trim() || "Untitled rule"}</option
                        >{/each}</select
                    ></label
                  ><button
                    class="square"
                    title="Add Windows rule"
                    aria-label="Add Windows rule"
                    on:click={addWindowsRule}>+</button
                  ><button
                    class="square remove-rule"
                    title="Delete selected Windows rule"
                    aria-label="Delete selected Windows rule"
                    disabled={!windowsRule}
                    on:click={removeWindowsRule}>−</button
                  >
                </div>
                {#if windowsRule}
                  <label
                    >Name <input
                      bind:value={windowsRule.title}
                      placeholder="Disable SMBv1 server support"
                    /></label
                  ><label
                    >Description <textarea
                      bind:value={windowsRule.description}
                      rows="2"
                      placeholder="Require the SMB1 registry value to be disabled."
                    ></textarea></label
                  >
                  <div class="divider"></div>
                  <label
                    >Registry hive <select bind:value={windowsRule.hive}
                      ><option value="HKEY_LOCAL_MACHINE"
                        >HKEY_LOCAL_MACHINE</option
                      ><option value="HKEY_CURRENT_USER"
                        >HKEY_CURRENT_USER</option
                      ><option value="HKEY_USERS">HKEY_USERS</option><option
                        value="HKEY_CLASSES_ROOT">HKEY_CLASSES_ROOT</option
                      ></select
                    ></label
                  ><label
                    >Registry key <input
                      class="mono"
                      bind:value={windowsRule.key}
                      placeholder="SYSTEM\CurrentControlSet\Services\LanmanServer\Parameters"
                      spellcheck="false"
                    /></label
                  ><label
                    >Value name <input
                      class="mono"
                      bind:value={windowsRule.name}
                      placeholder="SMB1"
                      spellcheck="false"
                    /></label
                  >
                  <div class="registry-grid">
                    <label
                      >Datatype <select bind:value={windowsRule.datatype}
                        ><option value="string">String</option><option
                          value="int">Integer</option
                        ><option value="boolean">Boolean</option></select
                      ></label
                    ><label
                      >Comparison <select bind:value={windowsRule.operation}
                        ><option value="equals">Equals</option><option
                          value="not equal">Does not equal</option
                        ><option value="pattern match">Pattern match</option
                        ></select
                      ></label
                    >
                  </div>
                  <label
                    >Required value <input
                      class="mono"
                      bind:value={windowsRule.value}
                      placeholder="0"
                      spellcheck="false"
                    /><small
                      >Pattern matching is experimental and is available only
                      for string values.</small
                    ></label
                  >
                  <div class="definition-footer">
                    <code
                      >oval:{windowsProject.namespace}:def:{windowsRule.id}</code
                    >
                  </div>
                {:else}<div class="empty">
                    No definitions yet.<button
                      class="primary"
                      on:click={addWindowsRule}>Add definition</button
                    >
                  </div>{/if}
              {:else}
                <label
                  >Benchmark title <input
                    bind:value={windowsProject.title}
                    placeholder="Windows security baseline"
                  /></label
                ><label
                  >Profile name <input
                    bind:value={windowsProject.profileTitle}
                    placeholder="Windows workstation hardening profile"
                  /></label
                ><label
                  >Description <textarea
                    rows="2"
                    bind:value={windowsProject.description}
                    placeholder="Experimental registry checks for managed Windows systems."
                  ></textarea></label
                ><label
                  >Version <input bind:value={windowsProject.version} /></label
                >
                <div class="divider"></div>
                <div class="check-title"><h3>Profile rules</h3></div>
                <p class="rule-help">
                  Drag the grip to reorder rules, or use the arrow buttons.
                </p>
                <div role="list" aria-label="Windows profile rules">
                  {#each windowsProject.rules as candidate, i (candidate.id)}<div
                      role="listitem"
                      class="rule-row"
                      class:dragging={draggedId === candidate.id}
                      class:drop-before={dropId === candidate.id && !dropAfter}
                      class:drop-after={dropId === candidate.id && dropAfter}
                      on:dragover={(event) => dragOver(event, candidate.id)}
                      on:drop={(event) => dropWindowsRule(event, candidate.id)}
                    >
                      <button
                        class="drag-handle"
                        draggable="true"
                        aria-label={`Reorder ${candidate.title || "Untitled rule"}. Use up and down arrow keys.`}
                        title="Drag to reorder; arrow keys also work"
                        on:dragstart={(event) => startDrag(event, candidate.id)}
                        on:dragend={endDrag}
                        on:keydown={(event) =>
                          moveWindowsWithKeys(event, candidate.id, i)}>⠿</button
                      >
                      <div class="rule-name">
                        {candidate.title || "Untitled rule"}
                      </div>
                      <select
                        aria-label={`Severity for ${candidate.title}`}
                        bind:value={candidate.severity}
                        ><option value="low">Low</option><option value="medium"
                          >Medium</option
                        ><option value="high">High</option></select
                      >
                      <div class="reorder-buttons">
                        <button
                          aria-label={`Move ${candidate.title || "Untitled rule"} up`}
                          disabled={i === 0}
                          on:click={() =>
                            moveWindowsRule(
                              candidate.id,
                              windowsProject.rules[i - 1].id,
                            )}>↑</button
                        ><button
                          aria-label={`Move ${candidate.title || "Untitled rule"} down`}
                          disabled={i === windowsProject.rules.length - 1}
                          on:click={() =>
                            moveWindowsRule(
                              candidate.id,
                              windowsProject.rules[i + 1].id,
                              true,
                            )}>↓</button
                        >
                      </div>
                    </div>{/each}
                </div>
                <span class="sr-only" role="status" aria-live="polite"
                  >{reorderStatus}</span
                >
              {/if}
            </div>
          </section>
          <section class="preview" aria-label="Windows XML preview">
            <div class="preview-heading">
              <div>
                <span class="code-icon">&lt;/&gt;</span>
                <h2>Experimental live preview</h2>
              </div>
              <button on:click={copyWindowsXml}>Copy XML</button>
            </div>
            <div class="file-bar">
              <span>◇ &nbsp; {windowsTab}.xml</span>
            </div>
            <div class="code-scroll">
              <pre>{#each windowsXml.split("\n") as line, i}<div
                    class="code-line"><span class="line-number">{i + 1}</span
                    ><code>{line}</code></div>{/each}</pre>
            </div>
            <div class="preview-footer">
              <span>{windowsXml.split("\n").length} lines</span>
            </div>
          </section>
        </div>
        {#if message}<div class="toast" role="status">
            {message}<button
              aria-label="Dismiss notification"
              on:click={() => (message = "")}>×</button
            >
          </div>{/if}
      </div>
    {/if}
  </main>
</div>

<style>
  :global(*) {
    box-sizing: border-box;
  }
  :global(body) {
    margin: 0;
    background: #f4f6f8;
    color: #172637;
    font-family:
      Inter,
      ui-sans-serif,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      sans-serif;
    font-size: 16px;
  }
  :global(button),
  :global(input),
  :global(select),
  :global(textarea) {
    font: inherit;
  }
  :global(button),
  :global(a),
  :global(input),
  :global(select),
  :global(textarea) {
    outline-offset: 4px;
  }
  :global(button) {
    cursor: pointer;
  }
  .app {
    display: flex;
    min-height: 100vh;
  }
  .sidebar {
    width: 238px;
    background: #101c2d;
    color: #dce5ef;
    padding: 33px 23px;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }
  .brand {
    text-decoration: none;
    color: #fff;
    display: flex;
    align-items: center;
    gap: 10px;
    font-weight: 750;
    font-size: 23px;
    letter-spacing: -1px;
  }
  .brand-icon {
    font-size: 42px;
    color: #65d6bc;
    line-height: 1;
  }
  .nav-item {
    display: flex;
    gap: 12px;
    font-size: 14px;
    background: #203247;
    border: 1px solid #31485e;
    border-radius: 6px;
    padding: 13px;
    color: #f3f8fd;
    margin-top: 0;
    width: 100%;
    text-align: left;
    align-items: center;
    line-height: 1.4;
  }
  .tool-nav {
    display: grid;
    gap: 8px;
    margin-top: 40px;
  }
  .json-file-input[type="file"] {
    display: none !important;
  }
  main {
    min-width: 0;
    flex: 1;
  }
  .content {
    max-width: 1560px;
    margin: auto;
    padding: 37px 38px 20px;
  }
  .page-heading {
    display: flex;
    justify-content: space-between;
    gap: 20px;
    align-items: center;
    margin-bottom: 32px;
  }
  h1 {
    font-size: 32px;
    font-weight: 650;
    letter-spacing: -1.2px;
    margin: 9px 0;
  }
  .primary {
    border: 1px solid var(--accent);
    background: var(--accent);
    color: var(--accent-contrast);
    font-size: 14px;
    font-weight: 550;
    padding: 12px 19px;
    border-radius: 6px;
    box-shadow: 0 2px 3px #102f2812;
    white-space: nowrap;
  }
  .primary:hover {
    background: var(--accent-hover);
  }
  .tabs {
    display: flex;
    align-items: center;
    gap: 27px;
    border-bottom: 1px solid #d6dde5;
    margin-bottom: 25px;
  }
  .tabs button {
    padding: 0 0 16px;
    border: 0;
    background: none;
    font-size: 14px;
    font-weight: 600;
    color: #798594;
    border-bottom: 2px solid transparent;
  }
  .tabs button.chosen {
    color: #146b57;
    border-bottom-color: #146b57;
  }
  .tabs button span {
    background: #e7ecf0;
    font-size: 11px;
    display: inline-block;
    padding: 2px 6px;
    margin-left: 8px;
    border-radius: 4px;
  }
  .tabs button.chosen span {
    background: #dceee7;
  }
  .work-grid {
    display: grid;
    grid-template-columns: minmax(300px, 1fr) minmax(330px, 1.12fr);
    gap: 22px;
    align-items: stretch;
  }
  .editor {
    background: #fff;
    border: 1px solid #dce2e9;
    border-radius: 8px;
    overflow: hidden;
  }
  .panel-heading {
    padding: 20px 23px;
    border-bottom: 1px solid #e9edf1;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }
  .panel-heading > div,
  .preview-heading > div {
    display: flex;
    align-items: center;
    gap: 11px;
  }
  h2 {
    font-size: 15px;
    font-weight: 600;
    margin: 0;
  }
  .form-body {
    padding: 22px 23px;
  }
  label {
    display: block;
    font-size: 13px;
    font-weight: 550;
    color: #344254;
    margin-bottom: 19px;
  }
  input:not([type="checkbox"]),
  select,
  textarea {
    display: block;
    width: 100%;
    border: 1px solid #d6dee6;
    border-radius: 5px;
    color: #344254;
    background: #fff;
    padding: 10px 12px;
    margin-top: 8px;
    font-size: 14px;
    transition: border-color 0.15s;
  }
  input:focus,
  textarea:focus,
  select:focus {
    outline: 2px solid #c7e7de;
    border-color: #4c9c87;
  }
  textarea {
    resize: vertical;
    line-height: 1.5;
  }
  small {
    font-size: 11px;
    color: #89949f;
    font-weight: 400;
    line-height: 1.5;
    display: block;
    margin-top: 7px;
  }
  .definition-bar {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .grow {
    flex: 1;
    min-width: 0;
  }
  .square {
    align-self: center;
    margin-top: 5px;
    border: 1px solid #d6dee6;
    background: #f7f9fa;
    border-radius: 5px;
    width: 39px;
    height: 39px;
    font-size: 23px;
    color: #547365;
  }
  .divider {
    height: 1px;
    background: #e9edf1;
    margin: 24px 0 22px;
  }
  .check-title {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 18px;
    gap: 10px;
  }
  h3 {
    font-size: 14px;
    margin: 0;
    font-weight: 600;
  }
  .mono {
    font-family: "SFMono-Regular", Consolas, monospace !important;
    font-size: 12px !important;
  }
  .definition-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    margin-top: 5px;
  }
  .definition-footer code {
    font-size: 10px;
    color: #8794a2;
    overflow-wrap: anywhere;
  }
  .preview {
    background: #142131;
    border: 1px solid #263547;
    border-radius: 8px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 640px;
  }
  .preview-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 23px 20px;
    color: #e2e9f1;
  }
  .code-icon {
    color: #7b9f9c;
    font-family: monospace;
    font-size: 15px;
  }
  .preview-heading button {
    border: 1px solid #3a4b5c;
    border-radius: 4px;
    background: #203042;
    color: #b9c8d8;
    padding: 5px 9px;
    font-size: 11px;
  }
  .file-bar {
    display: flex;
    justify-content: space-between;
    background: #1b2a3b;
    border-top: 1px solid #2d3b4b;
    border-bottom: 1px solid #2d3b4b;
    padding: 12px 20px;
    font-family: monospace;
    font-size: 11px;
    color: #a3b3c3;
  }
  .file-bar span:last-child {
    color: #687e93;
  }
  .code-scroll {
    flex: 1;
    height: 500px;
    overflow: auto;
    padding-top: 19px;
  }
  pre {
    margin: 0;
    padding-bottom: 20px;
    font-size: 11px;
    line-height: 1.9;
    tab-size: 2;
  }
  .code-line {
    display: flex;
    min-height: 21px;
  }
  .line-number {
    color: #52677b;
    user-select: none;
    position: sticky;
    left: 0;
    background: #142131;
    flex: 0 0 43px;
    text-align: right;
    padding-right: 14px;
  }
  .code-line code {
    color: #a6d4cc;
    padding-right: 22px;
    white-space: pre;
  }
  .preview-footer {
    display: flex;
    justify-content: space-between;
    padding: 13px 20px;
    border-top: 1px solid #2b3b4c;
    color: #7790a5;
    font-size: 10px;
  }
  .rule-row {
    display: flex;
    gap: 12px;
    align-items: center;
    padding: 14px 0;
    border-bottom: 1px solid #edf0f3;
  }
  .rule-row select {
    width: 95px;
    margin: 0;
    font-size: 12px;
  }
  .empty {
    padding: 40px 0;
    display: grid;
    gap: 20px;
    text-align: center;
  }
  .toast {
    position: fixed;
    bottom: 24px;
    right: 24px;
    max-width: calc(100vw - 48px);
    background: #fff;
    border: 1px solid #b9cfc7;
    box-shadow: 0 6px 28px #0b273421;
    border-radius: 7px;
    padding: 17px 20px;
    font-size: 14px;
    z-index: 5;
  }
  .toast {
    max-height: 50vh;
    overflow: auto;
    white-space: pre-line;
    overflow-wrap: anywhere;
  }
  .toast button {
    border: 0;
    background: none;
    margin-left: 20px;
    font-size: 20px;
    color: #688178;
  }
  @media (min-width: 1450px) {
    .content {
      padding: 44px 50px;
    }
    .work-grid {
      grid-template-columns: 1fr 1.2fr;
    }
    .sidebar {
      width: 255px;
    }
    .form-body {
      padding: 24px 28px;
    }
    pre {
      font-size: 12px;
    }
  }
  @media (max-width: 1100px) {
    .sidebar {
      width: 200px;
      padding: 28px 16px;
    }
    .brand {
      font-size: 20px;
    }
    .content {
      padding: 28px 24px;
    }
    .work-grid {
      grid-template-columns: 1fr;
    }
    .preview {
      min-height: 430px;
    }
    .code-scroll {
      height: 370px;
      max-height: 440px;
    }
    .page-heading h1 {
      font-size: 28px;
    }
  }
  @media (max-width: 650px) {
    .app {
      display: block;
    }
    .sidebar {
      width: 100%;
      padding: 17px 20px;
      display: block;
    }
    .brand {
      font-size: 21px;
    }
    .nav-item {
      display: flex;
    }
    .content {
      padding: 25px 17px;
    }
    .page-heading {
      align-items: flex-start;
      flex-direction: column;
      margin-bottom: 25px;
      gap: 18px;
    }
    .primary {
      width: 100%;
    }
    .tabs {
      gap: 18px;
    }
    .tabs button {
      font-size: 12px;
    }
    .panel-heading,
    .form-body {
      padding: 18px;
    }
    .preview {
      min-height: 400px;
    }
  }

  label {
    font-size: 14px;
  }
  small,
  .preview-heading button,
  .file-bar,
  .preview-footer,
  .definition-footer code {
    font-size: 12px;
  }
  pre {
    font-size: 12px;
  }
  .mono {
    font-size: 14px !important;
  }
  .rule-row select {
    font-size: 14px;
  }

  .nav-item {
    width: 100%;
    text-align: left;
    background: #203247;
    border-color: #31485e;
    align-items: center;
    line-height: 1.5;
  }
  .secondary {
    background: #fff;
    border: 1px solid #cbd7df;
    color: #35584c;
    border-radius: 5px;
    padding: 10px 12px;
    font-size: 14px;
  }
  .secondary:hover {
    background: #eff5f2;
  }
  .remove-rule {
    color: #a54d4d;
    background: #fff8f8;
    flex-shrink: 0;
  }
  .remove-rule:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .square {
    flex-shrink: 0;
  }
  @media (max-width: 650px) {
    .nav-item {
      display: flex;
      font-size: 13px;
      padding: 10px;
    }
    .action-group {
      grid-template-columns: 1fr 1fr;
    }
  }

  .sidebar {
    position: sticky;
    top: 0;
    height: 100dvh;
    overflow-y: auto;
  }
  .sidebar-actions {
    margin-top: auto;
    padding-top: 30px;
  }
  .action-group {
    display: grid;
    gap: 9px;
  }
  .action-separator {
    display: flex;
    align-items: center;
    gap: 9px;
    color: #6f8298;
    font-size: 11px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin: 17px 0 12px;
  }
  .action-separator::before,
  .action-separator::after {
    content: "";
    height: 1px;
    background: #2e4053;
    flex: 1;
  }
  .sidebar-actions .secondary {
    background: transparent;
    color: #dce5ef;
    border-color: #354b60;
    text-align: left;
  }
  .sidebar-actions .secondary:hover {
    background: #203247;
  }
  .export-errors {
    background: #fff5f3;
    border: 1px solid #e3bbb3;
    border-radius: 7px;
    padding: 18px 22px;
    margin: 0 0 22px;
    color: #913f30;
    font-size: 14px;
    line-height: 1.6;
  }
  .export-errors ul {
    margin-bottom: 0;
  }
  @media (max-width: 650px) {
    .sidebar {
      position: static;
      height: auto;
      overflow: visible;
    }
    .sidebar-actions {
      padding-top: 18px;
    }
    .sidebar-actions .secondary {
      text-align: center;
    }
    .nav-item {
      margin-top: 18px;
    }
  }
  .export-errors li {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    margin-top: 8px;
  }
  .export-errors ul {
    list-style: none;
    padding: 0;
  }
  .edit-rule {
    flex-shrink: 0;
    border: 0;
    background: none;
    color: #913f30;
    text-decoration: underline;
    text-underline-offset: 3px;
    font-size: 14px;
    padding: 4px;
  }
  .export-errors:focus {
    outline: 2px solid #bc7060;
    outline-offset: 3px;
  }
  @media (max-width: 650px) {
    .export-errors li {
      align-items: flex-start;
      flex-direction: column;
      gap: 2px;
    }
  }

  .rule-help {
    font-size: 13px;
    color: #71818d;
    line-height: 1.6;
    margin: 0 0 12px;
  }
  .rule-row {
    position: relative;
    gap: 8px;
  }
  .rule-name {
    min-width: 0;
    flex: 1;
    overflow-wrap: anywhere;
    font-size: 14px;
    font-weight: 550;
  }
  .drag-handle {
    border: 0;
    background: transparent;
    color: #78928a;
    font-size: 24px;
    padding: 6px;
    cursor: grab;
    flex-shrink: 0;
    touch-action: pan-y;
  }
  .drag-handle:active {
    cursor: grabbing;
  }
  .dragging {
    opacity: 0.45;
  }
  .drop-before {
    box-shadow: 0 -3px #168466;
  }
  .drop-after {
    box-shadow: 0 3px #168466;
  }
  .reorder-buttons {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  .reorder-buttons button {
    width: 28px;
    height: 28px;
    border: 1px solid #dce4e9;
    background: #f8faf9;
    color: #365b4e;
    border-radius: 4px;
  }
  .reorder-buttons button:disabled {
    opacity: 0.3;
    cursor: default;
  }
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
  @media (max-width: 650px) {
    .rule-row {
      flex-wrap: wrap;
    }
    .rule-name {
      flex-basis: calc(100% - 45px);
    }
    .rule-row select {
      margin-left: 38px;
    }
    .reorder-buttons {
      flex-direction: row;
    }
    .reorder-buttons button {
      width: 36px;
      height: 36px;
    }
  }

  :global(html) {
    color-scheme: light;
    --app-bg: #fff;
    --sidebar-bg: #f4f5f7;
    --surface: #fff;
    --surface-soft: #f6f7f9;
    --border: #dde1e7;
    --border-strong: #cbd2dc;
    --text: #23272f;
    --text-soft: #69717d;
    --accent: #167c70;
    --accent-soft: #dcefeb;
    --accent-hover: #12655c;
    --accent-contrast: #ffffff;
    --nav-text: #35404d;
    --shadow: 0 1px 2px #17202b0a;
  }
  :global(html[data-theme="dark"]) {
    color-scheme: dark;
    --app-bg: #171a21;
    --sidebar-bg: #20242c;
    --surface: #222731;
    --surface-soft: #292e38;
    --border: #383f4b;
    --border-strong: #4a5260;
    --text: #edf1f5;
    --text-soft: #aab2bf;
    --accent: #64c9b6;
    --accent-soft: #263f3c;
    --accent-hover: #52aa9a;
    --accent-contrast: #111827;
    --nav-text: #e5eaf0;
    --shadow: none;
  }
  :global(body) {
    background: var(--app-bg);
    color: var(--text);
  }
  main {
    background: var(--app-bg);
  }
  .sidebar {
    background: var(--sidebar-bg);
    color: var(--nav-text);
    border-right: 1px solid var(--border);
    padding: 30px 20px;
  }
  .brand {
    color: var(--text);
  }
  .brand-icon {
    color: var(--accent);
  }
  .nav-item,
  .nav-item.nav-active {
    background: var(--accent-soft);
    border-color: transparent;
    color: var(--nav-text);
    border-radius: 9px;
  }
  .nav-item:not(.nav-active) {
    background: var(--surface);
    border-color: var(--border);
  }
  .experimental-notice {
    display: grid;
    gap: 5px;
    margin-bottom: 22px;
    padding: 16px 18px;
    border: 1px solid #d9a441;
    border-radius: 8px;
    background: color-mix(in srgb, #d9a441 12%, var(--surface));
    color: var(--text);
    font-size: 14px;
    line-height: 1.5;
  }
  .experimental-notice span {
    color: var(--text-soft);
  }
  .registry-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .sidebar-actions .secondary {
    background: var(--surface);
    color: var(--nav-text);
    border-color: var(--border-strong);
    border-radius: 7px;
  }
  .sidebar-actions .secondary:hover {
    background: var(--surface-soft);
  }
  .action-separator {
    color: var(--text-soft);
  }
  .action-separator::before,
  .action-separator::after {
    background: var(--border);
  }
  .content {
    max-width: none;
    padding: 36px 42px 24px;
  }
  .tabs button,
  .rule-help,
  small {
    color: var(--text-soft);
  }
  .tabs button.chosen {
    color: var(--accent);
  }
  .tabs,
  .panel-heading,
  .divider,
  .rule-row {
    border-color: var(--border);
  }
  .tabs button.chosen {
    border-bottom-color: var(--accent);
  }
  .tabs button span {
    background: var(--surface-soft);
    color: var(--text-soft);
  }
  .tabs button.chosen span {
    background: var(--accent-soft);
    color: var(--accent);
  }
  .editor {
    background: var(--surface);
    border-color: var(--border);
    box-shadow: var(--shadow);
  }
  label {
    color: var(--nav-text);
  }
  input:not([type="checkbox"]),
  select,
  textarea {
    background: var(--surface);
    color: var(--text);
    border-color: var(--border-strong);
  }
  input::placeholder,
  textarea::placeholder {
    color: var(--text-soft);
    opacity: 0.62;
  }
  .square,
  .reorder-buttons button {
    background: var(--surface-soft);
    border-color: var(--border);
    color: var(--nav-text);
  }
  .toast {
    background: var(--surface);
    color: var(--text);
    border-color: var(--border-strong);
  }
  .icon {
    width: 16px;
    height: 16px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
    flex: 0 0 auto;
  }
  .brand-icon {
    width: 31px;
    height: 31px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linejoin: round;
    flex: 0 0 auto;
  }
  .sidebar-actions .secondary,
  .primary,
  .header-actions .secondary {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .brand {
    letter-spacing: -0.5px;
  }
  .page-heading {
    margin-bottom: 25px;
  }
  .page-heading h1 {
    margin: 0;
  }
  .panel-heading {
    min-height: 65px;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 9px;
  }
  .header-actions .secondary {
    background: var(--surface);
    color: var(--nav-text);
    border-color: var(--border-strong);
    padding: 11px 15px;
  }
  .theme-switcher {
    display: inline-flex;
    align-self: flex-start;
    gap: 2px;
    padding: 4px;
    background: #dfe2e7;
    border: 1px solid #d5d9df;
    border-radius: 999px;
  }
  .appearance-controls {
    display: flex;
    align-items: flex-start;
    gap: 9px;
    width: 100%;
  }
  .accent-picker {
    position: relative;
    display: inline-flex;
    margin-left: auto;
    padding: 4px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 999px;
  }
  .accent-button {
    position: relative;
    display: grid;
    place-items: center;
    width: 31px;
    height: 31px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
  }
  .accent-button svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: var(--nav-text);
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .accent-button:hover,
  .accent-button[aria-expanded="true"] {
    background: var(--surface-soft);
  }
  .accent-button .accent-dot {
    position: absolute;
    right: 1px;
    bottom: 1px;
    width: 9px;
    height: 9px;
    border: 1px solid var(--surface);
    border-radius: 50%;
    box-shadow: 0 0 0 1px var(--border-strong);
  }
  .color-menu {
    position: absolute;
    right: 0;
    bottom: calc(100% + 10px);
    z-index: 10;
    width: min(202px, calc(100vw - 32px));
    max-height: calc(100vh - 32px);
    overflow-y: auto;
    padding: 15px;
    background: var(--surface);
    border: 1px solid var(--border-strong);
    border-radius: 9px;
    box-shadow: 0 12px 34px #1118272b;
  }
  .color-menu strong {
    display: block;
    margin-bottom: 13px;
    color: var(--text);
    font-size: 14px;
  }
  .reset-accent {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    margin: 0 0 13px;
    padding: 8px 9px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface-soft);
    color: var(--text);
    font-size: 12px;
    text-align: left;
  }
  .reset-accent span {
    width: 13px;
    height: 13px;
    border-radius: 50%;
    background: #167c70;
    box-shadow: 0 0 0 1px var(--border-strong);
  }
  .color-menu label {
    margin-bottom: 12px;
    font-size: 12px;
  }
  .color-menu input:not([type="checkbox"]) {
    margin-top: 5px;
    padding: 8px;
  }
  .color-menu input[aria-invalid="true"] {
    border-color: #b64a3b;
  }
  .rgb-fields {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 7px;
  }
  .rgb-fields label {
    min-width: 0;
    margin: 0;
  }
  .rgb-fields input[type="number"] {
    min-width: 0;
    width: 100%;
    padding-right: 4px;
    appearance: textfield;
  }
  .rgb-fields input[type="number"]::-webkit-inner-spin-button,
  .rgb-fields input[type="number"]::-webkit-outer-spin-button {
    margin: 0;
    appearance: none;
  }
  .theme-switcher button {
    display: grid;
    place-items: center;
    width: 31px;
    height: 31px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: #5f6670;
    line-height: 1;
  }
  .theme-switcher button svg {
    width: 18px;
    height: 18px;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.8;
    stroke-linecap: round;
    stroke-linejoin: round;
  }
  .theme-switcher button .system-fill {
    fill: currentColor;
    stroke: none;
  }
  .theme-switcher button:hover {
    background: #ffffff99;
  }
  .theme-switcher button.active {
    background: #343943;
    color: #fff;
    box-shadow: 0 1px 4px #11182730;
  }
  .theme-switcher button:first-child.active {
    color: #ffd12b;
  }
  .theme-switcher button:last-child.active {
    color: #ffe15b;
  }
  :global(html[data-theme="dark"]) .theme-switcher {
    background: #353a44;
    border-color: #3f4550;
  }
  :global(html[data-theme="dark"]) .theme-switcher button {
    color: #bcc4cf;
  }
  :global(html[data-theme="dark"]) .theme-switcher button.active {
    background: #171a21;
    color: #fff;
  }
  :global(html[data-theme="dark"]) .theme-switcher button:hover {
    background: #ffffff12;
  }
  @media (max-width: 650px) {
    .theme-switcher {
      margin-top: 0;
    }
    .content {
      padding: 25px 17px;
    }
    .sidebar-actions {
      display: grid;
      grid-template-columns: 1fr;
    }
    .sidebar {
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
    .header-actions {
      width: 100%;
      display: grid;
      grid-template-columns: 1fr 1fr;
    }
    .header-actions .primary {
      grid-column: 1/-1;
    }
  }
</style>
