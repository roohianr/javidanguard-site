// map.js
(async function () {
  await new Promise(r => (document.readyState === 'complete' ? r() : window.addEventListener('load', r)));
  const $ = id => document.getElementById(id);
  const set = (id, t) => { const el=$(id); if(el) el.textContent=t||''; };
  const show = (id, on) => { const el=$(id); if(el) el.style.display = on ? '' : 'none'; };
  const disable = (id, on) => { const el=$(id); if(el) el.disabled = !!on; };

  // --- session helpers (uses /api/auth/*)
  async function refreshSessionUI() {
    try {
      const r = await fetch('/api/auth/me');
      const out = await r.json();
      const logged = !!out.loggedIn;
      set('loginState', logged ? 'Logged in' : 'Not logged in');
      show('btnLogout', logged);
      disable('btnCreate', logged);
      disable('btnAdd', (!logged || !selectedHex));
      currentUid = out.userId || null;
      return logged;
    } catch {
      set('loginState','Unknown'); return false;
    }
  }

  $('btnCreate').onclick = async () => {
    set('authMsg','…');
    const r = await fetch('/api/auth/create', { method:'POST' });
    const out = await r.json();
    if (out.ok && !out.already) {
      $('created').style.display='block';
      set('recovery', out.recovery);
      set('authMsg','Account created. Save the phrase.');
    } else if (out.ok && out.already) {
      set('authMsg','You are already logged in.');
    } else {
      set('authMsg','Failed: '+(out.message||'unknown'));
    }
    await refreshSessionUI();
  };

  $('btnRecover').onclick = async () => {
    set('authMsg','…');
    const recovery = $('inpRecovery').value.trim();
    const r = await fetch('/api/auth/recover', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ recovery })
    });
    const out = await r.json();
    set('authMsg', out.ok ? 'Recovered. You are logged in.' : ('Failed: '+(out.message||'unknown')));
    await refreshSessionUI();
  };

  $('btnLogout').onclick = async () => {
    await fetch('/api/auth/logout', { method:'POST' });
    set('authMsg','Logged out.');
    await refreshSessionUI();
  };

  // map libs check
  if (!window.L || !window.h3) { set('status','Map libs not loaded'); return; }

  // --- map setup
  const map = L.map('map', { doubleClickZoom:false }).setView([32.4279, 53.6880], 5);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }).addTo(map);
  const layerAgg = L.layerGroup().addTo(map);
  const H3_RES = 7;
  let selectedHex = null;
  let currentArea = null;
  let currentUid = null;

  function hexPoly(h, fillOpacity=0.35) {
    const coords = h3.cellToBoundary(h, true).map(([lat,lng]) => [lat,lng]);
    const poly = L.polygon(coords, { weight:1, fillOpacity });
    poly.on('click', (e)=>{ e.originalEvent?.preventDefault?.(); selectedHex = h; $('areaCell').value = h; updateSel(); });
    return poly;
  }

  function updateSel() {
    const canAdd = (!!selectedHex) && ($('btnLogout').style.display !== 'none');
    disable('btnAdd', !canAdd);
    set('status', selectedHex ? `Selected: ${selectedHex}` : '');
  }

  map.on('click', (e)=>{ selectedHex = h3.latLngToCell(e.latlng.lat, e.latlng.lng, H3_RES); $('areaCell').value = selectedHex; updateSel(); });

  // --- map add numeric point (uses /api/map/points-insert)
  $('btnAdd').onclick = async () => {
    if (!selectedHex) return;
    const value = Number($('valInput').value);
    if (!Number.isFinite(value)) { alert('Enter a numeric value'); return; }
    const r = await fetch('/api/map/points-insert', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ cell: selectedHex, value })
    });
    const out = await r.json();
    if (out.ok) { set('status','Inserted'); await loadAggregates(); }
    else { set('status','Insert failed: '+(out.message||'unknown')); }
  };

  // --- profile (area + group size) -> /api/user/update
  $('btnUseSelected').onclick = () => { if (selectedHex) $('areaCell').value = selectedHex; };
  $('btnSaveProfile').onclick = async () => {
    const area_h3 = $('areaCell').value.trim();
    const group_size = Number($('groupSize').value);
    const r = await fetch('/api/user/update', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ area_h3, group_size })
    });
    const out = await r.json();
    set('profileMsg', out.ok ? 'Profile saved' : 'Failed: '+(out.message||'unknown'));
    if (out.ok) { currentArea = area_h3; await loadAggregates(); await refreshChat(); }
  };

  // --- aggregates (people per hex) -> /api/map/area-aggregate
  async function loadAggregates() {
    layerAgg.clearLayers();
    try {
      const r = await fetch('/api/map/area-aggregate');
      const out = await r.json();
      if (!out.ok) { set('status','Agg error: '+(out.message||'unknown')); return; }
      (out.items||[]).forEach(a => {
        const poly = hexPoly(a.h3, Math.min(0.7, 0.2 + (Number(a.units)||0)*0.02));
        poly.bindTooltip(`${a.h3}<br/>users: ${a.users}<br/>units: ${a.units}`);
        layerAgg.addLayer(poly);
      });
    } catch(e) { set('status','Agg error: '+e.message); }
  }

  // --- chat (uses /api/chat/*)
  async function refreshChat() {
    if (!currentArea || !currentUid) { $('chatList').innerHTML = ''; show('badge', false); return; }
    try {
      // list
      const r = await fetch(`/api/chat/list?area=${encodeURIComponent(currentArea)}&limit=100`);
      const out = await r.json();
      if (!out.ok) { set('chatMsg','Load failed'); return; }
      $('chatList').innerHTML = (out.items||[]).map(m => (
        `<div class="msg"><div class="muted">${new Date(m.created_at).toLocaleString()}</div>${m.body}</div>`
      )).join('');
      $('chatList').scrollTop = $('chatList').scrollHeight;
      // unread badge
      const rx = await fetch(`/api/chat/unread?area=${encodeURIComponent(currentArea)}&uid=${encodeURIComponent(currentUid)}`);
      const ux = await rx.json();
      const c = Number(ux?.count||0);
      set('badge', String(c)); show('badge', c>0);
    } catch {}
  }

  $('btnSendChat').onclick = async () => {
    if (!currentArea) { set('chatMsg','Pick & save your area first'); return; }
    const body = $('chatInput').value.trim();
    if (!body) return;
    const r = await fetch('/api/chat/post', {
      method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ area_h3: currentArea, body })
    });
    const out = await r.json();
    if (out.ok) { $('chatInput').value=''; await refreshChat(); await markSeen(); }
    else set('chatMsg','Send failed: '+(out.message||'unknown'));
  };

  async function markSeen() {
    if (!currentArea) return;
    await fetch('/api/chat/seen', { method:'POST', headers:{ 'Content-Type':'application/json' },
      body: JSON.stringify({ area_h3: currentArea }) });
    await refreshChat();
  }

  // --- init
  await refreshSessionUI();
  await loadAggregates();

  $('areaCell').addEventListener('change', () => { currentArea = $('areaCell').value.trim(); });

  // keep chat badge fresh
  setInterval(refreshChat, 8000);
})();
