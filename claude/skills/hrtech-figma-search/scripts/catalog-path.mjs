import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export const DEFAULT_TEAM_ID = '978907722219265370';

// Resolve per-user storage independently from the installed skill. Updates may
// replace the skill directory; the catalog must survive those replacements.
export async function resolveCatalogPath({ catalog, teamId = DEFAULT_TEAM_ID, env = process.env, home = os.homedir() } = {}) {
  if (catalog) return path.resolve(catalog);
  if (env.BULOCHKA_FIGMA_CATALOG?.trim()) return path.resolve(env.BULOCHKA_FIGMA_CATALOG);
  const configPath = path.join(home, '.hrtech', 'figma-catalog.json');
  let config;
  try { config = JSON.parse(await fs.readFile(configPath, 'utf8')); }
  catch (error) {
    if (error.code !== 'ENOENT') throw new Error(`Не удалось прочитать ${configPath}: ${error.message}`);
  }
  if (config !== undefined) {
    if (typeof config?.catalogPath !== 'string' || !path.isAbsolute(config.catalogPath)) {
      throw new Error(`В ${configPath} требуется {"catalogPath":"/absolute/path/catalog.json"}`);
    }
    return path.resolve(config.catalogPath);
  }
  if (!/^\d+$/.test(teamId)) throw new Error('--team должен содержать числовой ID команды Figma');
  return path.join(home, '.hrtech', 'figma-catalog', teamId, 'catalog.json');
}

export function discoveryHint(catalogPath) {
  // JSON-encoded argv is for display only: never interpolate arbitrary paths
  // into a shell command. The agent can pass the shown path as a separate arg.
  return `Создайте реестр: запустите scripts/scan.mjs discover с --catalog ${JSON.stringify(catalogPath)} через Node из references/runtime.md. Нужен существующий токен Булочки (~/.hrtech/figma-token) или FIGMA_ACCESS_TOKEN. Затем повторите поиск; содержимое выбранных файлов дочитайте командой scan --file FILE_KEY.`;
}
