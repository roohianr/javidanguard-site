// map.js
(async function () {
  // Wait for DOM
  await new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r)));

  const set = (id, t) => { const el = document.getElementById(id); if (el) el.textContent = t || ''; };

  // --- dynamic loader with fallbacks ---
  function loadScriptOnce(urls, globalKey) {
    return new Promise(async (resolve, reject) => {
      let lastErr;
      for (const url of urls) {
        if (window[globalKey]) return resolve(window[globalKey]);
        try {
          await new Promise((res, rej) => {
            const s = document.createElement('script');
            s.src = url; s.async = true; s.defer = true;
            s.onload = () => res();
            s.onerror = (e) => rej(new Error('Failed: ' + url));
            document.head.appendChild(s);
          });
          if (window[globalKey]) return resolve(window[globalKey]);
        } catch (e) { lastErr = e; }
      }
      reject(lastErr || new Error(`Failed to load ${globalKey}`));
    });
  }

  function loadCssOnce(urls) {
    for (const url of urls) {
      if ([...document.styleSheets].some(ss => (ss.href || '').includes('leaflet.css'))) return;
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = url;
      document.head.appendChild(l);
    }
  }

  // Load Leaflet CSS first
  loadCssOnce([
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css'
  ]);

  // Load Leaflet + h3 with fallback CDNs
  try {
    await loadScriptOnce([
      'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
      'https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js'
    ], 'L');

    await loadScriptOnce([
      'https://unpkg.com/h3-js@4.1.0/dist/h3-js.umd.min.js',
      'https://cdn.jsdelivr.net/npm/h3-js@4.1.0/dist/h3-js.umd.min.js'
    ], 'h3');
  } catch (e) {
    set('status', 'Map libs failed to load');
    console.error(e);
    return;
  }

  // --- Auth buttons (unchanged) ---
  document.getElementById('btnCreate').onclick = async () => {
    set('authMsg', '…');
    try {
      const r = await fetch('/api/session-create', { method:'POST' });
      const out = await r.json();
      if (out.ok) {
        document.getElementById('created').style.display = 'block';
        document.getElementById('recovery').textContent = out.recovery;
        set('authMsg', 'Account created. Save the phrase.');
      } else {
        set('authMsg', 'Failed: ' + (out.message || 'unknown'));
      }
    } catch (e) { set('authMsg', 'Failed: ' + e.message); }
  };

  document.getElementById('btnRecover').onclick = async () => {
    set('authMsg', '…');
    const recovery = document.getElementById('inpRecovery').value.trim();
    try {
      const r = await fetch('/api/session-recover', {
        method:'POST', headers:{ 'Content-Type':'application/json' },
        body: JSON.stringify({ recovery })
      });
      const out = await r.json();
      set('authMsg', out.ok ? 'Recovered. You are logged in.' : ('Failed: ' + (out.message || 'unknown')));
    } catch (e) { set('authMsg', 'Failed: ' + e.message); }
  };

  // --- Map ---
  const map = L.map('map', { doubleClickZoom:false }).setView([32.4279, 53.6880], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
  const group = L.layerGroup().addTo(map);
  const H3_RES = 7;
  let selectedHex = null;

  function hexPoly(h) {
    const coords = h3.cellToBoundary(h, true).map(([lat,lng]) => [lat,lng]);
    const poly = L.polygon(coords, { weight:1, fillOpacity:0.35 });
    poly.bindTooltip(`${h}`);
    poly.on('click', (e)=>{ e.originalEvent?.preventDefault?.(); selectedHex = h; updateSel(); });
    return poly;
  }
  function updateSel() {
    document.getElementById('btnAdd').disabled = !selectedHex;
    set('status', selectedHex ? `Selected: ${selectedHex}` : '');
  }

  map.on('click', (e)=>{ selectedHex = h3.latLngToCell(e.latlng.lat, e.latlng.lng, H3_RES); updateSel(); });

  document.getElementById('btnAdd').onclick = async () => {
    if (!selectedHex) return;
    const value = Number(document.getElementById('valInput').value);
    if (!Number.isFinite(value)) { alert('Enter a numeric value'); return; }
    const r = await fetch('/api/points-insert', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ cell: selectedHex, value })
    });
    const out = await r.json();
    if (out.ok) { set('status','Inserted'); await loadPoints(); }
    else { set('status', 'Insert failed: '+(out.message||'unknown')); }
  };

  async function loadPoints() {
    try {
      const r = await fetch('/api/points-list');
      const out = await r.json();
      group.clearLayers();
      if (!out.ok) { set('status','Load error: '+(out.message||'unknown')); return; }
      (out.items||[]).forEach(p => group.addLayer(hexPoly(p.h3)));
    } catch(e) { set('status','Load error: '+e.message); }
  }

  await loadPoints();
})();
