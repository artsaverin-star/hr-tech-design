// ============================================================================
// BULOCHKA 5.0 APPLICATION SHELL & STATE MACHINE
// ============================================================================
var HRTECH_UI_VERSION = '__UI_VERSION__';
var HRTECH_BRIDGE_VERSION = '__BRIDGE_VERSION__';
var HRTECH_INSTALL_CMD = 'curl -fsSL https://raw.githubusercontent.com/artsaverin-star/hr-tech-design/main/install.sh | bash';
var PLUGIN_WIDTH = 360;
var PLUGIN_HEIGHT = 480;

var hrtechUiCollapsed = false;
var __graceTimer = null;
var __activityTimer = null;
var __lastRepairError = '';
var __pinSource = null;

if (window.__hrtechConnStartedAt === undefined) window.__hrtechConnStartedAt = Date.now();
window.__hrtechLocked = false;

// ── Utilities ────────────────────────────────────────────────────────────────
function hrtechEscHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function hrtechCopyText(value) {
  var ta = document.createElement('textarea');
  ta.value = value;
  ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  var ok = false;
  try { ok = document.execCommand('copy'); } catch (e) {}
  ta.remove();
  return ok;
}

function hrtechFormatClientName(client) {
  if (!client || typeof client.name !== 'string' || !client.name) return '';
  var norm = client.name.trim().toLowerCase().replace(/[\s_]+/g, '-');
  if (['codex', 'codex-mcp-client', 'codex-cli', 'codex-cli-rs', 'codex-desktop'].indexOf(norm) !== -1) return 'Codex';
  if (['claude-code', 'claudecode'].indexOf(norm) !== -1) return 'Claude Code';
  if (['antigravity', 'antigravity-client', 'antigravity-ide', 'antigravity-cli', 'agy', 'jetski', 'gemini-code-assist'].indexOf(norm) !== -1) return 'Antigravity';
  if (['cursor', 'cursor-vscode', 'cursor-agent'].indexOf(norm) !== -1) return 'Cursor';
  return (client.title && typeof client.title === 'string' && client.title.trim()) ? client.title.trim() : client.name;
}

function hrtechVersionOlder(installed, available) {
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(installed || '') || !/^\d+\.\d+(?:\.\d+)?$/.test(available || '')) return false;
  var a = installed.split('.').map(Number);
  var b = available.split('.').map(Number);
  for (var i = 0; i < 3; i++) {
    if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) < (b[i] || 0);
  }
  return false;
}

function hrtechDistribution(connection) {
  return connection && ((connection.hostStatus && connection.hostStatus.distribution) || (connection.serverInfo && connection.serverInfo.distribution)) || 'не определена';
}

function hrtechDistributionLabel(dist) {
  if (dist === 'terminal') return 'Терминал (пакет)';
  if (dist === 'app') return 'Приложение (пакет)';
  if (dist === 'git') return 'Git (разработка)';
  return 'Нет данных';
}

// ── Connection Selection & Identity ──────────────────────────────────────────
function hrtechReadyConnections() {
  var conns = typeof window.__wsGetActiveConnections === 'function' ? window.__wsGetActiveConnections() : [];
  return conns.filter(function(c) { return c.ws && c.ws.readyState === 1 && c.serverInfo; });
}

function hrtechLegacyBridge(connection) {
  var info = connection && connection.serverInfo;
  return !!info && info.hrtechVersion === '4.27' && !info.bridgeProtocol;
}

function hrtechPrimaryConnection(connections) {
  return connections.find(function(c) { return c.fileRegistered && c.serverInfo.mcpClient; })
    || connections.find(function(c) { return c.ws === window.__hrtechOutcomeSocket && c.legacyFileSent; })
    || connections.find(function(c) { return c.legacyFileVerified; })
    || connections.find(function(c) { return c.legacyReady; })
    || connections[0];
}

function hrtechRepairConnection(connections) {
  var local = connections.filter(function(c) {
    return typeof c.port === 'number' && c.fileKey && /^\d+\.\d+(?:\.\d+)?$/.test(c.serverInfo.hrtechVersion || '');
  });
  var primary = hrtechPrimaryConnection(local);
  if (!primary) return;
  var sameFile = local.filter(function(c) { return c.fileKey === primary.fileKey; });
  return sameFile.find(function(c) { return c.fileRegistered && c.serverInfo.mcpClient && c.serverInfo.repairCheck; })
    || sameFile.find(function(c) { return c.fileRegistered && c.serverInfo.mcpClient; })
    || sameFile.find(function(c) { return c.serverInfo.bridgeProtocol === 1 && c.serverInfo.repairCheck; })
    || sameFile.find(function(c) { return hrtechLegacyBridge(c) && hrtechDistribution(c) === 'git'; })
    || primary;
}

function hrtechAssistantNames() {
  return hrtechReadyConnections()
    .filter(function(c) { return c.fileRegistered && c.serverInfo.mcpClient; })
    .map(function(c) { return hrtechFormatClientName(c.serverInfo.mcpClient); })
    .filter(function(name, i, all) { return name && all.indexOf(name) === i; });
}

function hrtechRawAssistantNames() {
  return hrtechReadyConnections()
    .filter(function(c) { return c.fileRegistered && c.serverInfo.mcpClient; })
    .map(function(c) { return c.serverInfo.mcpClient.name; })
    .filter(function(name, i, all) { return name && all.indexOf(name) === i; });
}

function hrtechConnectionVersions() {
  return hrtechReadyConnections().map(function(c) {
    var info = c.serverInfo;
    var label = info.mcpClient ? hrtechFormatClientName(info.mcpClient) : 'Мост';
    return label + ' v' + (info.hrtechVersion || '?') + ' (:' + c.port + ')';
  }).join(' · ');
}

function hrtechFileExchangeConfirmed(connection) {
  if (!connection) return false;
  if (connection.connectionCheck) return connection.connectionCheck.fileOk && !!connection.connectionCheck.client;
  return !!connection.legacyFileVerified || (!connection.serverInfo.repairCheck && connection.fileRegistered && !!connection.serverInfo.mcpClient);
}

function hrtechHasSearchSkill(connection) {
  if (!connection) return null;
  if (connection.connectionCheck) return connection.connectionCheck.client ? connection.connectionCheck.skillAvailable : null;
  var skills = connection.serverInfo && connection.serverInfo.skills;
  return Array.isArray(skills) ? skills.some(function(skill) { return skill.name === 'hrtech-figma-search'; }) : null;
}

function hrtechOffline() {
  if (hrtechReadyConnections().length) return false;
  var paused = typeof window.__wsIsPaused === 'function' && window.__wsIsPaused();
  var replaced = typeof window.__wsGetReplacedPorts === 'function' && window.__wsGetReplacedPorts().length > 0 && !window.__hrtechPendingRepair;
  return paused || replaced || (Date.now() - (window.__hrtechConnStartedAt || Date.now())) >= 9000;
}

function hrtechFoundAgents() {
  var agents = hrtechReadyConnections().length && window.__hrtechLastHostStatus ? window.__hrtechLastHostStatus.agents || {} : {};
  var found = [];
  if (agents.codex && agents.codex.installed) found.push('Codex');
  if (agents.claude && agents.claude.installed) found.push('Claude Code');
  if (agents.antigravity && agents.antigravity.installed) found.push('Antigravity');
  if (agents.cursor && agents.cursor.installed) found.push('Cursor');
  return found;
}

function scheduleGraceExpiry() {
  if (__graceTimer) { clearTimeout(__graceTimer); __graceTimer = null; }
  if (hrtechReadyConnections().length) return;
  if (typeof window.__wsIsPaused === 'function' && window.__wsIsPaused()) return;
  var elapsed = Date.now() - (window.__hrtechConnStartedAt || Date.now());
  if (elapsed < 9000) {
    __graceTimer = setTimeout(function() {
      __graceTimer = null;
      hrtechSyncBridgeState();
    }, 9050 - elapsed);
  }
}

// ── Navigation & Window Size ─────────────────────────────────────────────────
function sendResize() {
  if (hrtechUiCollapsed) return;
  parent.postMessage({ pluginMessage: { type: 'RESIZE_UI', width: PLUGIN_WIDTH, height: PLUGIN_HEIGHT } }, '*');
}

function hrtechNavigate(view) {
  var target = (view === 'settings') ? 'settings' : 'skills';
  var app = document.querySelector('.hrtech-app');
  if (app) app.classList.toggle('b4-settings-active', target === 'settings');
  var panels = document.querySelectorAll('[data-view-panel]');
  for (var i = 0; i < panels.length; i++) {
    panels[i].classList.toggle('active', panels[i].getAttribute('data-view-panel') === target);
  }
  var nav = document.querySelectorAll('.bun-nav-btn[data-view]');
  for (var j = 0; j < nav.length; j++) {
    nav[j].classList.toggle('active', nav[j].getAttribute('data-view') === target);
  }
  var content = document.getElementById('bun-content');
  if (content) content.scrollTop = 0;
  if (target === 'settings') {
    hrtechTokenState();
    hrtechTokenMsg('');
    hrtechRequestHost();
  }
  if (target === 'skills') hrtechSkills();
}

function hrtechToggleCompact() {
  hrtechUiCollapsed = !hrtechUiCollapsed;
  var app = document.querySelector('.hrtech-app');
  var button = document.getElementById('b6-collapse-toggle');
  var workspace = document.getElementById('b3-workspace');
  var svg = document.getElementById('b6-collapse-svg');
  var label = hrtechUiCollapsed ? 'Развернуть Булочку' : 'Свернуть Булочку';
  if (app) app.classList.toggle('b6-collapsed', hrtechUiCollapsed);
  if (workspace) workspace.setAttribute('aria-hidden', hrtechUiCollapsed ? 'true' : 'false');
  if (button) {
    button.setAttribute('aria-expanded', hrtechUiCollapsed ? 'false' : 'true');
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  }
  if (svg) {
    svg.innerHTML = hrtechUiCollapsed
      ? '<line x1="8" y1="3.5" x2="8" y2="12.5"/><line x1="3.5" y1="8" x2="12.5" y2="8"/>'
      : '<line x1="3.5" y1="8" x2="12.5" y2="8"/>';
  }
  parent.postMessage({ pluginMessage: { type: 'HRTECH_UI_COMPACT_SET', collapsed: hrtechUiCollapsed } }, '*');
}

function hrtechOpenConnection() {
  hrtechNavigate('settings');
}

// ── File Context & Activity ──────────────────────────────────────────────────
function hrtechSetContext(info) {
  info = info || {};
  window.__hrtechFileContext = info;
  var file = document.getElementById('b3-file-name');
  var page = document.getElementById('b3-page-name');
  if (file) file.textContent = info.fileName || 'Файл определяется…';
  if (page) {
    page.textContent = info.currentPage || '';
    page.hidden = !info.currentPage;
  }
}
window.__hrtechSetContext = hrtechSetContext;

window.__hrtechOnPageChange = function(data) {
  if (!data) return;
  var page = document.getElementById('b3-page-name');
  if (page) {
    page.textContent = data.pageName || '';
    page.hidden = !data.pageName;
  }
};

window.__hrtechOnActivity = function(msg) {
  var banner = document.getElementById('hrtech-gen');
  var detail = document.getElementById('hrtech-activity-detail');
  if (!banner) return;
  if (detail) detail.textContent = msg.label || '';
  banner.hidden = false;
  if (__activityTimer) clearTimeout(__activityTimer);
  __activityTimer = setTimeout(function() {
    banner.hidden = true;
    __activityTimer = null;
  }, 15000);
};

function hrtechRefreshContext() {
  if (typeof window.sendPluginCommand !== 'function') { setTimeout(hrtechRefreshContext, 300); return; }
  window.sendPluginCommand('GET_FILE_INFO', {}).then(function(result) {
    hrtechSetContext((result && result.fileInfo) || result || {});
  }).catch(function() {});
}

// ── Click-to-Copy Prompts on Home ────────────────────────────────────────────
function hrtechCopyPrompt(btn, text) {
  if (!btn || !text) return;
  var ok = hrtechCopyText(text);
  if (!ok) return;
  var badge = btn.querySelector('.bun-prompt-badge');
  if (!badge) return;
  if (!badge.dataset.origHtml) badge.dataset.origHtml = badge.innerHTML;
  if (btn.__copyTimer) clearTimeout(btn.__copyTimer);
  btn.classList.add('copied');
  badge.textContent = 'Скопировано ✓';
  btn.__copyTimer = setTimeout(function() {
    btn.classList.remove('copied');
    badge.innerHTML = badge.dataset.origHtml;
    btn.__copyTimer = null;
  }, 1800);
}

// ── Pin File Switch ──────────────────────────────────────────────────────────
function hrtechSendPin(pin) {
  var conns = typeof window.__wsGetActiveConnections === 'function' ? window.__wsGetActiveConnections() : [];
  for (var i = 0; i < conns.length; i++) {
    if (conns[i].ws && conns[i].ws.readyState === 1) {
      try { conns[i].ws.send(JSON.stringify({ type: pin ? 'PIN_FILE' : 'UNPIN_FILE' })); } catch (e) {}
    }
  }
}

function hrtechRenderLock() {
  var sw = document.getElementById('hrtech-lock-toggle');
  var sub = document.getElementById('bun-pin-sub');
  var pinPill = document.getElementById('bun-status-pin');
  var on = !!window.__hrtechLocked;
  if (sw) {
    sw.setAttribute('aria-pressed', on ? 'true' : 'false');
    sw.disabled = (__pinSource === 'tool');
  }
  if (sub) {
    sub.textContent = (__pinSource === 'tool' && on)
      ? 'Закреплено активной задачей помощника'
      : on
        ? 'Помощник работает только в этом файле'
        : 'Другие вкладки Figma не перехватят помощника';
  }
  if (pinPill) pinPill.hidden = !on || !hrtechReadyConnections().length;
}

function hrtechToggleLock() {
  if (__pinSource === 'tool') return;
  window.__hrtechLocked = !window.__hrtechLocked;
  hrtechSendPin(window.__hrtechLocked);
  hrtechRenderLock();
  hrtechConnState();
}

window.__hrtechSetLock = function(on, source) {
  window.__hrtechLocked = !!on;
  __pinSource = source || null;
  hrtechRenderLock();
  hrtechConnState();
};

// ── Host Status & Token ──────────────────────────────────────────────────────
function hrtechRequestHost() {
  try {
    var current = hrtechPrimaryConnection(hrtechReadyConnections());
    if (!current || Date.now() - (current.hostRequestedAt || 0) < 1500) return;
    current.hostRequestedAt = Date.now();
    current.ws.send(JSON.stringify({ type: 'HRTECH_HOST_STATUS_REQUEST' }));
  } catch (e) {}
}

window.__hrtechHostStatus = function(data, socket) {
  var current = hrtechReadyConnections().find(function(c) { return !socket || c.ws === socket; });
  if (current) current.hostStatus = data || {};
  hrtechSyncBridgeState();
};

function hrtechTokenState() {
  var badge = document.getElementById('hrtech-token-state');
  var editBtn = document.getElementById('hrtech-token-edit-btn');
  var clearBtn = document.getElementById('hrtech-token-clear-btn');
  if (!badge) return;
  var connected = hrtechReadyConnections().length > 0;
  var has = connected ? window.__hrtechTokenOnServer : undefined;
  if (has === true) {
    badge.textContent = 'Задан';
    badge.className = 'bun-badge on';
  } else if (has === false) {
    badge.textContent = 'Необязательно';
    badge.className = 'bun-badge';
  } else {
    badge.textContent = hrtechOffline() ? 'Нет связи' : 'Проверяю…';
    badge.className = 'bun-badge';
  }
  if (editBtn) editBtn.textContent = has ? 'Заменить токен' : 'Добавить токен';
  if (clearBtn) clearBtn.hidden = !has;
}

function hrtechTokenEdit() {
  var form = document.getElementById('hrtech-token-edit');
  var actions = document.getElementById('hrtech-token-actions');
  if (form) form.hidden = false;
  if (actions) actions.hidden = true;
  var inp = document.getElementById('hrtech-token-input');
  if (inp) { try { inp.focus(); } catch (e) {} }
}

function hrtechTokenCancel() {
  var form = document.getElementById('hrtech-token-edit');
  var actions = document.getElementById('hrtech-token-actions');
  var inp = document.getElementById('hrtech-token-input');
  if (form) form.hidden = true;
  if (actions) actions.hidden = false;
  if (inp) inp.value = '';
  hrtechTokenMsg('');
}

function hrtechTokenMsg(text, kind) {
  var el = document.getElementById('hrtech-token-msg');
  if (!el) return;
  el.textContent = text || '';
  el.className = 'bun-note' + (kind ? ' ' + kind : '');
}

function hrtechTokenSave() {
  var inp = document.getElementById('hrtech-token-input');
  var t = ((inp && inp.value) || '').trim();
  if (t.indexOf('fig') !== 0 || t.length < 20) {
    hrtechTokenMsg('Токен начинается с figd_ — проверьте, что скопировали целиком.', 'err');
    return;
  }
  var conns = hrtechReadyConnections();
  var sent = false;
  for (var i = 0; i < conns.length; i++) {
    if (conns[i].ws && conns[i].ws.readyState === 1) {
      try { conns[i].ws.send(JSON.stringify({ type: 'SET_FIGMA_TOKEN', token: t })); sent = true; break; } catch (e) {}
    }
  }
  if (inp && sent) inp.value = '';
  hrtechTokenMsg(sent ? 'Сохраняю…' : 'Сначала подключите помощника — токен сохранён в поле.', sent ? '' : 'err');
}

function hrtechTokenClear() {
  var conns = hrtechReadyConnections();
  var sent = false;
  for (var i = 0; i < conns.length; i++) {
    if (conns[i].ws && conns[i].ws.readyState === 1) {
      try { conns[i].ws.send(JSON.stringify({ type: 'SET_FIGMA_TOKEN', clear: true })); sent = true; break; } catch (e) {}
    }
  }
  hrtechTokenMsg(sent ? 'Удаляю токен…' : 'Нет связи с мостом.', sent ? '' : 'err');
}

window.__hrtechTokenAck = function(data) {
  if (data && data.cleared) {
    hrtechTokenCancel();
    hrtechTokenMsg('Токен удалён.', 'ok');
    return;
  }
  if (data && data.ok) {
    hrtechTokenCancel();
    hrtechTokenMsg('Токен сохранён и сразу активен.', 'ok');
  } else {
    hrtechTokenMsg('Токен не принят — проверьте, что скопировали его из Figma.', 'err');
  }
};

// ── Skills & Diagnostics Rendering ───────────────────────────────────────────
function hrtechSkills() {
  var cnt = document.getElementById('hrtech-skills-count');
  var hint = document.getElementById('hrtech-skills-hint');
  var current = hrtechPrimaryConnection(hrtechReadyConnections());
  var list = current && current.serverInfo.skills;
  var searchExample = document.getElementById('bun-figma-search-example');
  if (searchExample) searchExample.hidden = hrtechHasSearchSkill(current) !== true;
  if (!cnt) return;
  if (!list) {
    cnt.textContent = hrtechOffline() ? 'Нет связи' : 'Проверяю…';
    cnt.className = 'bun-kv-value muted';
    if (hint) hint.textContent = '';
    return;
  }
  if (!list.length) {
    cnt.textContent = 'Не найдены';
    cnt.className = 'bun-kv-value muted';
    if (hint) hint.textContent = 'Нажмите «Починить», чтобы переподключить умения.';
    return;
  }
  var tail = list.length % 10, teen = list.length % 100;
  var word = (teen > 10 && teen < 20) ? 'умений' : (tail === 1 ? 'умение' : (tail >= 2 && tail <= 4 ? 'умения' : 'умений'));
  cnt.textContent = list.length + ' ' + word;
  cnt.className = 'bun-kv-value';
  if (hint) hint.textContent = '';
}

function hrtechRenderSelectedAgentHost() {
  var meta = document.getElementById('b3-codex-meta');
  var distEl = document.getElementById('bun-dist-meta');
  var connected = hrtechReadyConnections().length > 0;
  if (meta) {
    var agents = hrtechFoundAgents();
    meta.textContent = connected && window.__hrtechLastHostStatus ? (agents.join(' · ') || 'Не определены') : 'Жду подключения';
    meta.className = 'bun-kv-value' + (connected && agents.length ? '' : ' muted');
  }
  if (distEl) {
    var dist = connected ? window.__hrtechDistribution : null;
    distEl.textContent = dist ? hrtechDistributionLabel(dist) : 'Нет данных';
    distEl.className = 'bun-kv-value' + (dist ? '' : ' muted');
  }
}

// ── Auto-update, Repair & Verification State Machine ─────────────────────────
function hrtechAutoUpdate() {
  if (window.__hrtechRepairBusy || window.__hrtechPendingRepair) return;
  var live = hrtechReadyConnections().find(function(c) {
    var info = c.serverInfo;
    return c.fileKey && info.bridgeProtocol === 1 && info.mcpClient &&
      (info.distribution === 'terminal' || info.distribution === 'app') &&
      hrtechVersionOlder(info.hrtechVersion, HRTECH_BRIDGE_VERSION);
  });
  if (!live) return;
  var key = live.serverInfo.hrtechVersion + '>' + HRTECH_BRIDGE_VERSION;
  var attempts = window.__hrtechAutoUpdateAttempts || (window.__hrtechAutoUpdateAttempts = {});
  if (attempts[key]) return;
  attempts[key] = true;
  hrtechRepair(live);
}

function setUpdateNote(text, kind) {
  var note = document.getElementById('bun-update-note');
  if (!note) return;
  note.textContent = text || '';
  note.className = 'bun-note' + (kind ? ' ' + kind : '');
}

function hrtechFinishRepair(operation, text, kind) {
  if (window.__hrtechRepairOperation !== operation) return;
  if (operation.connection.checkOutcome === 'Ожидает восстановления') operation.connection.checkOutcome = text;
  clearTimeout(window.__hrtechRepairTimer);
  clearTimeout(operation.recheckTimer);
  var pending = operation.connection.checkRequest;
  if (pending && pending.operation === operation) {
    clearTimeout(pending.timer);
    operation.connection.checkRequest = null;
  }
  window.__hrtechRepairOperation = null;
  window.__hrtechRepairSocket = null;
  window.__hrtechRepairBusy = false;
  window.__hrtechOutcomeSocket = operation.socket;
  setUpdateNote(text, kind || '');
  hrtechConnState();
  hrtechRenderRepair();
}

function hrtechCheckConnection(connection, operation) {
  if (!connection.serverInfo.repairCheck || !connection.fileRegistered || !connection.fileKey || connection.checkRequest) return;
  var identity = JSON.stringify(connection.serverInfo.mcpClient || null);
  if (!operation && connection.checkedIdentity === identity) return;
  connection.checkedIdentity = identity;
  var requestId = 'bulochka-check-' + (window.__hrtechCheckSequence = (window.__hrtechCheckSequence || 0) + 1);
  var request = { requestId: requestId, fileKey: connection.fileKey, operation: operation };
  connection.checkRequest = request;
  connection.checkOutcome = 'Проверяю файл, помощника и поиск';
  request.timer = setTimeout(function() {
    if (connection.checkRequest !== request) return;
    connection.checkRequest = null;
    connection.connectionCheck = { fileOk: false, client: null, skillAvailable: false };
    connection.checkOutcome = 'Мост не ответил на проверку';
    if (operation) hrtechFinishRepair(operation, 'Мост не ответил на проверку. Нажмите «Починить» ещё раз.', 'err');
    else hrtechRenderRepair();
    hrtechConnState();
  }, 10000);
  try {
    connection.ws.send(JSON.stringify({ type: 'HRTECH_CHECK_CONNECTION', requestId: requestId }));
  } catch (e) {
    clearTimeout(request.timer);
    connection.checkRequest = null;
    connection.connectionCheck = { fileOk: false, client: null, skillAvailable: false };
    connection.checkOutcome = 'Не удалось отправить проверку';
    if (operation) hrtechFinishRepair(operation, 'Связь прервалась во время проверки.', 'err');
    hrtechConnState();
  }
}

window.__hrtechConnectionCheckResult = function(data, socket) {
  var connection = hrtechReadyConnections().find(function(c) { return c.ws === socket; });
  var request = connection && connection.checkRequest;
  if (!request || !data || data.requestId !== request.requestId) return;
  clearTimeout(request.timer);
  connection.checkRequest = null;
  var sameFile = data.fileKey === request.fileKey && connection.fileKey === request.fileKey;
  var client = data.client && typeof data.client.name === 'string' && data.client.name ? data.client : null;
  if (sameFile) {
    connection.serverInfo.mcpClient = client;
    connection.checkedIdentity = JSON.stringify(client);
  }
  connection.connectionCheck = { fileOk: sameFile && data.fileOk === true, client: client, skillAvailable: data.skillAvailable === true };
  var result = connection.connectionCheck;
  var displayClient = client ? hrtechFormatClientName(client) : '';
  var text = !result.fileOk ? 'Связь с этим файлом не подтверждена.'
    : !client ? 'Подключение помощника не подтверждено.'
    : !result.skillAvailable ? 'Не удалось подтвердить умение поиска для ' + displayClient + '.'
    : 'Связь с файлом подтверждена. Умение поиска установлено.';
  var kind = (result.fileOk && client && result.skillAvailable) ? 'ok' : 'err';
  connection.checkOutcome = text;
  var operation = request.operation;
  if (operation && window.__hrtechRepairOperation === operation && operation.handover && result.fileOk && (!client || !result.skillAvailable)) {
    operation.phase = 'retry';
    setUpdateNote(!client ? 'Файл доступен. Жду подключения помощника…' : 'Файл доступен. Проверяю установку умений…', '');
    operation.recheckTimer = setTimeout(function() {
      if (window.__hrtechRepairOperation !== operation || operation.socket !== socket) return;
      operation.phase = 'check';
      hrtechCheckConnection(connection, operation);
    }, 1500);
  } else if (operation) {
    hrtechFinishRepair(operation, text, kind);
  }
  hrtechConnState();
  hrtechRenderRepair();
};

function hrtechMaintainRepair(connections) {
  var operation = window.__hrtechRepairOperation;
  if (!operation) {
    connections.forEach(function(c) { hrtechCheckConnection(c); });
    return;
  }
  var current = connections.find(function(c) { return c.ws === operation.socket; });
  if (!current) {
    clearTimeout(operation.recheckTimer);
    if (operation.connection.checkRequest) {
      clearTimeout(operation.connection.checkRequest.timer);
      operation.connection.checkRequest = null;
    }
    operation.phase = 'reconnect';
    setUpdateNote('Жду перезапуска моста…', '');
    current = connections.find(function(c) {
      return operation.previousSockets.indexOf(c.ws) === -1 && c.port === operation.port &&
        c.fileKey === operation.fileKey && c.fileRegistered &&
        (!operation.clientName || (c.serverInfo.mcpClient && c.serverInfo.mcpClient.name === operation.clientName));
    });
    if (!current) return;
    operation.socket = current.ws;
    operation.connection = current;
    operation.handover = true;
    window.__hrtechRepairSocket = current.ws;
    current.repairOutcome = 'Соединение обновилось';
    operation.phase = 'check';
  }
  if (operation.phase === 'check') {
    setUpdateNote('Проверяю файл, помощника и поиск…', '');
    if (current.serverInfo.repairCheck) hrtechCheckConnection(current, operation);
    else if (current.fileRegistered) hrtechFinishRepair(operation, 'Мост подключён. Проверка поиска в этой версии недоступна.', 'ok');
  }
}

function hrtechResumePendingRepair(connections) {
  var pending = window.__hrtechPendingRepair;
  if (!pending) return;
  var paused = window.__wsIsPaused && window.__wsIsPaused();
  var live = hrtechRepairConnection(connections);
  if (!paused && !live) return;
  clearTimeout(pending.timer);
  window.__hrtechPendingRepair = null;
  if (paused) {
    setUpdateNote('Поиск приостановлен.', '');
    hrtechRenderRepair();
  } else {
    hrtechRepair(live);
  }
}

function hrtechRepair(targetConnection) {
  if (window.__hrtechRepairBusy || window.__hrtechPendingRepair || (window.__wsIsPaused && window.__wsIsPaused())) return;
  var connections = hrtechReadyConnections();
  var live = targetConnection || hrtechRepairConnection(connections);
  if (targetConnection && (typeof live.port !== 'number' || connections.indexOf(live) === -1 || !live.fileKey)) return;
  var note = document.getElementById('bun-update-note');
  if (note) delete note.dataset.awaitingFile;

  if (!live) {
    var pending = {};
    window.__hrtechPendingRepair = pending;
    window.__hrtechOutcomeSocket = null;
    window.__hrtechConnStartedAt = Date.now();
    setUpdateNote('Ищу запущенный мост…', '');
    pending.timer = setTimeout(function() {
      if (window.__hrtechPendingRepair !== pending) return;
      window.__hrtechPendingRepair = null;
      if (note) note.dataset.awaitingFile = 'true';
      setUpdateNote('Мост пока не подключился. Перезапустите помощника (⌘Q), отправьте сообщение в новом чате или выполните команду в Терминале.', '');
      hrtechConnState();
      hrtechRenderRepair();
    }, 20000);
    hrtechConnState();
    hrtechRenderRepair();
    if (window.__wsScanAndConnect) window.__wsScanAndConnect(true);
    return;
  }

  if (live.checkRequest) { clearTimeout(live.checkRequest.timer); live.checkRequest = null; }
  live.connectionCheck = null;
  live.checkOutcome = 'Ожидает восстановления';
  live.legacyFileSent = false;
  live.legacyReady = false;
  __lastRepairError = '';
  var operation = {
    socket: live.ws,
    connection: live,
    port: live.port,
    fileKey: live.fileKey,
    clientName: live.serverInfo.mcpClient && live.serverInfo.mcpClient.name,
    previousSockets: hrtechReadyConnections().map(function(c) { return c.ws; }),
    phase: 'repair'
  };
  window.__hrtechRepairOperation = operation;
  window.__hrtechRepairSocket = live.ws;
  window.__hrtechRepairBusy = true;
  window.__hrtechOutcomeSocket = null;
  live.repairOutcome = 'Восстановление выполняется';
  hrtechConnState();
  hrtechRenderRepair();
  setUpdateNote('Обновляю мост и умения…', '');
  window.__hrtechRepairTimer = setTimeout(function() {
    if (window.__hrtechRepairOperation !== operation) return;
    if (operation.phase === 'repair') operation.connection.repairOutcome = 'Результат восстановления не подтверждён';
    var reason = operation.phase === 'reconnect' ? 'Мост не подключился снова.'
      : operation.phase === 'handover' ? 'Новая версия моста не подключилась.'
      : (operation.connection.checkOutcome && operation.phase !== 'repair') ? operation.connection.checkOutcome
      : 'Мост не подтвердил завершение.';
    hrtechFinishRepair(operation, 'Восстановление не подтверждено. ' + reason, 'err');
  }, 90000);
  try {
    live.ws.send(JSON.stringify({ type: 'HRTECH_REPAIR' }));
  } catch (e) {
    hrtechFinishRepair(operation, 'Не удалось отправить запрос мосту.', 'err');
  }
}

window.__hrtechRepairResult = function(data, socket) {
  var operation = window.__hrtechRepairOperation;
  var conn = hrtechReadyConnections().find(function(c) { return c.ws === socket; });
  if (!operation || operation.phase !== 'repair' || !conn || socket !== operation.socket || !data || !data.finished) return;
  if (Array.isArray(data.skills)) conn.serverInfo.skills = data.skills;
  else if (hrtechLegacyBridge(conn)) delete conn.serverInfo.skills;
  if (data.distribution) conn.serverInfo.distribution = data.distribution;
  if (data.ok !== true) {
    __lastRepairError = data.errorDetail || data.error || '';
    conn.repairOutcome = 'Ошибка скрипта восстановления' + (__lastRepairError ? ': ' + __lastRepairError : '');
    var msg = 'Не удалось восстановить настройки.' + (__lastRepairError ? ' ' + __lastRepairError : ' Подробности — в диагностике.');
    hrtechFinishRepair(operation, msg, 'err');
    return;
  }
  conn.repairOutcome = 'Настройки восстановлены';
  if (conn.serverInfo.fileRegistrationAck) conn.fileRegistered = false;
  operation.phase = 'register';
  return window.__wsRefreshFile(socket).then(function(sent) {
    if (window.__hrtechRepairOperation !== operation || operation.socket !== socket || operation.phase !== 'register') return;
    if (!sent) { hrtechFinishRepair(operation, 'Не удалось подключить файл. Откройте Булочку в нём снова.', 'err'); return; }
    if (conn.serverInfo.repairCheck) {
      operation.phase = 'check';
      hrtechMaintainRepair(hrtechReadyConnections());
      return;
    }
    var distribution = hrtechDistribution(conn);
    if (conn.serverInfo.bridgeProtocol === 1 && (distribution === 'app' || distribution === 'terminal') &&
        hrtechVersionOlder(conn.serverInfo.hrtechVersion, HRTECH_BRIDGE_VERSION)) {
      operation.phase = 'handover';
      setUpdateNote('Жду обновлённый мост для проверки…', '');
      return;
    }
    var skill = hrtechHasSearchSkill(conn);
    conn.legacyFileSent = hrtechLegacyBridge(conn);
    conn.legacyReady = conn.legacyFileSent && skill === true;
    var text = skill === true ? 'Файл передан мосту. Умение поиска найдено.'
      : skill === false && hrtechLegacyBridge(conn) && hrtechDistribution(conn) === 'app'
        ? 'Файл передан мосту. Для установки поиска на 4.27 нажмите «Команда для Терминала».'
        : skill === false ? 'Файл передан мосту. Умение поиска не найдено.'
        : 'Файл передан мосту. Мост не сообщил список умений.';
    hrtechFinishRepair(operation, text, skill === true ? 'ok' : '');
    hrtechSyncBridgeState();
  });
};

// ── Main Connection State & Actions Renderer ─────────────────────────────────
function hrtechComputeState() {
  var conns = hrtechReadyConnections();
  var primary = hrtechPrimaryConnection(conns);
  var n = conns.length;
  var paused = typeof window.__wsIsPaused === 'function' && window.__wsIsPaused();
  var replaced = typeof window.__wsGetReplacedPorts === 'function' ? window.__wsGetReplacedPorts() : [];
  var searching = Date.now() - (window.__hrtechConnStartedAt || Date.now()) < 9000 || !!window.__hrtechPendingRepair;
  var legacy = hrtechLegacyBridge(primary);
  var verified = legacy && primary.legacyFileVerified;
  var info = primary && primary.serverInfo;
  var outdated = !!info && !legacy && (info.bridgeProtocol ? info.bridgeProtocol !== 1 : !!info.hrtechVersion && info.hrtechVersion !== HRTECH_BRIDGE_VERSION);
  var fileConfirmed = primary && hrtechFileExchangeConfirmed(primary);
  var registered = conns.some(function(c) { return c.fileRegistered; }) || verified || (legacy && primary.legacyFileSent);
  var assistants = hrtechAssistantNames();

  var state = 'offline';
  if (paused) state = 'paused';
  else if (window.__hrtechRepairBusy || (primary && primary.checkRequest)) state = 'checking';
  else if (n > 0) {
    if (outdated) state = 'outdated';
    else if (fileConfirmed || (legacy && primary.legacyReady)) state = 'connected';
    else state = 'waiting';
  } else if (replaced.length > 0 && !window.__hrtechPendingRepair) {
    state = 'replaced';
  } else if (searching) {
    state = 'searching';
  } else {
    state = 'offline';
  }

  return {
    conns: conns,
    primary: primary,
    n: n,
    paused: paused,
    replaced: replaced,
    legacy: legacy,
    verified: verified,
    outdated: outdated,
    fileConfirmed: fileConfirmed,
    registered: registered,
    assistants: assistants,
    state: state
  };
}

function hrtechConnState() {
  var s = hrtechComputeState();
  var app = document.querySelector('.hrtech-app');
  var statusBar = document.getElementById('bun-connection-status');
  var statusLabel = document.getElementById('bun-status-label');
  var heroCard = document.getElementById('hrtech-conn');
  var title = document.getElementById('bun-connection-title');
  var msg = document.getElementById('hrtech-conn-msg');
  var pills = document.getElementById('bun-client-pills');
  var offlineSteps = document.getElementById('bun-offline-steps');
  var fileBlock = document.getElementById('bun-connected-file');
  var compactState = document.getElementById('bun-compact-state');
  var note = document.getElementById('bun-update-note');

  if (note && note.dataset.awaitingFile && s.primary && typeof s.primary.port === 'number' && (s.verified || (s.primary.connectionCheck && s.fileConfirmed))) {
    delete note.dataset.awaitingFile;
    setUpdateNote(s.primary.connectionCheck ? s.primary.checkOutcome : '', s.fileConfirmed ? 'ok' : '');
  }

  var stripText = 'Нет подключения';
  var heroTitle = 'Нет подключения';
  var detail = '';
  var compact = 'Нет';

  if (s.state === 'connected') {
    var verb = s.assistants.length > 1 ? ' подключены' : ' подключён';
    stripText = s.assistants.length ? (s.assistants.join(' · ') + verb) : 'Файл подключён';
    heroTitle = 'Файл подключён';
    compact = 'Готово';
  } else if (s.state === 'checking') {
    stripText = window.__hrtechRepairBusy ? 'Обновляю Булочку…' : 'Проверяю связь…';
    heroTitle = window.__hrtechRepairBusy ? 'Обновляю Булочку…' : 'Проверяю связь с файлом…';
    compact = 'Жду…';
  } else if (s.state === 'outdated') {
    stripText = 'Нужно обновить мост';
    heroTitle = 'Версии различаются';
    detail = 'Нажмите «Обновить», чтобы подтянуть совместимый мост.';
    compact = 'Обн.';
  } else if (s.state === 'waiting') {
    if (s.legacy) {
      stripText = s.primary.legacyFileSent ? 'Файл передан мосту 4.27' : 'Мост 4.27 доступен';
      heroTitle = stripText;
      detail = 'Для перехода на 5.0 выполните команду в Терминале и откройте новый чат.';
    } else if (s.primary && s.primary.connectionCheck && !s.primary.connectionCheck.fileOk) {
      stripText = 'Связь с файлом не подтверждена';
      heroTitle = 'Связь с файлом не подтверждена';
      detail = 'Нажмите «Починить», чтобы переподключить открытый файл.';
    } else if (s.assistants.length) {
      stripText = s.assistants.join(' · ') + ' — определяю файл…';
      heroTitle = 'Определяю файл…';
      detail = 'Жду подтверждения файла от моста.';
    } else {
      stripText = 'Ожидаю помощника';
      heroTitle = 'Ожидаю помощника';
      detail = 'Перезапустите помощника (⌘Q) и отправьте сообщение в новом чате.';
    }
    compact = 'Жду…';
  } else if (s.state === 'replaced') {
    stripText = 'Открыто в другой вкладке';
    heroTitle = 'Открыто в другой вкладке';
    detail = 'Этот файл сейчас подключён в другом окне Булочки. Нажмите кнопку ниже, чтобы переключить сюда.';
    compact = 'Вкладка';
  } else if (s.state === 'paused') {
    stripText = 'На паузе';
    heroTitle = 'Связь на паузе';
    detail = 'Поиск локального моста приостановлен.';
    compact = 'Пауза';
  } else if (s.state === 'searching') {
    stripText = 'Подключаюсь…';
    heroTitle = 'Ищу локальный мост…';
    compact = 'Жду…';
  } else {
    stripText = 'Нет подключения · Настроить';
    heroTitle = 'Нет подключения';
    compact = 'Нет';
  }

  if (app) {
    app.dataset.connectionState = s.state;
    app.classList.toggle('hrtech-connected', s.n > 0);
    app.classList.toggle('hrtech-outdated', s.outdated);
  }
  if (statusBar) statusBar.dataset.state = s.state;
  if (heroCard) heroCard.dataset.state = s.state;
  if (statusLabel) statusLabel.textContent = stripText;
  if (title) title.textContent = heroTitle;
  if (compactState) compactState.textContent = compact;
  var brand = document.getElementById('bun-brand');
  if (brand) brand.title = stripText;

  if (pills) {
    if (s.n > 0 && s.assistants.length) {
      pills.hidden = false;
      pills.innerHTML = s.assistants.map(function(name) {
        return '<span class="bun-client-pill">' + hrtechEscHtml(name) + '</span>';
      }).join('');
    } else {
      pills.hidden = true;
      pills.innerHTML = '';
    }
  }

  if (msg) {
    msg.textContent = detail;
    msg.hidden = !detail;
  }
  if (offlineSteps) offlineSteps.hidden = !(s.state === 'offline');
  if (fileBlock) fileBlock.hidden = !s.registered;
  hrtechRenderLock();
  hrtechRenderRepair(s);
}

function hrtechRenderRepair(computed) {
  var s = computed || hrtechComputeState();
  var repairBtn = document.getElementById('hrtech-repair');
  var installBtn = document.getElementById('hrtech-install-manual');
  var reclaimBtn = document.getElementById('hrtech-reclaim');
  var resumeBtn = document.getElementById('hrtech-connect');
  var pauseBtn = document.getElementById('bun-pause-btn');

  if (pauseBtn) {
    pauseBtn.textContent = s.paused ? 'Возобновить' : 'Пауза';
    pauseBtn.classList.toggle('active', s.paused);
  }

  var busy = !!window.__hrtechRepairBusy || !!window.__hrtechPendingRepair;

  if (reclaimBtn) {
    reclaimBtn.hidden = (s.state !== 'replaced');
    reclaimBtn.disabled = busy;
  }
  if (resumeBtn) {
    resumeBtn.hidden = !s.paused;
    resumeBtn.disabled = busy;
  }

  var conn = hrtechRepairConnection(s.conns);
  var needsRepair = conn && (
    hrtechLegacyBridge(conn) ||
    !conn.serverInfo.mcpClient ||
    hrtechHasSearchSkill(conn) !== true ||
    (conn.connectionCheck && !conn.connectionCheck.fileOk) ||
    s.outdated
  );

  if (repairBtn && installBtn) {
    if (s.state === 'offline' || s.state === 'searching') {
      // Offline / first-time setup: primary golden CTA is copying the terminal command;
      // secondary button checks/retries connection.
      installBtn.hidden = false;
      installBtn.className = 'bun-btn bun-btn-primary';
      installBtn.textContent = 'Скопировать команду';
      installBtn.disabled = busy;

      repairBtn.hidden = false;
      repairBtn.className = 'bun-btn';
      repairBtn.textContent = window.__hrtechPendingRepair ? 'Ищу мост…' : 'Проверить связь';
      repairBtn.disabled = busy;
    } else if (s.state === 'paused' || s.state === 'replaced') {
      repairBtn.hidden = true;
      installBtn.hidden = false;
      installBtn.className = 'bun-btn-link';
      installBtn.textContent = 'Команда для Терминала';
      installBtn.disabled = busy;
    } else {
      // Connected / waiting / outdated / checking
      repairBtn.hidden = false;
      repairBtn.disabled = busy;
      if (needsRepair) {
        repairBtn.className = 'bun-btn bun-btn-primary';
        repairBtn.textContent = busy ? 'Восстанавливаю…' : (s.outdated ? 'Обновить' : 'Починить');
      } else {
        repairBtn.className = 'bun-btn';
        repairBtn.textContent = busy ? 'Проверяю…' : 'Обновить';
      }
      installBtn.hidden = false;
      installBtn.className = 'bun-btn-link';
      installBtn.textContent = 'Команда для Терминала';
      installBtn.disabled = busy;
    }
  }
}

function hrtechSyncBridgeState() {
  var conns = hrtechReadyConnections();
  var current = hrtechPrimaryConnection(conns);
  if (!current && window.__hrtechCurrentWs) window.__hrtechConnStartedAt = Date.now();
  window.__hrtechCurrentWs = current ? current.ws : null;

  var info = current && current.serverInfo;
  window.__hrtechSkills = info && Array.isArray(info.skills) ? info.skills : undefined;
  window.__hrtechTokenOnServer = info && typeof info.figmaToken === 'boolean' ? info.figmaToken : undefined;
  window.__hrtechBridgeVersion = info && info.hrtechVersion || null;
  window.__hrtechLastHostStatus = current && current.hostStatus;
  window.__hrtechHostDone = !!window.__hrtechLastHostStatus;
  window.__hrtechDistribution = current && ((current.hostStatus && current.hostStatus.distribution) || info.distribution) || null;

  var bv = document.getElementById('b3-bridge-version');
  if (bv) {
    var versions = hrtechConnectionVersions();
    bv.textContent = versions || 'Не подключён';
    bv.className = 'bun-kv-value' + (versions ? '' : ' muted');
  }
  var logServers = document.getElementById('log-servers');
  if (logServers) {
    var count = conns.length;
    logServers.textContent = count === 1 ? '1 подключение' : (count + ' подключений');
  }

  hrtechResumePendingRepair(conns);
  hrtechMaintainRepair(conns);

  if (window.__hrtechOutcomeSocket && !conns.some(function(c) { return c.ws === window.__hrtechOutcomeSocket; })) {
    window.__hrtechOutcomeSocket = null;
    if (!window.__hrtechRepairBusy && !window.__hrtechPendingRepair) {
      var note = document.getElementById('bun-update-note');
      if (note) note.dataset.awaitingFile = 'true';
      setUpdateNote('Соединение прервано. Жду повторного подключения…', '');
    }
  }

  hrtechConnState();
  hrtechTokenState();
  hrtechSkills();
  hrtechRenderSelectedAgentHost();
  scheduleGraceExpiry();

  if (current && !current.hostStatus) hrtechRequestHost();
  hrtechAutoUpdate();
}
window.__hrtechConnectionChanged = hrtechSyncBridgeState;

// ── User Actions ─────────────────────────────────────────────────────────────
function hrtechCopyInstall() {
  var ok = hrtechCopyText(HRTECH_INSTALL_CMD);
  var note = document.getElementById('hrtech-install-note');
  if (note) {
    note.textContent = ok
      ? 'Команда скопирована. Откройте Терминал, нажмите ⌘V и Enter.'
      : 'Выполните в Терминале: ' + HRTECH_INSTALL_CMD;
    note.className = 'bun-note ' + (ok ? 'ok' : 'err');
  }
  if (ok) parent.postMessage({ pluginMessage: { type: 'HRTECH_INSTALL_HINT' } }, '*');
}

function hrtechReclaim() {
  window.__hrtechConnStartedAt = Date.now();
  setUpdateNote('Подключаю этот файл…', '');
  if (typeof window.__wsManualScan === 'function') window.__wsManualScan();
  hrtechSyncBridgeState();
}

function hrtechActivate() {
  window.__hrtechConnStartedAt = Date.now();
  if (typeof window.__wsManualScan === 'function') window.__wsManualScan();
  else if (typeof window.__wsScanAndConnect === 'function') window.__wsScanAndConnect(true);
  hrtechSyncBridgeState();
}

function hrtechTogglePause() {
  var paused = typeof window.__wsIsPaused === 'function' && window.__wsIsPaused();
  if (paused) hrtechActivate();
  else if (typeof window.__wsDisconnectAll === 'function') window.__wsDisconnectAll();
}

function hrtechToggleDiagnostics() {
  var drawer = document.getElementById('bun-drawer');
  if (drawer) drawer.hidden = !drawer.hidden;
}

function toggleErrorsOnly() {
  var btn = document.getElementById('errors-toggle');
  var entries = document.getElementById('log-entries');
  if (!btn || !entries) return;
  var on = !btn.classList.contains('active');
  btn.classList.toggle('active', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  entries.classList.toggle('errors-only', on);
}

function copyLogToClipboard() {
  var history = typeof window.__bunGetLogHistory === 'function' ? window.__bunGetLogHistory() : [];
  var lines = history.map(function(e) {
    var prefix = e.level === 'error' ? '[!] ' : e.level === 'warn' ? '[WARN] ' : '';
    return e.ts + '  ' + prefix + e.message;
  });
  var text = 'Булочка v' + HRTECH_UI_VERSION + ' — Журнал\n' +
    'Выгружено: ' + new Date().toISOString() + '\n' +
    '------------------------------------------------\n' +
    lines.join('\n') + '\n';
  if (hrtechCopyText(text) && typeof window.__bunLog === 'function') {
    window.__bunLog('Журнал скопирован (' + history.length + ' записей)', 'success');
  }
}

function hrtechCopyDiagnostics() {
  var conns = hrtechReadyConnections();
  var replaced = typeof window.__wsGetReplacedPorts === 'function' ? window.__wsGetReplacedPorts() : [];
  var report = [
    'Булочка ' + HRTECH_UI_VERSION + ' (мост ' + HRTECH_BRIDGE_VERSION + ')',
    'Соединения: ' + conns.length + (replaced.length ? ' (перехвачены порты: ' + replaced.join(', ') + ')' : ''),
    'Подключения: ' + (hrtechConnectionVersions() || 'нет'),
    'MCP-клиенты: ' + (hrtechRawAssistantNames().join(', ') || (conns.some(hrtechLegacyBridge) ? 'мост 4.27 не передаёт имя' : 'не подтверждены')),
    'Обмен с файлом: ' + (conns.some(hrtechFileExchangeConfirmed) ? 'подтверждён' : conns.some(function(c) { return c.legacyFileSent; }) ? 'Файл передан мосту. Запроса помощника ещё не было.' : 'ожидает подтверждения'),
    'Закрепление файла: ' + (window.__hrtechLocked ? ('да (' + (__pinSource || 'ui') + ')') : 'нет'),
    'Установка: ' + (conns.map(function(c) { return 'порт ' + c.port + ': ' + hrtechDistribution(c); }).join(', ') || 'нет данных'),
    'Поиск hrtech-figma-search: ' + (conns.map(function(c) { return 'порт ' + c.port + ': ' + (hrtechHasSearchSkill(c) === null ? 'не подтверждён' : hrtechHasSearchSkill(c) ? 'найден' : 'не подтверждён для клиента'); }).join(', ') || 'нет данных'),
    'Восстановление: ' + (conns.map(function(c) { return 'порт ' + c.port + ': ' + (c.repairOutcome || 'не запускалось'); }).join(', ') || 'нет соединения'),
    'Проверка: ' + (conns.map(function(c) { return 'порт ' + c.port + ': ' + (c.legacyFileVerified ? 'Связь с файлом подтверждена' : c.checkOutcome || 'не выполнена'); }).join(', ') || 'нет соединения'),
    'Пауза: ' + (typeof window.__wsIsPaused === 'function' && window.__wsIsPaused() ? 'да' : 'нет'),
    'Найдены помощники: ' + (hrtechFoundAgents().join(', ') || 'не определено'),
    'Умения HR Tech: ' + (window.__hrtechSkills ? window.__hrtechSkills.map(function(s) { return s.name; }).join(', ') : 'не получены')
  ];
  if (__lastRepairError) report.push('Последняя ошибка обновления: ' + __lastRepairError);
  var output = report.join('\n');
  var ok = hrtechCopyText(output);
  var feedback = document.getElementById('bun-diagnostics-feedback');
  if (feedback) {
    feedback.textContent = ok ? 'Отчёт скопирован.' : output;
    feedback.className = 'bun-note ' + (ok ? 'ok' : '');
    feedback.style.whiteSpace = 'pre-wrap';
  }
}

// ── Boot ─────────────────────────────────────────────────────────────────────
(function boot() {
  var verEl = document.getElementById('b6-settings-version');
  if (verEl) verEl.textContent = 'v' + HRTECH_UI_VERSION;
  hrtechNavigate('skills');
  hrtechRefreshContext();
  hrtechSyncBridgeState();
  sendResize();
  setInterval(hrtechRequestHost, 60000);
})();
