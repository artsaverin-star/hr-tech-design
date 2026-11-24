// ============================================================================
// KEEP-ALIVE — prevents Electron/Chromium throttling when Figma tab is in background
// ============================================================================
(function keepAlive() {
  var audio = null;
  function silentWavUrl() {
    var sr = 8000, n = sr;
    var buf = new ArrayBuffer(44 + n), v = new DataView(buf);
    function writeStr(o, t) { for (var i = 0; i < t.length; i++) v.setUint8(o + i, t.charCodeAt(i)); }
    writeStr(0, 'RIFF'); v.setUint32(4, 36 + n, true); writeStr(8, 'WAVE'); writeStr(12, 'fmt ');
    v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, sr, true); v.setUint32(28, sr, true); v.setUint16(32, 1, true); v.setUint16(34, 8, true);
    writeStr(36, 'data'); v.setUint32(40, n, true);
    for (var i = 0; i < n; i++) v.setUint8(44 + i, 128);
    return URL.createObjectURL(new Blob([buf], { type: 'audio/wav' }));
  }
  function ping() {
    try {
      if (!audio) { audio = new Audio(silentWavUrl()); audio.loop = true; }
      var p = audio.play();
      if (p && p.catch) p.catch(function() {});
    } catch (e) {}
  }
  ['click', 'pointerdown', 'keydown', 'touchstart'].forEach(function(ev) {
    document.addEventListener(ev, ping, false);
  });
  ping();
  setInterval(function() { if (audio && audio.paused) ping(); }, 20000);
})();
