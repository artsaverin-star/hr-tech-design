// ============================================================================
// WEBSOCKET BRIDGE CLIENT — scans localhost ports 9223-9232 for MCP bridges.
// ============================================================================
(function() {
  // Port range for multi-instance support (matches server's port-discovery.ts)
  var WS_PORT_RANGE_START = 9223;
  var WS_PORT_RANGE_END = 9232;
  var WS_HANDSHAKE_TIMEOUT_MS = 5000;
  var WS_FILE_REGISTRATION_TIMEOUT_MS = 20000;
  var MAX_INITIAL_SCANS = 3;
  var BACKGROUND_RESCAN_MS = 4000;

  var activeConnections = [];
  var pendingConnections = {};
  var reconnectTimers = {};
  var reconnectAttempts = {};
  var replacedPorts = {};
  var isScanning = false;
  var scanGeneration = 0;
  var initialScanAttempts = 0;
  var userPaused = false;

  function logLine(msg, level) {
    if (typeof window.__bunLog === 'function') window.__bunLog(msg, level);
  }

  function isPortConnected(port) {
    for (var i = 0; i < activeConnections.length; i++) {
      if (activeConnections[i].port === port && activeConnections[i].ws.readyState === 1) return true;
    }
    return false;
  }

  function notifyChange() {
    if (typeof window.__hrtechConnectionChanged === 'function') window.__hrtechConnectionChanged();
  }

  function removeConnection(socket) {
    activeConnections = activeConnections.filter(function(c) {
      if (c.ws !== socket) return true;
      clearTimeout(c.handshakeTimer);
      if (c.checkRequest) { clearTimeout(c.checkRequest.timer); c.checkRequest = null; }
      c.connectionCheck = null;
      c.checkOutcome = null;
      c.repairOutcome = null;
      return false;
    });
    notifyChange();
  }

  function refreshFile(connWs, initialRegistration) {
    var conn = activeConnections.find(function(c) { return c.ws === connWs; });
    if (!conn || connWs.readyState !== 1) return Promise.resolve(false);
    return window.sendPluginCommand('GET_FILE_INFO', {})
      .then(function(info) {
        if (connWs.readyState === 1 && activeConnections.indexOf(conn) !== -1) {
          var file = info && (info.fileInfo || info);
          if (!info || info.success === false || !file.fileKey) throw new Error('File identity is unavailable');
          if (conn.fileKey && conn.fileKey !== file.fileKey) throw new Error('File identity changed during registration');
          conn.fileKey = file.fileKey;
          connWs.send(JSON.stringify({ type: 'FILE_INFO', data: file }));
          if (window.__hrtechLocked) {
            try { connWs.send(JSON.stringify({ type: 'PIN_FILE' })); } catch (e) {}
          }
          try { connWs.send(JSON.stringify({ type: 'HRTECH_HOST_STATUS_REQUEST' })); } catch (e) {}
          if (window.__hrtechPendingRepair) notifyChange();
          return true;
        }
        return false;
      })
      .catch(function() {
        if (initialRegistration && activeConnections.indexOf(conn) !== -1) conn.close('File identification failed');
        return false;
      });
  }
  window.__wsRefreshFile = refreshFile;

  function initializeConnection(connWs) {
    if (window.__figmaVariablesReady && window.__figmaVariablesData) {
      try {
        connWs.send(JSON.stringify({ type: 'VARIABLES_DATA', data: window.__figmaVariablesData }));
      } catch (e) {}
    }
    return refreshFile(connWs, true);
  }

  function attachWsHandlers(activeWs, port) {
    var closed = false;
    activeWs.onmessage = function(event) {
      try {
        var source = activeConnections.find(function(c) { return c.ws === activeWs; });
        if (!source || activeWs.readyState !== 1) return;
        var message = JSON.parse(event.data);

        if (message.type === 'SERVER_HELLO' && message.data) {
          source.serverInfo = message.data;
          clearTimeout(source.handshakeTimer);
          source.handshakeTimer = null;
          logLine('Мост v' + (message.data.hrtechVersion || '?') + ' на порту ' + port, 'success');
          if (message.data.fileRegistrationAck && !source.fileRegistered) {
            source.handshakeTimer = setTimeout(function() {
              if (userPaused || source.fileRegistered || activeConnections.indexOf(source) === -1) return;
              source.close('File registration timeout');
            }, WS_FILE_REGISTRATION_TIMEOUT_MS);
          }
          notifyChange();
          return;
        }

        if (message.type === 'FILE_REGISTERED' && message.data && source.serverInfo) {
          if (!message.data.fileKey || (source.fileKey && source.fileKey !== message.data.fileKey)) {
            source.close('File registration mismatch');
            return;
          }
          source.fileKey = message.data.fileKey;
          source.fileRegistered = true;
          clearTimeout(source.handshakeTimer);
          source.handshakeTimer = null;
          reconnectAttempts[port] = 0;
          delete replacedPorts[port];
          notifyChange();
          return;
        }

        if (message.type === 'FIGMA_TOKEN_ACK' && message.data) {
          if (source.serverInfo) {
            if (message.data.cleared) source.serverInfo.figmaToken = false;
            else if (message.data.ok) source.serverInfo.figmaToken = true;
          }
          notifyChange();
          if (typeof window.__hrtechTokenAck === 'function') window.__hrtechTokenAck(message.data);
          return;
        }

        if (message.type === 'HRTECH_REPAIR_RESULT') {
          if (typeof window.__hrtechRepairResult === 'function') {
            window.__hrtechRepairResult(message.data || {}, activeWs);
          }
          return;
        }

        if (message.type === 'HRTECH_CONNECTION_CHECK_RESULT' && message.data) {
          if (typeof window.__hrtechConnectionCheckResult === 'function') {
            window.__hrtechConnectionCheckResult(message.data, activeWs);
          }
          return;
        }

        if (message.type === 'HRTECH_MCP_STATUS' && message.data && source.serverInfo) {
          source.serverInfo.mcpClient = message.data.client || null;
          notifyChange();
          return;
        }

        if (message.type === 'HRTECH_HOST_STATUS' && message.data) {
          source.hostStatus = message.data;
          if (typeof window.__hrtechHostStatus === 'function') window.__hrtechHostStatus(message.data, activeWs);
          return;
        }

        if (message.type === 'PIN_STATE' && message.data) {
          source.pinState = message.data;
          if (typeof window.__hrtechSetLock === 'function') {
            window.__hrtechSetLock(!!message.data.pinned, message.data.pinSource || null);
          }
          return;
        }

        if (!message.id || !message.method) return;

        var methods = window.__bunMethodMap || {
          EXECUTE_CODE: function(p) {
            return typeof window.executeCode === 'function'
              ? window.executeCode(p.code, p.timeout)
              : window.sendPluginCommand('EXECUTE_CODE', { code: p.code, timeout: p.timeout || 5000 });
          },
          GET_FILE_INFO: function() { return window.sendPluginCommand('GET_FILE_INFO', {}); }
        };
        var handler = methods[message.method];
        if (!handler) {
          activeWs.send(JSON.stringify({ id: message.id, error: 'Unknown method: ' + message.method }));
          return;
        }

        Promise.resolve(handler(message.params || {}))
          .then(function(result) {
            if (activeWs.readyState === 1) {
              activeWs.send(JSON.stringify({ id: message.id, result: result }));
              // Legacy 4.27 bridge verification on completed assistant RPCs
              var info = source.serverInfo;
              if (info && info.hrtechVersion === '4.27' && !info.bridgeProtocol &&
                  message.method === 'GET_FILE_INFO' && result && result.success !== false &&
                  source.fileKey && result.fileInfo && result.fileInfo.fileKey === source.fileKey) {
                source.legacyFileVerified = true;
                notifyChange();
              }
              if (info && info.hrtechVersion === '4.27' && !info.bridgeProtocol &&
                  message.method === 'EXECUTE_CODE' && result && result.success === true && source.fileKey) {
                var expectedFile = source.fileKey;
                window.sendPluginCommand('GET_FILE_INFO', {}).then(function(current) {
                  if (activeWs.readyState !== 1 || activeConnections.indexOf(source) === -1 || source.fileKey !== expectedFile) return;
                  if (!current || current.success === false || !current.fileInfo || current.fileInfo.fileKey !== expectedFile) return;
                  source.legacyFileVerified = true;
                  notifyChange();
                }).catch(function() {});
              }
            }
          })
          .catch(function(err) {
            if (activeWs.readyState === 1) {
              activeWs.send(JSON.stringify({ id: message.id, error: err.message || String(err) }));
            }
          });
      } catch (e) {
        logLine('Ошибка разбора сообщения WS:' + port, 'error');
      }
    };

    function handleClose(event) {
      if (closed) return;
      closed = true;
      var wasReplaced = (event.code === 1000 && (
        event.reason === 'Replaced by new connection' ||
        event.reason === 'Replaced by same file reconnection'
      ));
      var wasManualPause = (event.code === 1000 && event.reason === 'Manual disconnect');
      var wasManualRetry = (event.code === 1000 && event.reason === 'Manual reconnect');
      if (wasReplaced && !isPortConnected(port)) replacedPorts[port] = true;
      removeConnection(activeWs);

      if (wasReplaced) logLine('Порт ' + port + ' перехвачен другой вкладкой', 'warn');
      else if (!wasManualPause && !wasManualRetry) logLine('Отключён порт ' + port, 'warn');

      if (wasReplaced || wasManualPause || wasManualRetry) return;
      if (userPaused || replacedPorts[port] || typeof port !== 'number' || isPortConnected(port) || pendingConnections[port]) return;

      reconnectAttempts[port] = (reconnectAttempts[port] || 0) + 1;
      if (reconnectAttempts[port] <= 5 && !reconnectTimers[port]) {
        var delay = Math.min(1000 * reconnectAttempts[port], 5000);
        var timer = setTimeout(function() { wsReconnectPort(port, timer); }, delay);
        reconnectTimers[port] = timer;
      }
    }

    activeWs.onclose = handleClose;
    activeWs.onerror = function() {};
    return function(reason) {
      handleClose({ code: 1000, reason: reason });
      try { activeWs.close(1000, reason); } catch (e) {}
    };
  }

  function connectPort(port, onSettled) {
    var settled = false;
    function finish() {
      if (settled) return;
      settled = true;
      if (onSettled) onSettled();
    }
    if (userPaused || replacedPorts[port] || reconnectTimers[port] || isPortConnected(port) || pendingConnections[port]) {
      finish();
      return;
    }
    var socket;
    var timeout;
    function releasePending() {
      clearTimeout(timeout);
      if (pendingConnections[port] === socket) delete pendingConnections[port];
      finish();
    }
    try {
      socket = new WebSocket('ws://localhost:' + port);
      pendingConnections[port] = socket;
      timeout = setTimeout(function() {
        releasePending();
        try { socket.close(); } catch (e) {}
      }, 3000);
      socket.onopen = function() {
        if (userPaused || pendingConnections[port] !== socket || isPortConnected(port)) {
          releasePending();
          try { socket.close(1000, 'Manual disconnect'); } catch (e) {}
          return;
        }
        var conn = { port: port, ws: socket };
        activeConnections.push(conn);
        clearTimeout(reconnectTimers[port]);
        delete reconnectTimers[port];
        conn.close = attachWsHandlers(socket, port);
        conn.handshakeTimer = setTimeout(function() {
          if (userPaused || replacedPorts[port] || conn.serverInfo || activeConnections.indexOf(conn) === -1) return;
          conn.close('Server handshake timeout');
        }, WS_HANDSHAKE_TIMEOUT_MS);
        notifyChange();
        initializeConnection(socket);
        releasePending();
      };
      socket.onerror = function() {
        releasePending();
        try { socket.close(); } catch (e) {}
      };
      socket.onclose = releasePending;
    } catch (e) {
      releasePending();
    }
  }

  function wsScanAndConnect(retryReplacedPorts) {
    if (userPaused) return;
    if (retryReplacedPorts === true) replacedPorts = {};
    if (isScanning) return;
    isScanning = true;
    var generation = ++scanGeneration;

    var portsToTry = [];
    for (var p = WS_PORT_RANGE_START; p <= WS_PORT_RANGE_END; p++) {
      if (!isPortConnected(p) && !pendingConnections[p] && !replacedPorts[p] && !reconnectTimers[p]) {
        portsToTry.push(p);
      }
    }
    if (portsToTry.length === 0) { isScanning = false; return; }

    var pending = portsToTry.length;
    function portSettled() {
      pending--;
      if (pending > 0) return;
      if (generation !== scanGeneration) return;
      isScanning = false;
      if (!userPaused && activeConnections.length === 0 && initialScanAttempts < MAX_INITIAL_SCANS) {
        initialScanAttempts++;
        if (initialScanAttempts < MAX_INITIAL_SCANS) {
          setTimeout(wsScanAndConnect, 3000 * initialScanAttempts);
        }
      }
    }
    portsToTry.forEach(function(port) { connectPort(port, portSettled); });
  }

  function wsReconnectPort(port, timer) {
    if (reconnectTimers[port] !== timer) return;
    delete reconnectTimers[port];
    connectPort(port);
  }

  function broadcastToAll(message) {
    var json = JSON.stringify(message);
    activeConnections.forEach(function(conn) {
      if (conn.ws.readyState === 1) {
        try { conn.ws.send(json); } catch (e) {}
      }
    });
  }

  window.__wsForwardVariables = function(data) { broadcastToAll({ type: 'VARIABLES_DATA', data: data }); };
  window.__wsForwardDocumentChange = function(data) { broadcastToAll({ type: 'DOCUMENT_CHANGE', data: data }); };
  window.__wsForwardMetadataChange = function(data) { broadcastToAll({ type: 'METADATA_CHANGE', data: data }); };
  window.__wsForwardConsoleCapture = function(data) { broadcastToAll({ type: 'CONSOLE_CAPTURE', data: data }); };
  window.__wsForwardSelectionChange = function(data) { broadcastToAll({ type: 'SELECTION_CHANGE', data: data }); };
  window.__wsForwardPageChange = function(data) { broadcastToAll({ type: 'PAGE_CHANGE', data: data }); };

  window.__wsGetActiveConnections = function() { return activeConnections; };
  window.__wsGetReplacedPorts = function() { return Object.keys(replacedPorts).map(Number); };

  window.__wsDisconnectAll = function() {
    userPaused = true;
    scanGeneration++;
    Object.keys(reconnectTimers).forEach(function(port) { clearTimeout(reconnectTimers[port]); });
    reconnectTimers = {};
    Object.keys(pendingConnections).forEach(function(port) {
      try { pendingConnections[port].close(1000, 'Manual disconnect'); } catch (e) {}
    });
    pendingConnections = {};
    var toClose = activeConnections.slice();
    for (var i = 0; i < toClose.length; i++) {
      clearTimeout(toClose[i].handshakeTimer);
      try { toClose[i].ws.close(1000, 'Manual disconnect'); } catch (e) {}
    }
    activeConnections = [];
    isScanning = false;
    initialScanAttempts = 0;
    reconnectAttempts = {};
    userPaused = true;
    logLine('Подключение поставлено на паузу', 'warn');
    notifyChange();
  };

  window.__wsScanAndConnect = wsScanAndConnect;

  window.__wsManualScan = function() {
    userPaused = false;
    window.__hrtechConnStartedAt = Date.now();
    scanGeneration++;
    isScanning = false;
    initialScanAttempts = 0;
    replacedPorts = {};
    Object.keys(reconnectTimers).forEach(function(port) { clearTimeout(reconnectTimers[port]); });
    reconnectTimers = {};
    reconnectAttempts = {};
    var pendingToClose = pendingConnections;
    pendingConnections = {};
    Object.keys(pendingToClose).forEach(function(port) {
      try { pendingToClose[port].close(1000, 'Manual reconnect'); } catch (e) {}
    });
    activeConnections.slice().forEach(function(conn) {
      if (typeof conn.port === 'number' && !conn.fileRegistered && conn.close) conn.close('Manual reconnect');
    });
    wsScanAndConnect();
    notifyChange();
  };

  window.__wsIsPaused = function() { return userPaused; };
  window.__wsIsScanning = function() { return isScanning; };

  setInterval(function() {
    if (userPaused || isScanning) return;
    wsScanAndConnect();
  }, BACKGROUND_RESCAN_MS);

  wsScanAndConnect();
})();
