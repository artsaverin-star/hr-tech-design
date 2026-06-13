# HRDS Component & Pattern Knowledge Base

Harvested 2026-06-12 from the HRDS spec files (view-only). Keys are library `componentKey` for
`importComponentByKeyAsync` / `importComponentSetByKeyAsync` from «🦄 HRDS · Компоненты».
Use these instead of searching the library — they are verified. "Mobile: Беклог" = no mobile spec yet,
use the desktop component and adapt with the universal zone map.

## Forms & inputs

### Input
keys: ❇️ Input `7ff527c19e62a39ce71f9bf778645806c66605e8` · Number `ca071adfe7b0c5954f9d0d3bfe5009fc300b8889` · Password `7eae4f3ced878bd2f76eb1366d324f8ab4a56264` · Mail `25941c045a6ad004b2624c16ef5bcbc86b29a966` · Search `1f34e216eb8aa263c8fb7c61ced9b566e1035a04` · Phone `7d7bc0c7bcd371df37bbecfc0c3d01f4a163a01d` · Date `a5bbfee93de1293d5e5bdb9868ac5a3025fd9deb` · Time `2a52b02a5ef2a75b489a7511cb318982a7c7600a`
- Size M=40 (forms, default) / S=32 (filters, embedded). View outline (default) / ghost (inside complex components) / surface (on surface-0).
- Single-line data when ready options can't be offered (else Select); multi-line → Text Area. Width 320 default, 240–400 range, fill-container in forms.
- Prefer read-only over disabled. Search = free input without suggestions; Mail only for single allowed domain; Password hidden by default.
- mobile: no special version; horizontal groups stack vertically, gap 8.

### Text Area
keys: ❇️ Text Area `d884fb839f067cdba9cd7ff80a112bda6939f237`
- Multi-line plain text (rich → editor; single-line → Input). Always fill-container width, min height 60, auto-grows. Read-only over disabled.

### Select
keys: ❇️ Select `c1ab759df25356702f5e2dc8eef60c5b15eb17c3`
- Pick ONE option; use for 4+ options / limited space / variable count. <4 → radio; multi → multi-select; typing → Suggest. Size S=32/M=40.

### Slider
keys: ❇️ Slider `d75fe619482a9d752f95e777eeed1b9a58d67118` · Centered `5d19b5b25fae99e58d266dd84a4d4540a06e1ba1` · Range `5af1148673a4cb39c5048aa7ba8b854e623e64f8`
- Numeric value in a fixed range; default / centered (can be negative) / range. Optional number input, steps via `step`, show unit/%.

### Form Field (label/caption/error wrapper)
keys: ❇️ Form Field `18184c17c89996644dc1bef35963732557108b07` · → Group `5f6c739a64959a52797e17c0eb8474a21a5be0ff`
- Wraps any control to add Label (above field, 1–3 words, sentence case, no colon) + Caption + Error. All fields have a label except fields in one group (ФИО, passport).
- Caption always present (even on focus), ≤3–4 lines; never show Caption and Error together (Error replaces Caption). Tooltip uses «i» not «?».

### Form (pattern)
keys: ❇️ Form · Preset `e941a5513890d97ca8cf95d2d678bac381848511`
- Ask only necessary data; group into titled sections; single column; field width ≈ expected input. ≤2 sections one page; 2–4 split; >4 multi-step with Steps + autosave + back.
- Mark the minority (required or optional). Validate client-side on blur; server errors inline near the field. Short forms disable primary until valid; long forms don't disable.

### File Upload
keys: File Upload · S `8738d128f3c01fdb9b34c6f3e2340d5f11db6345` · M `a50e6f5d58e8bd343418c168601af5758f90fc49` · Dropzone · S `e23aa7ed07c09beb53eb748c9b9eca1393e3284c` · M `08c7e9859a4c371c3d5911c7101325072b12e1de`
- Place as a slot inside Form Field. Single file → Button variant (file shows under button, re-click replaces). Multiple → drag-n-drop or Button (prefer Button). Errors in field Caption. mobile: Button only, no drag-n-drop.

### Date / DatePicker
keys: ❇️ Date Picker `78e3e453ebeff7694149aded97414963ba78764a` · [mobile] `6178f679f25aa9880195b58377c58cdb76f97dae` · Calendar `6283fdc2…`
- Placeholder `__.__.____`, auto-inserts separators, mandatory validation (reject year 3476). Date-of-birth = Date input with picker OFF. Desktop = dropdown (stable direction while scrolling months); mobile = bottom sheet ([mobile] variant).

## Data display

### Table
keys: 💎 Table · Cell `9c6b0c0889e894fc57de0f8ec893850558d48b44` · Cell · Header `68319e4229006b8f0dcfeb6c33e44c565776f69c`
- Cell heights 40 (1–2 lines / 1 line+caption) / 56 (2 lines+caption). Text max 2 lines then truncate; min column 64 on resize. All columns fixed, exactly ONE fill column. Sticky header on scroll; first column pins left on horizontal scroll.
- Row hover always on; selected = hover-token fill. 1 frequent action = exposed Icon Button, destructive in «More» (…); 2+ actions in «…». Chevron = drill-down (breadcrumbs/Back mandatory). Errors = red text + warning icon (not color alone).
- **mobile: desktop tables become grouped lists** — rows → 💠 List-Item, group by date/category into divider rows, statuses → ❇️ Tag · Status.

### Table Column Settings
keys: built on ❇️ Dropdown `d804e473f359d570f175d192ffd746ed885b11b9` (entry = gear ❇️ Button)
- Toggle columns via checkboxes, reorder via drag-handle; mandatory grouping columns pinned on+disabled at top. Search mandatory for long lists. Max height 670, search top + buttons bottom fixed, list scrolls.

### Tree-View
keys: 💠 Tree-View `e3ef5348656703d0a297b32f11ee77b7c5272b0a` · Item `6ccb29078542acb1ab232a6d56a6427c8dc2e7c7`
- Hierarchical data (folders, categories), NOT main nav, NOT single level (use Accordion). Levels 1–4, indent 24/level. Collapse button separate hit area; checkbox on branch selects all children (mixed state on partial). mobile: in development.

### Accordion
keys: ❇️ Accordion `56d0e088d1e7c4267d8cea6e7472456a4f78994f` · 💠 Item → Accordion `6edc574a31038255bb1787f2ea5a8ed610e1574e`
- View Ghost (default) / Outline (card) / Surface (card on grey). ↳Selected = expanded, has Caption = subtitle, content via ↳ Slot (swap a local 🔁 component). Slot ← icon/text/user.
- Use for limited space, grouping, hiding secondary info, splitting big forms. Avoid for always-visible critical info, 1–2 lines, nested accordions. **mobile: recommended, status Актуальный.**

### Mark (performance scores)
keys: Mark `6265504618cef8ce2d68ee812361744a3fee2b20` · Additional Data `38a3a9477930816fe921d5aa6615c32124eeb9a3`
- ONLY for performance-review scores. Size S (review) / XS (dense HR/finance tables). Score sets color+icon (don't override): (-) Red (+-) Yellow (+) Green (++) Blue (+++) Indigo (++++) Purple. Equal width, display-only.

### Avatar (people)
keys: User · Avatar `eb13a231cb709b4eb15e1943607d25c28f022a08`
- Sizes 24/32/40/48/56, optional status dot (`has Status`). Single user identity. For participant clusters (e.g. meeting rows) stack avatars with negative gap (−8) and append a `+N` overflow count; show ~5 then the count.

### List-Item (title + description row)
keys: 💠 List-Item `9af0d111a9413804fd21ff818855fbbdd3df5e4b`
- The canonical list row: leading slot (icon/avatar) + Label + Caption (title + description) + optional trailing text + after slot (submenu). Use it for list rows that need a two-line title/description — not just for mobile table conversion. Fill the Caption node directly (no exposed property).

### State (empty / error / success)
keys: ❇️ State `ab365df843df3dbe2f00cc6e54d053333af41191` · Empty `fabe8b3f92acce89d0b91998186eee241f7632c6` · Error `ef5efebf50e9edbefe2fa19484efe9386a7246a6` · Success `a2e67ffa69442305b1934cb1e1bd45a52a7bfb12`
- Why data is missing + next step. Empty (no data yet + CTA; empty search + refine). Error (failure + retry). Success (confirm + view). Structure: title + short user description + icon/illustration + action button. Not for auto-load or toast-fittable results.

## Actions & navigation

### Button
keys: ❇️ Button `4b89ed0d79330857ca6cf87f1f1a862b678fe227` · Group `1659a48b1774bf6d01af3a4846c7f89e1aff0ae7` · 💠 Icon Button `f5bfa9c24cc7690c9182f5b70fbd41a434784b51`
- variant text/icon; Size S/M/L = 32/40/48. Text variant has 2 icon slots (left reinforces, right = secondary action). Icon variant = main icon + tooltip. Label sentence case, no CAPS, no «…», verb/noun.
- Group gap 8: desktop horizontal (lowest priority left, highest right); **mobile vertical (highest on top)**. Slot ← icon, in button = «Button / 💠 Icon» `054cdf002d8efef15e9912df1972418b8a2e221c` with a Size=16 icon — never a bare icon.

### Button · Toggle / Dropdown
keys: Toggle `bd1ac3444722055768221c91b5a3c12b4c994094` · Dropdown `b40ff2ec38d2a3e8a571a976b7523d3c41d63474`
- Toggle = two-state switch (Закрепить/Открепить, Скрыть/Показать). Dropdown = menu of ACTIONS (not choices); «Ещё» after 3 visible buttons.

### FAB
keys: ❇️ FAB `59e3e29b11bf8d1ee84195b351d701b4e7614afd`
- view primary (action) / float (action or extra elements); press = action or reveal (icon → ✕). ≤4 actions → button group; >4 → menu. Desktop M=40, **mobile L=48**, default bottom-right. mobile: menu opens in a drawer; grouping FABs forbidden.

### Breadcrumbs
keys: Breadcrumbs `435c22ac3a99cb45af86dc248da1aa383ed3a083`
- Secondary nav showing hierarchy position, jump levels up (not history). Current level hidden until page scrolls ≥56px. **mobile: not used** (collapse to back-link in Content Header).

### Filter
keys: ❇️ Tag · Dropdown `5dcdae062ce66fceb1d8a6adc52767b3c76e01ce` · Tag · Toggle `c1787b6da695fc85f12ab1991b364141fabfdbd8` · Dropdown `d804e473f359d570f175d192ffd746ed885b11b9`
- 3 levels: Actions (search + «Фильтры» toggle w/ counter + CTA), Filters (tag group), Results (count + sorting). Dropdown filter (single=radio/multi=checkbox), Toggle (on/off), Search (always first). «Все фильтры» opens full list in a Drawer. **mobile: Беклог — on mobile collapse filters behind the filter button.**

## Overlays (choose by isolation level — KEY DECISION MATRIX)
keys: Toast `696e215a0a3730c66c01d01342b9f368c2718b2d` · Tooltip `13df85e3d4248ccdd422e4eaecfb41e1e11b1b8d` · Dialog `15adeff5f730b5227d9df66040c6a2d678943dd5` · Dialog·Confirm `4bd1f6094282088d90244db605caccc99eb7657f` · Modal `2dd861d35defdfdd5c11fe5c0ddfd7e443daee7b` · Popup `94d4b7ed01170e673318436f65c0db3c348667fd` · Drawer `94e5bd0b1f8a0de4ee85c28741c41924a91e1886` · Drawer [mobile] `4d65c84f128ab9a2bcb6f99320dcda3f729926e1`
- **Level 1, no backdrop:** Tooltip (short hint, no buttons, opens on hover), Popover (interactive content next to trigger, opens on CLICK not hover).
- **Level 2, with fade/backdrop:** Dialog (focused decision/confirmation, NOT forms), Drawer (details + actions on an object; no fade = parallel work, fade = focus), Tour (2–5 step intro, skippable).
- **Toast:** non-blocking feedback (result/status), auto-dismiss if short, never for field errors (those go inline). Error toast without tech codes.
- Dialog mobile pins to screen edges. Drawer: title mandatory & specific, footer Primary+Outline+Ghost(cancel), widths 480/640/800; switches to mobile modal WITH overlay at ≤767px.

## Patterns

### Suggest (mobile sheet)
- Suggest field in a Popup/sheet; needs a Fullscreen variant. Header: Title (+Subtitle) + back/Reset/× and a search row together. Body: search + List; footer: 1 action=Primary, 2=Primary+Secondary. Sticky search on scroll; fixed sheet height; large lists don't show until typing; re-open shows full list with selection scrolled into view.

### Org-structure search
- Search field over a collapsible tree (company → business groups → departments), each node with member count + expand chevron + single-select. (Spec is a screenshot only — replicate that structure.)

### Overlay surfaces meta-rule
- Temporary interaction over the current flow without navigating away; user returns without losing state. The more important the decision + the more content → the more you block the background (Tooltip/Popover → Dialog/Drawer/Tour). Toast never blocks.
