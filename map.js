(async function () {
  // Wait for DOM
  await new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r)));
  const set = (id, t) => (document.getElementById(id).textContent = t || '');

  // --- Auth buttons ---
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

  // If libs didn’t load, stop here (auth still works)
  if (!window.L || !window.h3) { set('status','Map libs not loaded'); return; }

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
