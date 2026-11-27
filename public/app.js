/* Front end for the Evacuation Center Headcount & Relief Goods Tracker.
   Plain JavaScript: fetch() calls the REST API, results are rendered into the page. */

const state = { centers: [], items: [], charts: {} };

// ---------- helpers ----------
const $ = (sel) => document.querySelector(sel);
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]
));
const todayManila = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

async function api(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: { 'Content-Type': 'application/json' },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const details = Array.isArray(data.details) ? `: ${data.details.join('; ')}` : '';
    throw new Error(`${data.error || 'Request failed'}${details}`);
  }
  return data;
}

let toastTimer;
function toast(message, kind = 'success') {
  const el = $('#toast');
  const colors = { success: 'bg-emerald-600 text-white', error: 'bg-red-600 text-white', warning: 'bg-amber-500 text-white' };
  el.className = `fixed top-4 right-4 z-50 max-w-sm rounded-lg px-4 py-3 text-sm font-medium shadow-lg ${colors[kind]}`;
  el.textContent = message;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), kind === 'error' ? 6000 : 3500);
}

function formData(form) {
  const data = {};
  for (const [key, value] of new FormData(form).entries()) {
    if (value === '') continue;
    data[key] = form.elements[key].type === 'number' || key.endsWith('_id') ? Number(value) : value;
  }
  return data;
}

function badge(text, color) {
  return `<span class="badge bg-${color}-100 text-${color}-700">${esc(text)}</span>`;
}
const occupancyColor = (s) => ({ available: 'emerald', 'nearly full': 'amber', 'over capacity': 'red' }[s] || 'slate');
const stockColor = (s) => ({ ok: 'emerald', low: 'amber', 'out of stock': 'red' }[s] || 'slate');

// ---------- shared data ----------
async function loadCenters() {
  state.centers = await api('/api/centers');
  document.querySelectorAll('.center-select').forEach((select) => {
    const current = select.value;
    const allLabel = select.dataset.all;
    select.innerHTML = (allLabel ? `<option value="">${esc(allLabel)}</option>` : '')
      + state.centers.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
    if (current && [...select.options].some((o) => o.value === current)) select.value = current;
  });
}

async function loadItems() {
  state.items = await api('/api/items');
  const select = $('#d-item');
  const current = select.value;
  select.innerHTML = state.items.map((i) => (
    `<option value="${i.id}" ${i.quantity === 0 ? 'disabled' : ''}>${esc(i.name)} (${i.quantity} ${esc(i.unit)} left)</option>`
  )).join('');
  if (current) select.value = current;
}

// ---------- dashboard ----------
function drawChart(key, canvasId, config) {
  if (typeof Chart === 'undefined') return;
  if (state.charts[key]) {
    state.charts[key].data = config.data;
    state.charts[key].update();
    return;
  }
  state.charts[key] = new Chart(document.getElementById(canvasId), {
    ...config,
    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, ...config.options },
  });
}

async function loadDashboard() {
  const d = await api('/api/dashboard');
  $('#live-headcount').textContent = d.totals.persons.toLocaleString();

  const kpis = [
    ['Persons in centers', d.totals.persons.toLocaleString(), `${d.totals.capacity.toLocaleString()} capacity`],
    ['Families present', d.totals.families, `${d.totals.centers} centers`],
    ['Packs given today', d.totals.packs_today, d.date],
    ['Low / out items', d.totals.low_stock_items, 'needs restock'],
    ['Overall occupancy', d.totals.capacity ? `${Math.round((d.totals.persons / d.totals.capacity) * 100)}%` : '–', 'of all centers'],
  ];
  $('#kpis').innerHTML = kpis.map(([label, value, sub]) => `
    <div class="card"><div class="text-xs font-semibold uppercase text-slate-500">${esc(label)}</div>
    <div class="text-2xl font-bold text-slate-900">${esc(value)}</div><div class="text-xs text-slate-400">${esc(sub)}</div></div>`).join('');

  $('#alerts').innerHTML = d.alerts.map((a) => (
    `<div class="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">⚠ ${esc(a)}</div>`
  )).join('');

  drawChart('centers', 'chart-centers', {
    type: 'bar',
    data: {
      labels: d.centers.map((c) => c.name),
      datasets: [
        { label: 'Headcount', data: d.centers.map((c) => c.headcount), backgroundColor: '#0369a1' },
        { label: 'Capacity', data: d.centers.map((c) => c.capacity), backgroundColor: '#cbd5e1' },
      ],
    },
    options: { scales: { y: { beginAtZero: true } } },
  });
  drawChart('days', 'chart-days', {
    type: 'line',
    data: {
      labels: d.distributions_last_7_days.map((x) => x.date.slice(5)),
      datasets: [{ label: 'Packs given', data: d.distributions_last_7_days.map((x) => x.packs), borderColor: '#0369a1', backgroundColor: '#0369a133', fill: true, tension: 0 }],
    },
    options: { scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } },
  });
  drawChart('stock', 'chart-stock', {
    type: 'bar',
    data: {
      labels: d.stock.map((s) => `${s.name} (${s.unit})`),
      datasets: [{
        label: 'On hand',
        data: d.stock.map((s) => s.quantity),
        backgroundColor: d.stock.map((s) => ({ ok: '#059669', low: '#d97706', 'out of stock': '#dc2626' }[s.stock_status])),
      }],
    },
    options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } },
  });
  $('#updated-at').textContent = `Last updated ${new Date().toLocaleTimeString()}.`;
}

// ---------- families ----------
async function loadFamilies() {
  const params = new URLSearchParams();
  if ($('#fam-filter-center').value) params.set('center_id', $('#fam-filter-center').value);
  if ($('#fam-filter-status').value) params.set('status', $('#fam-filter-status').value);
  if ($('#fam-search').value.trim()) params.set('q', $('#fam-search').value.trim());
  const families = await api(`/api/families?${params}`);
  $('#family-rows').innerHTML = families.length === 0
    ? '<tr><td class="td text-slate-400" colspan="6">No families found.</td></tr>'
    : families.map((f) => `
      <tr>
        <td class="td font-medium">${esc(f.head_name)}<div class="text-xs text-slate-400">${esc(f.contact_number || '')}</div></td>
        <td class="td">${f.members}</td>
        <td class="td">${esc(f.origin_barangay)}</td>
        <td class="td">${esc(f.center_name)}</td>
        <td class="td">${f.status === 'present' ? badge('Present', 'emerald') : badge('Checked out', 'slate')}</td>
        <td class="td text-right">${f.status === 'present'
          ? `<button class="btn-light" data-checkout="${f.id}">Check out</button>`
          : `<button class="btn-light" data-checkin="${f.id}">Check in</button>`}</td>
      </tr>`).join('');
}

async function loadFamilyOptions() {
  const centerId = $('#d-center').value;
  const families = centerId ? await api(`/api/families?status=present&center_id=${centerId}`) : [];
  $('#d-family').innerHTML = families.length === 0
    ? '<option value="">No families in this center</option>'
    : families.map((f) => `<option value="${f.id}">${esc(f.head_name)} (${f.members}) – ${esc(f.origin_barangay)}</option>`).join('');
}

// ---------- distributions ----------
async function loadDistributions() {
  const date = $('#log-date').value;
  const rows = await api(`/api/distributions${date ? `?date=${date}` : ''}`);
  $('#dist-rows').innerHTML = rows.length === 0
    ? '<tr><td class="td text-slate-400" colspan="6">No distributions logged for this date.</td></tr>'
    : rows.map((r) => `
      <tr>
        <td class="td">${esc(r.distributed_on)}</td>
        <td class="td font-medium">${esc(r.head_name)}</td>
        <td class="td">${esc(r.center_name)}</td>
        <td class="td">${esc(r.item_name)}</td>
        <td class="td">${r.quantity} ${esc(r.unit)}</td>
        <td class="td">${esc(r.distributed_by)}</td>
      </tr>`).join('');
}

// ---------- stock ----------
async function loadStock() {
  await loadItems();
  $('#item-rows').innerHTML = state.items.length === 0
    ? '<tr><td class="td text-slate-400" colspan="4">No relief items yet.</td></tr>'
    : state.items.map((i) => `
      <tr>
        <td class="td font-medium">${esc(i.name)}</td>
        <td class="td">${i.quantity} ${esc(i.unit)} <span class="text-xs text-slate-400">(alert at ${i.low_stock_threshold})</span></td>
        <td class="td">${badge(i.stock_status, stockColor(i.stock_status))}</td>
        <td class="td"><form class="flex gap-2" data-restock="${i.id}">
          <input type="number" min="1" name="quantity" class="input w-24" placeholder="Qty" required>
          <button class="btn-light">Add</button></form></td>
      </tr>`).join('');
}

// ---------- centers ----------
async function loadCenterTable() {
  await loadCenters();
  $('#center-rows').innerHTML = state.centers.length === 0
    ? '<tr><td class="td text-slate-400" colspan="6">No evacuation centers yet. Add one above.</td></tr>'
    : state.centers.map((c) => `
      <tr>
        <td class="td font-medium">${esc(c.name)}</td>
        <td class="td">${esc(c.barangay)}, ${esc(c.municipality)}</td>
        <td class="td">${c.families_present}</td>
        <td class="td">${c.headcount} / ${c.capacity}</td>
        <td class="td">${badge(`${c.occupancy}% ${c.occupancy_status}`, occupancyColor(c.occupancy_status))}</td>
        <td class="td text-right">${c.families_present === 0 ? `<button class="btn-light" data-delete-center="${c.id}">Delete</button>` : ''}</td>
      </tr>`).join('');
}

// ---------- routing ----------
const views = {
  dashboard: loadDashboard,
  families: async () => { await loadCenters(); await loadFamilies(); },
  distribute: async () => { await Promise.all([loadCenters(), loadItems()]); await Promise.all([loadFamilyOptions(), loadDistributions()]); },
  stock: loadStock,
  centers: loadCenterTable,
};

async function showView() {
  const name = views[location.hash.slice(1)] ? location.hash.slice(1) : 'dashboard';
  document.querySelectorAll('[data-view]').forEach((el) => el.classList.toggle('hidden', el.dataset.view !== name));
  document.querySelectorAll('[data-tab]').forEach((el) => el.classList.toggle('active', el.dataset.tab === name));
  try { await views[name](); } catch (err) { toast(err.message, 'error'); }
}

// ---------- event wiring ----------
function onSubmit(selector, handler) {
  $(selector).addEventListener('submit', async (event) => {
    event.preventDefault();
    const button = event.target.querySelector('button');
    button.disabled = true;
    try { await handler(event.target); } catch (err) { toast(err.message, 'error'); } finally { button.disabled = false; }
  });
}

onSubmit('#center-form', async (form) => {
  await api('/api/centers', { method: 'POST', body: formData(form) });
  form.reset();
  toast('Evacuation center added');
  await loadCenterTable();
});

onSubmit('#family-form', async (form) => {
  const family = await api('/api/families', { method: 'POST', body: formData(form) });
  form.reset();
  form.elements.center_id.value = family.center_id;
  if (family.warning) toast(family.warning, 'warning');
  else toast(`${family.head_name}'s family registered. ${family.center_name} headcount: ${family.center_headcount}`);
  await loadFamilies();
});

onSubmit('#dist-form', async (form) => {
  const body = formData(form);
  const row = await api('/api/distributions', { method: 'POST', body });
  toast(`${row.item_name} given to ${row.head_name}. ${row.remaining_stock} ${row.unit} left.`);
  await Promise.all([loadItems(), loadDistributions()]);
});

onSubmit('#item-form', async (form) => {
  await api('/api/items', { method: 'POST', body: formData(form) });
  form.reset();
  toast('Relief item added');
  await loadStock();
});

$('#item-rows').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.target;
  try {
    const item = await api(`/api/items/${form.dataset.restock}/restock`, { method: 'POST', body: formData(form) });
    toast(`${item.name} restocked: ${item.quantity} ${item.unit} on hand`);
    await loadStock();
  } catch (err) { toast(err.message, 'error'); }
});

document.addEventListener('click', async (event) => {
  const target = event.target.closest('button');
  if (!target) return;
  try {
    if (target.dataset.checkout) {
      await api(`/api/families/${target.dataset.checkout}/checkout`, { method: 'PATCH' });
      toast('Family checked out');
      await loadFamilies();
    } else if (target.dataset.checkin) {
      await api(`/api/families/${target.dataset.checkin}/checkin`, { method: 'PATCH' });
      toast('Family checked back in');
      await loadFamilies();
    } else if (target.dataset.deleteCenter) {
      await api(`/api/centers/${target.dataset.deleteCenter}`, { method: 'DELETE' });
      toast('Center deleted');
      await loadCenterTable();
    }
  } catch (err) { toast(err.message, 'error'); }
});

let searchTimer;
$('#fam-search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadFamilies().catch((e) => toast(e.message, 'error')), 300); });
$('#fam-filter-center').addEventListener('change', () => loadFamilies().catch((e) => toast(e.message, 'error')));
$('#fam-filter-status').addEventListener('change', () => loadFamilies().catch((e) => toast(e.message, 'error')));
$('#d-center').addEventListener('change', () => loadFamilyOptions().catch((e) => toast(e.message, 'error')));
$('#log-date').addEventListener('change', () => loadDistributions().catch((e) => toast(e.message, 'error')));

window.addEventListener('hashchange', showView);
$('#log-date').value = todayManila();
showView();

// Live headcount: refresh the dashboard numbers every 15 seconds.
setInterval(() => {
  const onDashboard = !location.hash || location.hash === '#dashboard';
  if (onDashboard) loadDashboard().catch(() => {});
  else api('/api/dashboard').then((d) => { $('#live-headcount').textContent = d.totals.persons.toLocaleString(); }).catch(() => {});
}, 15000);
if (location.hash && location.hash !== '#dashboard') {
  api('/api/dashboard').then((d) => { $('#live-headcount').textContent = d.totals.persons.toLocaleString(); }).catch(() => {});
}
