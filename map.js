// map.js
(async function () {
  // Wait for libs
  await new Promise(r => { if (window.L && window.h3) r(); else window.addEventListener('load', r); });

  const map = L.map('map').setView([32.4279, 53.6880], 5); // Iran
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap'
  }).addTo(map);

  let selectedHex = null;
  let hexLayerGroup = L.layerGroup().addTo(map);

  function hexToPolygon(h) {
    const coords = h3.cellToBoundary(h, true); // [ [lat,lng], ... ]
    return coords.map(([lat, lng]) => [lat, lng]);
  }

  function drawHex(h, value) {
    const poly = L.polygon(hexToPolygon(h), {
      weight: 1,
      fillOpacity: Math.min(0.7, 0.2 + Math.abs(+value) * 0.2)
    });
    poly.bindTooltip(`${h}<br/>value: ${value}`);
    poly.on('click', () => { selectedHex = h; updateSelectionUI(); });
    return poly;
  }

  function updateSelectionUI() {
    document.getElementById('btnAdd').disabled = !selectedHex;
    document.getElementById('status').textContent = selectedHex ? `Selected hex: ${selectedHex}` : '';
  }

  // Click to select nearest hex (res 7 ~ city-level; adjust if needed)
  const H3_RES = 7;
  map.on('click', e => {
    const h = h3.latLngToCell(e.latlng.lat, e.latlng.lng, H3_RES);
    selectedHex = h;
    updateSelectionUI();
  });

  async function loadPoints() {
    const r = await fetch('/api/points-list');
    const out = await r.json();
    hexLayerGroup.clearLayers();
    if (!out.ok) {
      document.getElementById('status').textContent = `Load error: ${out.message || 'unknown'}`;
      return;
    }
    (out.items || []).forEach(p => hexLayerGroup.addLayer(drawHex(p.h3, p.value)));
  }

  // Auth UI
  const msg = (t) => (document.getElementById('authMsg').textContent = t || '');
  document.getElementById('btnCreate').onclick = async () => {
    msg('…');
    const r = await fetch('/api/session-create', { method:'POST' });
    const out = await r.json();
    if (out.ok) {
      document.getElementById('created').style.display = 'block';
      document.getElementById('recovery').textContent = out.recovery;
      msg('Account created. Save the phrase.');
    } else {
      msg('Failed: ' + (out.message || 'unknown'));
    }
  };
  document.getElementById('btnRecover').onclick = async () => {
    msg('…');
    const recovery = document.getElementById('inpRecovery').value.trim();
    const r = await fetch('/api/session-recover', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ recovery })
    });
    const out = await r.json();
    msg(out.ok ? 'Recovered. You are logged in.' : ('Failed: ' + (out.message || 'unknown')));
  };

  // Add point
  document.getElementById('btnAdd').onclick = async () => {
    if (!selectedHex) return;
    const value = parseFloat(document.getElementById('valInput').value);
    if (!Number.isFinite(value)) { alert('Enter a numeric value'); return; }
    const r = await fetch('/api/points-insert', {
      method: 'POST',
      headers: { 'Content-Type':'application/json' },
      body: JSON.stringify({ cell: selectedHex, value })
    });
    const out = await r.json();
    if (out.ok) {
      document.getElementById('status').textContent = 'Inserted.';
      await loadPoints();
    } else {
      document.getElementById('status').textContent = 'Insert failed: ' + (out.message || 'unknown');
    }
  };

  await loadPoints();
})();
