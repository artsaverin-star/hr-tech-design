// ============================================================================
// FIGMA WORKER RPC BRIDGE & COMPACT DIAGNOSTICS LOGGER
// ============================================================================
window.__figmaVariablesData = null;
window.__figmaVariablesReady = false;
window.__figmaComponentData = null;
window.__figmaComponentRequests = new Map();
window.__figmaPendingRequests = new Map();

var __rpcSeq = 0;
var __logHistory = [];

function bunEscHtml(str) {
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function bunLog(message, level) {
  level = level || 'info';
  var now = new Date();
  var ts = ('0' + now.getHours()).slice(-2) + ':' +
           ('0' + now.getMinutes()).slice(-2) + ':' +
           ('0' + now.getSeconds()).slice(-2);
  __logHistory.push({
    ts: now.toISOString().replace('T', ' ').replace(/\.\d+Z/, ''),
    level: level,
    message: message
  });
  if (__logHistory.length > 300) __logHistory.shift();

  var list = document.getElementById('log-entries');
  if (!list) return;
  var last = list.lastElementChild;
  if (last && last.dataset.logMsg === message && last.dataset.logLevel === level) {
    var count = (parseInt(last.dataset.logCount, 10) || 1) + 1;
    last.dataset.logCount = String(count);
    var tsEl = last.querySelector('.bun-log-ts');
    var countEl = last.querySelector('.bun-log-count');
    if (tsEl) tsEl.textContent = ts;
    if (countEl) countEl.textContent = '×' + count;
    return;
  }
  var row = document.createElement('div');
  row.className = 'bun-log-row ' + level;
  row.dataset.logMsg = message;
  row.dataset.logLevel = level;
  row.dataset.logCount = '1';
  row.innerHTML =
    '<span class="bun-log-ts">' + bunEscHtml(ts) + '</span>' +
    '<span class="bun-log-msg">' + bunEscHtml(message) + '</span>' +
    '<span class="bun-log-count"></span>';
  list.appendChild(row);
  list.scrollTop = list.scrollHeight;
  while (list.children.length > 100) list.removeChild(list.firstChild);
}
window.__bunLog = bunLog;
window.__bunGetLogHistory = function() { return __logHistory; };

function bunSummariseCommand(type, params) {
  if (type === 'RESIZE_UI' || type === 'HRTECH_UI_COMPACT_SET' || type === 'HRTECH_INSTALL_HINT') return null;
  if (type === 'EXECUTE_CODE' && params && params.code) {
    var first = String(params.code).trim().split('\n')[0].trim();
    if (first.indexOf('//') === 0) {
      var note = first.replace(/^\/\/\s*/, '');
      return note.length > 64 ? note.slice(0, 63) + '…' : note;
    }
    return 'Выполнение скрипта в Figma';
  }
  if (type === 'GET_FILE_INFO') return null;
  return type.replace(/_/g, ' ').toLowerCase().replace(/^\w/, function(c) { return c.toUpperCase(); });
}

window.sendPluginCommand = function(type, params, timeoutMs) {
  timeoutMs = timeoutMs || 15000;
  var summary = bunSummariseCommand(type, params);
  if (summary) bunLog(summary, 'info');

  return new Promise(function(resolve, reject) {
    var requestId = type.toLowerCase() + '_' + (++__rpcSeq) + '_' + Date.now();
    var timeoutId = setTimeout(function() {
      if (window.__figmaPendingRequests.has(requestId)) {
        window.__figmaPendingRequests.delete(requestId);
        if (summary) bunLog('Таймаут: ' + summary, 'error');
        reject(new Error(type + ' request timed out after ' + timeoutMs + 'ms'));
      }
    }, timeoutMs);

    window.__figmaPendingRequests.set(requestId, {
      resolve: resolve,
      reject: reject,
      type: type,
      timeoutId: timeoutId,
      summary: summary
    });

    var message = { type: type, requestId: requestId };
    if (params) {
      for (var key in params) {
        if (Object.prototype.hasOwnProperty.call(params, key)) message[key] = params[key];
      }
    }
    parent.postMessage({ pluginMessage: message }, '*');
  });
};

function bunSafeCommand(type, params, timeoutMs) {
  return window.sendPluginCommand(type, params || {}, timeoutMs)
    .catch(function(err) { return { success: false, error: err.message || String(err) }; });
}

function bunDecodeImageFill(nodeIds, imageData, scaleMode) {
  var binaryStr = atob(imageData);
  var bytes = new Uint8Array(binaryStr.length);
  for (var i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);
  return bunSafeCommand('SET_IMAGE_FILL', {
    nodeIds: Array.isArray(nodeIds) ? nodeIds : [nodeIds],
    imageBytes: Array.from(bytes),
    scaleMode: scaleMode || 'FILL'
  }, 60000);
}

function bunRequestComponentData(nodeId) {
  return new Promise(function(resolve, reject) {
    var requestId = 'component_' + (++__rpcSeq) + '_' + Date.now();
    window.__figmaComponentRequests.set(requestId, { resolve: resolve, reject: reject });
    parent.postMessage({ pluginMessage: { type: 'GET_COMPONENT', requestId: requestId, nodeId: nodeId } }, '*');
    setTimeout(function() {
      if (window.__figmaComponentRequests.has(requestId)) {
        window.__figmaComponentRequests.delete(requestId);
        reject(new Error('Component request timed out'));
      }
    }, 10000);
  });
}

// Back-compat convenience helper for direct EXECUTE_CODE calls and tests
window.executeCode = function(code, timeout) {
  return bunSafeCommand('EXECUTE_CODE', { code: code, timeout: timeout || 5000 }, (timeout || 5000) + 2000);
};

// Complete Figma worker RPC dispatch table (shared with ws-client.js)
window.__bunMethodMap = {
  EXECUTE_CODE: function(p) { return bunSafeCommand('EXECUTE_CODE', { code: p.code, timeout: p.timeout || 5000 }, (p.timeout || 5000) + 2000); },
  UPDATE_VARIABLE: function(p) { return bunSafeCommand('UPDATE_VARIABLE', { variableId: p.variableId, modeId: p.modeId, value: p.value }); },
  CREATE_VARIABLE: function(p) { return bunSafeCommand('CREATE_VARIABLE', p); },
  DELETE_VARIABLE: function(p) { return bunSafeCommand('DELETE_VARIABLE', { variableId: p.variableId }); },
  DELETE_VARIABLE_COLLECTION: function(p) { return bunSafeCommand('DELETE_VARIABLE_COLLECTION', { collectionId: p.collectionId }); },
  RENAME_VARIABLE: function(p) { return bunSafeCommand('RENAME_VARIABLE', { variableId: p.variableId, newName: p.newName }); },
  SET_VARIABLE_DESCRIPTION: function(p) { return bunSafeCommand('SET_VARIABLE_DESCRIPTION', { variableId: p.variableId, description: p.description }); },
  ADD_MODE: function(p) { return bunSafeCommand('ADD_MODE', { collectionId: p.collectionId, modeName: p.modeName }); },
  RENAME_MODE: function(p) { return bunSafeCommand('RENAME_MODE', { collectionId: p.collectionId, modeId: p.modeId, newName: p.newName }); },
  REFRESH_VARIABLES: function() { return bunSafeCommand('REFRESH_VARIABLES', {}, 300000); },
  CREATE_VARIABLE_COLLECTION: function(p) { return bunSafeCommand('CREATE_VARIABLE_COLLECTION', p); },
  GET_LOCAL_COMPONENTS: function() { return bunSafeCommand('GET_LOCAL_COMPONENTS', {}, 300000); },
  INSTANTIATE_COMPONENT: function(p) { return bunSafeCommand('INSTANTIATE_COMPONENT', p); },
  GET_COMPONENT: function(p) { return bunRequestComponentData(p.nodeId); },
  SET_NODE_DESCRIPTION: function(p) { return bunSafeCommand('SET_NODE_DESCRIPTION', p); },
  ADD_COMPONENT_PROPERTY: function(p) { return bunSafeCommand('ADD_COMPONENT_PROPERTY', p); },
  EDIT_COMPONENT_PROPERTY: function(p) { return bunSafeCommand('EDIT_COMPONENT_PROPERTY', p); },
  DELETE_COMPONENT_PROPERTY: function(p) { return bunSafeCommand('DELETE_COMPONENT_PROPERTY', p); },
  RESIZE_NODE: function(p) { return bunSafeCommand('RESIZE_NODE', { nodeId: p.nodeId, width: p.width, height: p.height, withConstraints: p.withConstraints !== false }); },
  MOVE_NODE: function(p) { return bunSafeCommand('MOVE_NODE', p); },
  SET_NODE_FILLS: function(p) { return bunSafeCommand('SET_NODE_FILLS', p); },
  SET_NODE_STROKES: function(p) { return bunSafeCommand('SET_NODE_STROKES', p); },
  SET_NODE_OPACITY: function(p) { return bunSafeCommand('SET_NODE_OPACITY', p); },
  SET_NODE_CORNER_RADIUS: function(p) { return bunSafeCommand('SET_NODE_CORNER_RADIUS', p); },
  CLONE_NODE: function(p) { return bunSafeCommand('CLONE_NODE', p); },
  DELETE_NODE: function(p) { return bunSafeCommand('DELETE_NODE', p); },
  RENAME_NODE: function(p) { return bunSafeCommand('RENAME_NODE', p); },
  SET_TEXT_CONTENT: function(p) { return bunSafeCommand('SET_TEXT_CONTENT', p); },
  CREATE_CHILD_NODE: function(p) { return bunSafeCommand('CREATE_CHILD_NODE', { parentId: p.parentId, nodeType: p.nodeType, properties: p.properties || {} }); },
  CAPTURE_SCREENSHOT: function(p) { return bunSafeCommand('CAPTURE_SCREENSHOT', p, 30000); },
  SET_IMAGE_FILL: function(p) { return bunDecodeImageFill(p.nodeIds || p.nodeId, p.imageData, p.scaleMode); },
  SET_INSTANCE_PROPERTIES: function(p) { return bunSafeCommand('SET_INSTANCE_PROPERTIES', p); },
  LINT_DESIGN: function(p) { return bunSafeCommand('LINT_DESIGN', p, 120000); },
  AUDIT_COMPONENT_ACCESSIBILITY: function(p) { return bunSafeCommand('AUDIT_COMPONENT_ACCESSIBILITY', p, 120000); },
  GET_VARIABLES_DATA: function() {
    if (window.__figmaVariablesReady && window.__figmaVariablesData) {
      return Promise.resolve(window.__figmaVariablesData);
    }
    return Promise.reject(new Error('Variables data not ready. Make sure the Desktop Bridge plugin has loaded.'));
  },
  GET_FILE_INFO: function() { return window.sendPluginCommand('GET_FILE_INFO', {}); },
  CREATE_STICKY: function(p) { return window.sendPluginCommand('CREATE_STICKY', p); },
  CREATE_STICKIES: function(p) { return window.sendPluginCommand('CREATE_STICKIES', p, 30000); },
  CREATE_CONNECTOR: function(p) { return window.sendPluginCommand('CREATE_CONNECTOR', p); },
  CREATE_SHAPE_WITH_TEXT: function(p) { return window.sendPluginCommand('CREATE_SHAPE_WITH_TEXT', p); },
  CREATE_SECTION: function(p) { return window.sendPluginCommand('CREATE_SECTION', p); },
  CREATE_TABLE: function(p) { return window.sendPluginCommand('CREATE_TABLE', p, 30000); },
  CREATE_CODE_BLOCK: function(p) { return window.sendPluginCommand('CREATE_CODE_BLOCK', p); },
  GET_BOARD_CONTENTS: function(p) { return window.sendPluginCommand('GET_BOARD_CONTENTS', p, 30000); },
  GET_CONNECTIONS: function(p) { return window.sendPluginCommand('GET_CONNECTIONS', p || {}, 15000); },
  LIST_SLIDES: function(p) { return window.sendPluginCommand('LIST_SLIDES', p || {}, 10000); },
  GET_SLIDE_CONTENT: function(p) { return window.sendPluginCommand('GET_SLIDE_CONTENT', p, 10000); },
  CREATE_SLIDE: function(p) { return window.sendPluginCommand('CREATE_SLIDE', p || {}, 10000); },
  DELETE_SLIDE: function(p) { return window.sendPluginCommand('DELETE_SLIDE', p, 5000); },
  DUPLICATE_SLIDE: function(p) { return window.sendPluginCommand('DUPLICATE_SLIDE', p, 5000); },
  GET_SLIDE_GRID: function(p) { return window.sendPluginCommand('GET_SLIDE_GRID', p || {}, 10000); },
  REORDER_SLIDES: function(p) { return window.sendPluginCommand('REORDER_SLIDES', p, 15000); },
  SET_SLIDE_TRANSITION: function(p) { return window.sendPluginCommand('SET_SLIDE_TRANSITION', p, 5000); },
  GET_SLIDE_TRANSITION: function(p) { return window.sendPluginCommand('GET_SLIDE_TRANSITION', p, 5000); },
  SET_SLIDES_VIEW_MODE: function(p) { return window.sendPluginCommand('SET_SLIDES_VIEW_MODE', p, 5000); },
  GET_FOCUSED_SLIDE: function(p) { return window.sendPluginCommand('GET_FOCUSED_SLIDE', p || {}, 5000); },
  FOCUS_SLIDE: function(p) { return window.sendPluginCommand('FOCUS_SLIDE', p, 5000); },
  SKIP_SLIDE: function(p) { return window.sendPluginCommand('SKIP_SLIDE', p, 5000); },
  GET_TEXT_STYLES: function(p) { return window.sendPluginCommand('GET_TEXT_STYLES', p, 5000); },
  SET_SLIDE_BACKGROUND: function(p) { return window.sendPluginCommand('SET_SLIDE_BACKGROUND', p, 5000); },
  ADD_TEXT_TO_SLIDE: function(p) { return window.sendPluginCommand('ADD_TEXT_TO_SLIDE', p, 10000); },
  ADD_SHAPE_TO_SLIDE: function(p) { return window.sendPluginCommand('ADD_SHAPE_TO_SLIDE', p, 5000); },
  CLEAR_CONSOLE: function() { return Promise.resolve({ cleared: true }); },
  RELOAD_UI: function() { return window.sendPluginCommand('RELOAD_UI', {}); },
  ANALYZE_COMPONENT_SET: function(p) { return bunSafeCommand('ANALYZE_COMPONENT_SET', { nodeId: p.nodeId }, 30000); },
  DEEP_GET_COMPONENT: function(p) { return bunSafeCommand('DEEP_GET_COMPONENT', { nodeId: p.nodeId, depth: p.depth || 10 }, 30000); },
  GET_ANNOTATIONS: function(p) { return window.sendPluginCommand('GET_ANNOTATIONS', p, 10000); },
  SET_ANNOTATIONS: function(p) { return window.sendPluginCommand('SET_ANNOTATIONS', p, 10000); },
  GET_ANNOTATION_CATEGORIES: function(p) { return window.sendPluginCommand('GET_ANNOTATION_CATEGORIES', p || {}, 5000); }
};

var RESULT_DATA_KEYS = {
  EXECUTE_CODE_RESULT: 'result',
  UPDATE_VARIABLE_RESULT: 'variable',
  CREATE_VARIABLE_RESULT: 'variable',
  CREATE_VARIABLE_COLLECTION_RESULT: 'collection',
  DELETE_VARIABLE_RESULT: 'deleted',
  DELETE_VARIABLE_COLLECTION_RESULT: 'deleted',
  REFRESH_VARIABLES_RESULT: null,
  RENAME_VARIABLE_RESULT: 'variable',
  SET_VARIABLE_DESCRIPTION_RESULT: 'variable',
  ADD_MODE_RESULT: 'collection',
  RENAME_MODE_RESULT: 'collection',
  GET_LOCAL_COMPONENTS_RESULT: null,
  INSTANTIATE_COMPONENT_RESULT: 'instance',
  SET_NODE_DESCRIPTION_RESULT: 'node',
  ADD_COMPONENT_PROPERTY_RESULT: 'propertyName',
  EDIT_COMPONENT_PROPERTY_RESULT: 'propertyName',
  DELETE_COMPONENT_PROPERTY_RESULT: null,
  RESIZE_NODE_RESULT: 'node',
  MOVE_NODE_RESULT: 'node',
  SET_NODE_FILLS_RESULT: 'node',
  SET_NODE_STROKES_RESULT: 'node',
  SET_NODE_OPACITY_RESULT: 'node',
  SET_NODE_CORNER_RADIUS_RESULT: 'node',
  CLONE_NODE_RESULT: 'node',
  DELETE_NODE_RESULT: 'deleted',
  RENAME_NODE_RESULT: 'node',
  SET_TEXT_CONTENT_RESULT: 'node',
  CREATE_CHILD_NODE_RESULT: 'node',
  CAPTURE_SCREENSHOT_RESULT: 'image',
  SET_IMAGE_FILL_RESULT: 'imageHash',
  SET_INSTANCE_PROPERTIES_RESULT: 'instance',
  LINT_DESIGN_RESULT: 'data',
  AUDIT_COMPONENT_ACCESSIBILITY_RESULT: 'data',
  CREATE_STICKY_RESULT: 'data',
  CREATE_STICKIES_RESULT: 'data',
  CREATE_CONNECTOR_RESULT: 'data',
  CREATE_SHAPE_WITH_TEXT_RESULT: 'data',
  CREATE_SECTION_RESULT: 'data',
  CREATE_TABLE_RESULT: 'data',
  CREATE_CODE_BLOCK_RESULT: 'data',
  GET_BOARD_CONTENTS_RESULT: 'data',
  GET_CONNECTIONS_RESULT: 'data',
  LIST_SLIDES_RESULT: 'data',
  GET_SLIDE_CONTENT_RESULT: 'data',
  CREATE_SLIDE_RESULT: 'data',
  DELETE_SLIDE_RESULT: 'data',
  DUPLICATE_SLIDE_RESULT: 'data',
  GET_SLIDE_GRID_RESULT: 'data',
  REORDER_SLIDES_RESULT: 'data',
  SET_SLIDE_TRANSITION_RESULT: 'data',
  GET_SLIDE_TRANSITION_RESULT: 'data',
  SET_SLIDES_VIEW_MODE_RESULT: 'data',
  GET_FOCUSED_SLIDE_RESULT: 'data',
  FOCUS_SLIDE_RESULT: 'data',
  SKIP_SLIDE_RESULT: 'data',
  GET_TEXT_STYLES_RESULT: 'data',
  SET_SLIDE_BACKGROUND_RESULT: 'data',
  ADD_TEXT_TO_SLIDE_RESULT: 'data',
  ADD_SHAPE_TO_SLIDE_RESULT: 'data',
  GET_FILE_INFO_RESULT: 'fileInfo',
  RELOAD_UI_RESULT: null,
  ANALYZE_COMPONENT_SET_RESULT: null,
  DEEP_GET_COMPONENT_RESULT: null,
  GET_ANNOTATIONS_RESULT: null,
  SET_ANNOTATIONS_RESULT: null,
  GET_ANNOTATION_CATEGORIES_RESULT: null
};

window.addEventListener('message', function(event) {
  var msg = event.data && event.data.pluginMessage;
  if (!msg || !msg.type) return;

  if (Object.prototype.hasOwnProperty.call(RESULT_DATA_KEYS, msg.type)) {
    var request = window.__figmaPendingRequests.get(msg.requestId);
    if (request) {
      if (request.timeoutId) clearTimeout(request.timeoutId);
      window.__figmaPendingRequests.delete(msg.requestId);
      if (msg.success) {
        var dataKey = RESULT_DATA_KEYS[msg.type];
        var result = { success: true };
        if (dataKey && msg[dataKey] !== undefined) result[dataKey] = msg[dataKey];
        if (msg.data !== undefined) result.data = msg.data;
        if (msg.oldName !== undefined) result.oldName = msg.oldName;
        if (msg.instance !== undefined) result.instance = msg.instance;
        if (msg.warnings !== undefined) result.warnings = msg.warnings;
        request.resolve(result);
      } else {
        if (request.summary) bunLog('Ошибка: ' + request.summary, 'error');
        request.resolve({ success: false, error: msg.error || 'Unknown error' });
      }
    }
    if (msg.type === 'GET_FILE_INFO_RESULT' && msg.success && typeof window.__hrtechSetContext === 'function') {
      window.__hrtechSetContext(msg.fileInfo || {});
    }
    return;
  }

  switch (msg.type) {
    case 'VARIABLES_DATA':
      window.__figmaVariablesData = msg.data;
      window.__figmaVariablesReady = true;
      bunLog('Переменные загружены: ' + ((msg.data && msg.data.variables && msg.data.variables.length) || 0), 'success');
      if (window.__wsForwardVariables) window.__wsForwardVariables(msg.data);
      break;
    case 'COMPONENT_DATA':
      window.__figmaComponentData = msg.data;
      var compReq = window.__figmaComponentRequests.get(msg.requestId);
      if (compReq) { compReq.resolve(msg.data); window.__figmaComponentRequests.delete(msg.requestId); }
      break;
    case 'COMPONENT_ERROR':
      var compErr = window.__figmaComponentRequests.get(msg.requestId);
      if (compErr) { compErr.reject(new Error(msg.error)); window.__figmaComponentRequests.delete(msg.requestId); }
      break;
    case 'ERROR':
      window.__figmaVariablesReady = false;
      bunLog('Ошибка плагина: ' + (msg.error || 'неизвестно'), 'error');
      break;
    case 'DOCUMENT_CHANGE':
      if (window.__wsForwardDocumentChange) window.__wsForwardDocumentChange(msg.data);
      break;
    case 'METADATA_CHANGE':
      if (window.__wsForwardMetadataChange) window.__wsForwardMetadataChange(msg.data);
      break;
    case 'CONSOLE_CAPTURE':
      if (window.__wsForwardConsoleCapture) window.__wsForwardConsoleCapture(msg);
      break;
    case 'SELECTION_CHANGE':
      if (window.__wsForwardSelectionChange) window.__wsForwardSelectionChange(msg.data);
      break;
    case 'PAGE_CHANGE':
      if (window.__wsForwardPageChange) window.__wsForwardPageChange(msg.data);
      if (typeof window.__hrtechOnPageChange === 'function') window.__hrtechOnPageChange(msg.data);
      break;
    case 'HRTECH_ACTIVITY':
      if (typeof window.__hrtechOnActivity === 'function') window.__hrtechOnActivity(msg);
      break;
  }
});
