# Булочка + Figma — куда смотреть

Этот файл остался от версии 2.x, когда помощник был только один. Актуальная инструкция для
дизайнера — **[ONBOARDING.md](ONBOARDING.md)**: установка одной командой, вход в помощника
(Codex или Claude Code), импорт плагина в desktop Figma и работа каждый день.

Коротко то, ради чего сюда обычно заходят:

- **Установка:** `curl -fsSL https://raw.githubusercontent.com/artsaverin-star/hr-tech-design/main/install.sh | bash`
- **Плагин в Figma:** десктопная Figma → Plugins → Development → **Import plugin from manifest…** →
  `~/hr-tech-design/figma-desktop-bridge/manifest.json`
- **Каждый день:** открой файл и Булочку в Figma, а задачу опиши словами своему помощнику.
- **Если связь отвалилась:** закрой и заново открой Булочку в нужном файле. Проверить, что мост на
  месте: `codex mcp list` (Codex) или `claude mcp list` (Claude Code) — в списке должен быть
  `figma-hrtech`. В Claude Code переподключить можно прямо из чата: `/mcp` → **figma-hrtech** →
  Reconnect.

Старый `MCP-FOR-DESIGNERS.html` — рендер прежней версии этого файла, он тоже устарел.
