---
description: Process the HR TECH DESIGN task queue from the Figma plugin
---

Process the HR TECH DESIGN task queue in the currently open Figma file, through the `figma-hrtech` MCP bridge (the designer's Figma desktop app — org fonts like YS Text load there).

0. **Patience on connect:** the plugin re-attaches to this session's server within ~5–15 s.
   If `figma_execute` answers "Cannot connect to Figma Desktop", run `sleep 5` in Bash and retry —
   up to 18 attempts (~90 s total) before reporting failure.
0a. **Speed:** batch work into FEW LARGE `figma_execute` calls (one per phase), not many small ones —
   every call costs a round-trip. Read everything you need in one call, build in one or two calls,
   verify in one call. Do not re-read what you already returned.
0a2. **Version check (FIRST figma_execute of the session):** run
   `return { v: typeof hrtechVersion !== 'undefined' ? hrtechVersion : null }`.
   If `v` is null — the designer's plugin is OUTDATED: STOP immediately and report
   "Plugin is outdated — close and re-run the HR TECH DESIGN plugin in Figma". Do NOT improvise
   workarounds and NEVER write your own frame walker as a fallback.
0a2b. **UNIVERSAL COMPOSITION:** from any reference take ONLY the frame geometry (375 px, hug height,
   margins 20). Everything else is assembled from DS components according to the ZONE MAP in the task rules:
   build the desktop's zone graph (chrome / page header / toolbar / content / aside), map each zone to its
   mobile DS equivalent, fill with the source content 1:1. The mobile must look like THE SOURCE product.
   Same-type exception: if an approved mobile of the SAME screen type exists (e.g. another meeting summary →
   `1730:2255387`), clone it and replace data — fastest correct path.

0a2c. **COMPONENT ATOMS ONLY (hard rule):** every visible UI atom — button, input, tab, chip, list row,
   icon, divider — must be an HRDS instance (catalog below) or a clone from a reference screen. Drawing
   rectangles/vectors/hand-made frames that imitate UI is FORBIDDEN. Plain auto-layout frames are allowed
   ONLY as invisible structural containers. If no component exists: closest HRDS equivalent + a TODO note.
0a2d. **CALL BUDGET:** complete a desktop-to-mobile task in at most 10 `figma_execute` calls
   (1 version+queue, 1 scan, 1 clone/skeleton, 2-3 content, 1 diff, 1 finish). The page is ALREADY loaded —
   never call `page.loadAsync()` or `loadAllPagesAsync()` again after the first call.
0a3. **NO FABRICATION (absolute):** every string you write into the mobile frame must exist in the source
   frame. If the scan shows a text truncated with '…', you MUST fetch that node's full `characters` by id
   before writing it. Inventing meeting names, summaries, dates, labels or ANY content is a hard failure.
   Mandatory check: at the verify phase run `return await hrtechDiff('<srcId>','<dstId>')` — if `fabricated`
   is not empty, fix every item and re-run the diff until it is empty (allowed exceptions: status-bar time,
   UI chrome like 'Return'). Report the final diff result in your summary.
0b. **Scanning — use the built-in helper ONLY:** the plugin defines `hrtechScan(nodeId, {maxTexts})` —
   fast, capped, freeze-proof. To scan a source frame run a one-liner figma_execute:
   `return await hrtechScan('<frameId>')` (returns name/size, child zones, up to 400 visible texts with
   positions, long texts truncated; fetch full text of specific nodes individually later). NEVER write your
   own tree-walker for scanning.
0b2. **Bounded scripts (CRITICAL):** the Figma plugin sandbox is single-threaded — a heavy script FREEZES the
   plugin and the whole pipeline with it, and cannot be aborted. Every `figma_execute` script must finish in
   under ~10 s: NEVER call `figma.loadAllPagesAsync()`, NEVER `findAll` on a whole page — scope every search
   to the source frame only (`frame.findAllWithCriteria`). Never call `getStyledTextSegments` in a loop over
   many nodes. Cap every loop (e.g. first 300 nodes) and read the rest in a follow-up call if needed.
0c. **Compact payloads:** keep every `figma_execute` RETURN small (target < 15 KB). When scanning a source
   frame, return a structured content model (zones, rows as {title, meta, status, desc}), NOT a raw dump of
   every text node; truncate long body texts you don't need verbatim yet and fetch them individually later,
   only for the elements you will actually transfer. Big returns = minutes of extra model time.
1. Read the queue: via `figma_execute` run
   `return figma.root.getSharedPluginData('hrtech','task_queue')`
   It is a JSON array of tasks: `{action, label, version, rules[], page, scope, selection[], ts}`.
2. If the queue is empty — tell the user and stop.
3. Execute tasks in order. **STATUS PROTOCOL** — drives the live progress UI in the plugin; update it at the START of EVERY phase:
   `figma.root.setSharedPluginData('hrtech','status', JSON.stringify({state:'processing', label:'<task label> · <source frame name> (k/N tasks)', step:'<short English phase description>', stepNum:N, stepsTotal:M}))`
   — label MUST name the source frame and the task index when the queue holds several tasks.
   Suggested phases for desktop-to-mobile (stepsTotal: 6): 1 `Reading task queue` · 2 `Scanning source frame` · 3 `Building frame & header` · 4 `Building content` · 5 `Verifying content 1:1` · 6 `Final screenshot check`. Define similar sensible phases for other actions.
   **Live visibility (required):**
   - Add a `detail` field to the status — a short, concrete sub-action ("Header stack placed", "Accordion 3/8 · Тема 2", "Diffing 14 strings"). Update detail on EVERY sub-action; never go more than ~20 s without a status write.
   - Add `nodeId` to the status as soon as the main result frame exists — the plugin shows a "Show" button that jumps the designer's viewport to it.
   - **Skeleton first:** create the result frame ON CANVAS at the very start of the build phase,
     positioned RIGHT NEXT to the source frame (same parent, x = source.x + source.width + 200, y = source.y) (header stack + empty section placeholders), then fill it section by section in separate calls — the designer should literally watch the screen grow. Never assemble everything off-screen and paste at the end.
   - **Shimmer:** set `node.placeholder = true` on every skeleton section when you create it, and `placeholder = false` the moment that section is filled — the designer sees Figma's native "AI is drawing here" shimmer move through the screen. NEVER leave a shimmer on a finished node.
   **After all tasks finish (or on failure)** clear it: `figma.root.setSharedPluginData('hrtech','status','')`.
   **STOP FLAG** — the plugin's Stop button sets `getSharedPluginData('hrtech','stop')` to `'1'`. Check it at the
   start of EVERY phase (include the read in the same figma_execute call as the status update). If set: abort
   immediately — keep unfinished tasks in the queue, clear status to `''`, clear the flag
   (`setSharedPluginData('hrtech','stop','')`), and report "Stopped by user". Also clear a leftover stop flag
   ONCE at the very beginning before starting work.
   For each task:
   - The `rules` array is the authoritative instruction set — follow it exactly.
   - Operate on the nodes in `selection` (ids) on page `page`; `scope: "page"` means the whole page.
   - Work via `figma_execute`; pass `timeout: 280000` for heavy operations.
   - The plugin manifest uses `documentAccess: dynamic-page` — use async APIs only
     (`setTextStyleIdAsync`, `setRangeTextStyleIdAsync`, `page.loadAsync()`, `getNodeByIdAsync`).
   - Load every font you touch first (`figma.loadFontAsync`); YS Text is available in this environment.
   - Components: only the «🦄 HRDS · Компоненты» library; icons from «!💎 Icons»; never hand-build pseudo-components; slots take 💠 filler components, never bare icons.
4. After ALL tasks succeed, clear the queue:
   `figma.root.setSharedPluginData('hrtech','task_queue','')`
   If a task failed, keep only the failed tasks in the queue and report why.
5. Report a short summary per task: what was done, node ids touched.

**FULL COMPONENT & PATTERN REFERENCE:** before building, consult `hrds-knowledge.md` (same folder) — verified keys, usage rules and the overlay decision matrix for 25+ HRDS components and patterns (Table, Form, Inputs, Select, Tree-View, Accordion, Dialog/Drawer/Popover/Toast/Tooltip, FAB, Filter, File Upload, Date Picker, Suggest, etc.). Use those keys directly; do not re-search the library for anything listed there.

## KNOWN HRDS COMPONENTS — pre-cached catalog (do NOT search libraries for these)

Import via `figma.importComponentSetByKeyAsync(key)` / `figma.importComponentByKeyAsync(key)` /
`figma.importStyleByKeyAsync(key)`. Searching the libraries for any of these wastes minutes — they are verified.

**Components ('🦄 HRDS · Компоненты'):**
- `❇️ Button` set `4b89ed0d79330857ca6cf87f1f1a862b678fe227` — variants Variant=Text|Icon, Size=S|M|L, View=Primary|Secondary|Outline|Ghost|Float|Surface|Media, State. Label prop `← Label#19437:14`. Left icon: swap `Slot ←#23968:97` to `Button / 💠 Icon` `054cdf002d8efef15e9912df1972418b8a2e221c`, then its `← Icon#616:5` to a Size=16 icon. NEVER put a bare icon in the slot.
- `💠 Item → Accordion` set `6edc574a31038255bb1787f2ea5a8ed610e1574e` — View=Outline|Ghost|Surface, ↳Selected=on|off; props: `← Label#21254:5`, `← Description#21254:4`, `← Caption#22267:0` + `has Caption#22296:0`, content slot `↳ Slot#29819:6` + `has Slot#29819:19` (swap a local 🔁 Content component in).
- `❇️ Accordion` container set `56d0e088d1e7c4267d8cea6e7472456a4f78994f`.
- `❇️ Button · Dropdown` set `b40ff2ec38d2a3e8a571a976b7523d3c41d63474` (Collapsed=on|off chevron 24×24).

**Icons ('!💎 Icons'), sets with variants Size=8…24 × Filled:**
- `ChatsSocial / Like` `addb69a9844b0e51b1a0d92faa2044e0683bc064` · `ChatsSocial / Dislike` `30cf462391ab777765e81ed33e90b0b945f6d73a`.

**Text styles (HRDS library, key → importStyleByKeyAsync):**
- Title/L · Medium (28) `86570942101922425cc288d05c09e686fb8db0a1` · Title/S · Medium (20) `8ca038ab645cd66d60eb810f5a64b08f6c6fa974`
- Body · Compact/M · Medium (16) `fa05d6dda888522b6a6a97336217575a5133d431` · Body/S (14) `34bb62602d906f7d0a81281c0373c7716a522fc6` · Body/S · Medium `e1fa4a9a94ae25f214d0da960cbaf12f86c0cdb0`
- Caption/M (12) `1b3dde652fea59025951351afbb4cc193dc94e00` · System/Control (14) `752d95cde89a8a7d2c3a797841515e89fbba19d8`

**Lists & statuses ('🦄 HRDS · Компоненты'):**
- `💠 List-Item` set `9af0d111a9413804fd21ff818855fbbdd3df5e4b` — the mobile list row (use for desktop table rows on mobile).
- `❇️ Tag · Status` set `a37c17afd8a71799594e3f14eb58e86cb26873e0` — statuses like Завершена/В процессе/Ошибка.
- `List` set `0b8298b6997f70db30f1e1730386b642a828cbf9`.

**Inputs & navigation ('🦄 HRDS · Компоненты'):**
- `❇️ Input` set `7ff527c19e62a39ce71f9bf778645806c66605e8` · `💠 Input · Search` set `1f34e216eb8aa263c8fb7c61ced9b566e1035a04` · `❇️ Date Input` set `a5bbfee93de1293d5e5bdb9868ac5a3025fd9deb`
- `⏳ TabsMenu` set `516b5ed26140087675c050397a8853b641fbaebe` (tabs like Помощники/Суммаризация) · `❇️ Sidebar` set `38564118b46d8c70b2cd4076bd361876be038b67` (desktop only — on mobile collapse to burger)

**Dialogs & overlays ('🦄 HRDS · Компоненты'):**
- `💠 Dialog` set `15adeff5f730b5227d9df66040c6a2d678943dd5` — Size=S|M|L, Modal=off|on, has Scroll; bools `has Header/Footer/Content/Media`, content slot `↳ Content#40337:2` (swap a local 🔁 component in).
- `💠 Dialog · Confirm` set `4bd1f6094282088d90244db605caccc99eb7657f` — Modal=off|on.
- `⏳ Modal` `2dd861d35defdfdd5c11fe5c0ddfd7e443daee7b` (400×356; has Header/Footer/Close, `← Content#1069:9`) · `⏳ Popup` `94d4b7ed01170e673318436f65c0db3c348667fd` (400×316) · `⏳ Dialog` `c6476cee96c5b482019ed9aa0c9269cc9abf65b4` (400×156).

**Tables ('🦄 HRDS · Компоненты'):**
- `💎 Table · Cell` set `9c6b0c0889e894fc57de0f8ec893850558d48b44` — Preset=Text|Text·Hidden|Number|Number·Hidden|Date|User|User·Full|Tag·Group|Status·Group; slots `← Slot#2220:0`, `→ Slot#2220:3`, `Base#2220:6`.
- `💎 Table · Cell · Header` set `68319e4229006b8f0dcfeb6c33e44c565776f69c` — same slot scheme.
- NOTE: desktop tables on mobile become grouped lists/accordions (see pattern map), Table·Cell is for desktop work.

**Mobile shell — fresh library instances by key (NEVER clone from screens):**
- `System / Status Bar / iPhone` `219da9e0b1e1df75cdf05ef6b443aab36ea224ab` (375×54)
- `❇️ Header [mobile]` set `a5d55d3e6028c6aa447b52b8f2cc393cbe21c376` (375×72; contains burger/search/bell — configure, never duplicate)
- `💠 Content · Header [mobile]` set `fe41d6a71dcad39d0f590a8d2da113b5b00c9d0b` (back-link, H1, optional tabs)
- `Home Indicator` `002fac881916fd9fea6caa565ba012ac59af07da` (375×21)

**PATTERN BLUEPRINTS — the universal mechanism.** Approved results are DISTILLED into numeric blueprints
inside the task rules (components by library key + spacing + order) — the system never depends on nodes of a
particular file. Do not clone screens as templates; build every screen from the blueprints and the catalog.

**AI chat components ('Я Team AI' library, by key):**
- `bubble assistant — ai message` `786b1381827a2c35e45afdbe35590256ab3c7af3` (name header + response area inside)
- `AI — assistant name header` set `07d8f012e530470c2f9776d47831c5b95a5119e2` (LLM=AI Chat …)
- `AI — assistant responce` set `d3f66911a79f831687ee88e9e748e72bf8c6ef7a` (ready=on/off)
- `ai — text area` set `a86d7b0b409c9cc52742b7c1ff66a774166e3f23` (generating=on/off; placeholder + Bottom Action slot)
