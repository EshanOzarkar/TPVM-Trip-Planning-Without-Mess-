/* TPVM – application logic: state, map, views, itinerary. */
(() => {
'use strict';

/* ============================== helpers ============================== */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pretty = s => s ? String(s).replace(/[_;]/g, ' ').replace(/^./, c => c.toUpperCase()) : '';
const rad = d => d * Math.PI / 180;
const hav = (a, b) => {
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(x));
};
const fmtKm = n => n == null || isNaN(n) ? '–' : n < 1 ? Math.round(n * 1000) + ' m' : (n < 10 ? n.toFixed(1) : Math.round(n)) + ' km';
const fmtMin = m => {
  if (m == null || isNaN(m)) return '–';
  m = Math.round(m);
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
};
const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
const safeUrl = u => {
  if (!u) return '';
  try { const x = new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; }
};
const q = encodeURIComponent;
let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

/* ============================== state ============================== */
const TABS = [
  { id: 'overview', ico: '🧭', label: 'Overview' },
  { id: 'reach', ico: '✈️', label: 'Get there' },
  { id: 'stay', ico: '🏨', label: 'Stay' },
  { id: 'move', ico: '🚕', label: 'Get around' },
  { id: 'eat', ico: '🍽️', label: 'Eat' },
  { id: 'shop', ico: '🛍️', label: 'Shop' },
  { id: 'see', ico: '📍', label: 'Explore' },
  { id: 'plan', ico: '🗓️', label: 'Itinerary' },
];
const TAB_CATS = { stay: ['stay'], eat: ['food'], shop: ['shop'], see: ['see'], move: ['rent', 'transit'] };

const S = {
  trip: null, region: REGIONS.DEFAULT, base: null, tab: 'overview',
  places: {}, loading: {}, errors: {}, notes: {}, radius: {}, filters: {}, limit: {},
  layers: new Set(), plan: { days: 3, items: [], active: 1 }, routes: {},
  reach: null, guide: null, weather: null, token: 0,
};
const filt = cat => S.filters[cat] || (S.filters[cat] = { chip: '', q: '', sort: cat === 'see' ? 'notable' : 'dist', veg: false });

const money = n => {
  const v = n >= 1000 ? Math.round(n / 50) * 50 : n >= 100 ? Math.round(n / 5) * 5 : Math.round(n);
  return S.region.cur + v.toLocaleString(S.region.locale);
};
const range = (lo, hi) => `${money(lo)}–${money(hi).replace(S.region.cur, '')}`;

function nights() {
  const T = S.trip; if (!T) return 3;
  const a = new Date(T.start), b = new Date(T.end);
  const n = Math.round((b - a) / 864e5);
  return isFinite(n) && n >= 1 ? Math.min(n, 30) : 3;
}
function dayLabel(d) {
  const s = new Date(S.trip?.start + 'T00:00:00');
  if (isNaN(s)) return '';
  s.setDate(s.getDate() + d - 1);
  return s.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ============================== map ============================== */
let map; const groups = {}; const markers = {}; const planMarkers = {};
let baseGroup, planGroup, routeGroup, reachGroup, tripGroup;

const pinIcon = (html, cls = '', color = '#0f766e', size = 30) => L.divIcon({
  className: '', html: `<div class="pin ${cls}" style="--c:${color}">${html}</div>`,
  iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 + 2],
});

function initMap() {
  map = L.map('map').setView([22.5, 79], 5);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(map);
  routeGroup = L.layerGroup().addTo(map);
  reachGroup = L.layerGroup().addTo(map);
  LAYER_ORDER.forEach(c => groups[c] = L.layerGroup().addTo(map));
  planGroup = L.layerGroup().addTo(map);
  baseGroup = L.layerGroup().addTo(map);
  tripGroup = L.layerGroup().addTo(map);
}

function refreshMarkers() {
  if (!map) return;
  const active = TAB_CATS[S.tab] || [];
  LAYER_ORDER.forEach(cat => {
    const g = groups[cat]; g.clearLayers();
    if (!S.layers.has(cat)) return;
    const C = CATEGORIES[cat];
    const list = active.includes(cat) ? visible(cat) : (S.places[cat] || []).slice().sort((a, b) => a.dist - b.dist).slice(0, 80);
    list.forEach(p => {
      const m = L.marker([p.lat, p.lon], { icon: pinIcon(C.emoji, 'small', C.color, 24) });
      m.bindPopup(() => popupHtml(p));
      m.on('click', () => flashCard(p.key));
      markers[p.key] = m; g.addLayer(m);
    });
  });
  baseGroup.clearLayers();
  if (S.base) {
    L.marker([S.base.lat, S.base.lon], { icon: pinIcon('🏠', 'base', '#14212b', 34), zIndexOffset: 800 })
      .bindPopup(`<div class="pp"><h4>🏠 Your base</h4><div class="small muted">${esc(S.base.name)}<br>All distances &amp; times are measured from here.</div>
        ${S.base.custom ? '<div class="pc-actions"><button class="btn sm" data-act="reset-base">Reset to city centre</button></div>' : ''}</div>`)
      .addTo(baseGroup);
  }
  drawReach();
  drawPlan();
}

function drawReach() {
  reachGroup.clearLayers();
  if (S.tab !== 'reach' || !S.trip) return;
  const { from, to } = S.trip;
  L.polyline([[from.lat, from.lon], [to.lat, to.lon]], { color: '#0f766e', weight: 3, dashArray: '8 8', opacity: .8 }).addTo(reachGroup);
  L.marker([from.lat, from.lon], { icon: pinIcon('A', '', '#0f766e', 32) }).bindPopup(`<b>${esc(from.label)}</b><br><span class="small muted">Origin</span>`).addTo(reachGroup);
  L.marker([to.lat, to.lon], { icon: pinIcon('B', '', '#e11d48', 32) }).bindPopup(`<b>${esc(to.label)}</b><br><span class="small muted">Destination</span>`).addTo(reachGroup);
  (S.reach?.airports.from || []).concat(S.reach?.airports.to || []).forEach(a =>
    L.marker([a.lat, a.lon], { icon: pinIcon('✈', 'small', '#475569', 24) })
      .bindPopup(`<b>${esc(a.name)}</b>${a.iata ? ` (${esc(a.iata)})` : ''}<br><span class="small muted">${fmtKm(a.d)} from city centre</span>`).addTo(reachGroup));
  (S.reach?.stations || []).forEach(a =>
    L.marker([a.lat, a.lon], { icon: pinIcon('🚉', 'small', '#475569', 24) })
      .bindPopup(`<b>${esc(a.name)}</b><br><span class="small muted">${esc(pretty(a.sub))} · ${fmtKm(a.d)} from centre</span>`).addTo(reachGroup));
}

function drawPlan() {
  planGroup.clearLayers(); routeGroup.clearLayers();
  for (const k in planMarkers) delete planMarkers[k];
  for (let d = 1; d <= S.plan.days; d++) {
    const color = DAY_COLORS[(d - 1) % DAY_COLORS.length];
    const items = S.plan.items.filter(i => i.day === d);
    items.forEach((it, idx) => {
      const m = L.marker([it.place.lat, it.place.lon], { icon: pinIcon(idx + 1, '', color, 28), zIndexOffset: 500 });
      m.bindPopup(() => popupHtml(findPlace(it.key) || it.place));
      planMarkers[it.key] = m; planGroup.addLayer(m);
    });
    const r = S.routes[d];
    if (r?.coords?.length) L.polyline(r.coords, { color, weight: 5, opacity: .8 }).addTo(routeGroup);
  }
}

function fitCat(cat) {
  const pts = visible(cat).slice(0, 60).map(p => [p.lat, p.lon]);
  if (S.base) pts.push([S.base.lat, S.base.lon]);
  if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { padding: [40, 40], maxZoom: 15 });
  else if (S.base) map.setView([S.base.lat, S.base.lon], 13);
}

function focusPlace(key) {
  const p = findPlace(key); if (!p) return;
  const m = markers[key] || planMarkers[key];
  map.setView([p.lat, p.lon], Math.max(map.getZoom(), 15), { animate: true });
  if (m) m.openPopup();
}
function flashCard(key) {
  const el = document.querySelector(`.pcard[data-key="${key}"]`);
  if (!el) return;
  el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 1600);
}

/* ============================== places data ============================== */
function subtype(cat, t) {
  if (cat === 'transit') {
    if (t.aeroway) return 'airport';
    if (t.station === 'subway') return 'metro station';
    if (t.amenity === 'bus_station') return 'bus station';
    return 'railway station';
  }
  return t.tourism || t.historic || t.amenity || t.shop || t.leisure || 'place';
}

function normalize(cat, e) {
  const t = e.tags || {};
  const lat = e.lat ?? e.center?.lat, lon = e.lon ?? e.center?.lon;
  const name = t['name:en'] || t.name;
  if (lat == null || lon == null || !name) return null;
  const p = { key: `${cat}:${e.type[0]}${e.id}`, cat, name, lat, lon, tags: t, sub: subtype(cat, t) };
  p.chips = [pretty(p.sub)];
  if (cat === 'food' && t.cuisine) t.cuisine.split(';').slice(0, 3).forEach(c => p.chips.push(pretty(c.trim())));
  p.chips = [...new Set(p.chips)];
  p.notable = !!(t.wikidata || t.wikipedia);
  seedDist(p);
  return p;
}

function seedDist(p) {
  p.air = hav(S.base, p);
  p.dist = p.air * 1.35;
  p.dur = p.dist / 28 * 60;
  p.approx = true;
}

async function loadCat(cat, force) {
  if (!S.trip || S.loading[cat] || (S.places[cat] && !force)) return;
  const token = S.token;
  S.loading[cat] = true; S.errors[cat] = null; uiUpdate(cat);
  try {
    const C = CATEGORIES[cat], c = S.trip.to, r = S.radius[cat] ?? C.radius;
    let els;
    S.notes[cat] = '';
    try { els = await API.places(C.groups, c.lat, c.lon, r); }
    catch (e) {
      if (token !== S.token) return;
      S.notes[cat] = 'The main map-data server is busy, so this list comes from a backup source and may be shorter.';
      uiUpdate(cat);
      els = await API.nominatimPlaces(FALLBACK_TERMS[cat], c.lat, c.lon, r);
    }
    if (token !== S.token) return;
    const seen = new Set();
    S.places[cat] = els.map(e => normalize(cat, e)).filter(p => p && !seen.has(p.key) && seen.add(p.key));
    if (!S.places[cat].length) S.errors[cat] = 'Nothing found in this radius – try a larger one.';
  } catch (e) {
    if (token !== S.token) return;
    S.errors[cat] = e.message;
  }
  S.loading[cat] = false;
  uiUpdate(cat);
  if (S.places[cat]?.length) {
    if ((TAB_CATS[S.tab] || []).includes(cat)) fitCat(cat);
    enrich(cat);
  }
}

const bKey = () => S.base ? S.base.lat + ',' + S.base.lon : '';
async function enrich(cat) {
  const token = S.token, key = bKey();
  const list = (S.places[cat] || []).slice().sort((a, b) => a.air - b.air).slice(0, 180);
  for (let i = 0; i < list.length; i += 90) {
    const chunk = list.slice(i, i + 90);
    try {
      const res = await API.osrmTable(S.base, chunk);
      if (token !== S.token || key !== bKey()) return;
      chunk.forEach((p, j) => { const r = res[j]; if (r && r.dist != null) { p.dist = r.dist; p.dur = r.dur; p.approx = false; } });
    } catch { return; }
    uiUpdate(cat);
  }
}

function visible(cat) {
  const F = filt(cat);
  let list = (S.places[cat] || []).slice();
  if (F.chip) list = list.filter(p => p.chips.includes(F.chip));
  if (F.q) { const s = F.q.toLowerCase(); list = list.filter(p => p.name.toLowerCase().includes(s)); }
  if (F.veg) list = list.filter(p => ['yes', 'only'].includes(p.tags['diet:vegetarian']) || ['yes', 'only'].includes(p.tags['diet:vegan']));
  const by = {
    dist: (a, b) => a.dist - b.dist,
    name: (a, b) => a.name.localeCompare(b.name),
    notable: (a, b) => (b.notable - a.notable) || (a.dist - b.dist),
    price: (a, b) => estPrice(a) - estPrice(b),
    stars: (a, b) => (parseFloat(b.tags.stars) || 0) - (parseFloat(a.tags.stars) || 0) || (a.dist - b.dist),
  };
  return list.sort(by[F.sort] || by.dist);
}

function findPlace(key) {
  const cat = key.split(':')[0];
  return (S.places[cat] || []).find(p => p.key === key) || S.plan.items.find(i => i.key === key)?.place;
}

/* ---------- pricing: pre-tax base -> all-in price with itemised taxes & fees ---------- */
const DISCLAIMER = 'Approximate planning prices: typical market rates with taxes and fees added using the rules in force when this was written (India: GST slabs, airport fees, tolls and so on). Real prices vary with date, demand, class and provider, and levies change. Always confirm on the booking site before you pay.';

function stayPrice(base) {
  const X = S.region.tax.stay, lines = [];
  const slab = X.slabs.find(s => base <= s[0]);
  if (slab[1] > 0) lines.push({ label: slab[2], amt: base * slab[1] });
  if (X.fee) lines.push({ label: X.feeLabel, amt: base * X.fee });
  const tax = lines.reduce((s, l) => s + l.amt, 0);
  return { base, lines, tax, total: base + tax };
}

/** Price of ONE unit (person, car, night…). ctx: { cls, km, interstate }. */
function priceOf(kind, base, ctx = {}) {
  if (kind === 'stay') return stayPrice(base);
  let rules = S.region.tax[kind];
  if (!Array.isArray(rules)) rules = rules[ctx.cls || 'ac'];
  const lines = []; let total = base;
  for (const r of rules) {
    if (r.if === 'interstate' && !ctx.interstate) continue;
    const amt = r.pct ? total * r.pct : r.perKm ? r.perKm * (ctx.km || 0) : (r.flat || 0);
    if (amt > 0.5) { lines.push({ label: r.label, amt }); total += amt; }
  }
  return { base, lines, tax: total - base, total };
}

const breakdownHtml = (pr, unit) => `<details class="small"><summary>See taxes, fees &amp; tolls</summary><div class="bd">
  <div class="row between"><span>Typical base price (${esc(unit)})</span><span>${money(pr.base)}</span></div>
  ${pr.lines.map(l => `<div class="row between"><span>+ ${esc(l.label)}</span><span>${money(l.amt)}</span></div>`).join('')}
  <div class="row between bd-t"><b>All-in</b><b>${money(pr.total)}</b></div>
  <div class="muted">Taxes, fees${pr.lines.some(l => /toll|fuel/i.test(l.label)) ? ', fuel &amp; tolls' : ''} ≈ ${Math.round(pr.tax / pr.total * 100)}% of the total</div></div></details>`;

function stayBase(p) {
  const R = S.region, t = p.tags || {};
  const base = R.stay[p.sub] ?? R.stay.hotel;
  const stars = Math.round(parseFloat(t.stars));
  const mult = p.sub === 'hotel' || p.sub === 'resort' ? (STAR_MULT[stars] ?? 1) : 1;
  return base * mult * (S.trip?.tier ?? 1);
}
const estPrice = p => stayPrice(stayBase(p)).total;

/* ============================== trip planning ============================== */
function regionFor(trip) { return trip.to.cc === 'IN' ? REGIONS.IN : REGIONS.DEFAULT; }

function activateTrip(restore) {
  const T = S.trip;
  S.region = regionFor(T);
  if (!restore) {
    S.token++;
    S.places = {}; S.loading = {}; S.errors = {}; S.notes = {}; S.filters = {}; S.limit = {}; S.radius = {};
    S.reach = null; S.guide = null; S.weather = null; S.routes = {};
    S.plan = { days: nights() + 1, items: [], active: 1 };
    S.base = { name: `${T.to.name} centre`, lat: T.to.lat, lon: T.to.lon, custom: false };
    S.layers = new Set(['see']);
  } else {
    S.token++;
    S.layers = new Set(['see']);
  }
  tripGroup.clearLayers();
  map.setView([T.to.lat, T.to.lon], 12);
  setTab(restore ? S.tab : 'overview', true);
  loadCat('see');
  loadReach();
  loadGuide();
  loadWeather();
  S.plan.items.length && Array.from({ length: S.plan.days }, (_, i) => ensureRoute(i + 1));
  save();
}

async function loadReach() {
  const token = S.token, { from, to } = S.trip;
  const R = S.reach = { air: hav(from, to), road: null, roadTime: null, airports: { from: [], to: [] }, stations: [], loading: true };
  uiUpdate('reach');
  try { const r = await API.osrmRoute([from, to], false); if (token === S.token) { R.road = r.dist; R.roadTime = r.dur; } } catch { /* overseas / no road */ }
  const ap = (c, r) => API.airports(c.lat, c.lon, r)
    .catch(() => API.nominatimPlaces(['airport'], c.lat, c.lon, r).then(l => l.filter(e => /airport|airfield|aerodrome/i.test(e.tags.name))))
    .then(els => els.map(e => ({
      name: e.tags['name:en'] || e.tags.name, iata: e.tags.iata || '', lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon,
    })).filter(a => a.lat != null).map(a => ({ ...a, d: hav(c, a) })).sort((a, b) => a.d - b.d).slice(0, 3)).catch(() => []);
  const a1 = await ap(from, 100000), a2 = await ap(to, 100000);
  if (token !== S.token) return;
  R.airports = { from: a1, to: a2 };
  try {
    const els = await API.stations(to.lat, to.lon, 12000)
      .catch(() => API.nominatimPlaces(['railway station', 'bus station'], to.lat, to.lon, 12000));
    R.stations = els.map(e => ({ name: e.tags['name:en'] || e.tags.name, sub: e.tags.amenity === 'bus_station' ? 'bus station' : 'railway station', lat: e.lat ?? e.center?.lat, lon: e.lon ?? e.center?.lon, code: e.tags.ref || e.tags['railway:ref'] }))
      .filter(a => a.lat != null).map(a => ({ ...a, d: hav(to, a) })).sort((a, b) => a.d - b.d).slice(0, 6);
  } catch { /* optional */ }
  if (token !== S.token) return;
  R.loading = false;
  uiUpdate('reach');
}

async function loadGuide() {
  const token = S.token, to = S.trip.to;
  const names = [...new Set([to.city, to.name, to.label.split(',')[0]].filter(Boolean))];
  for (const n of names) {
    try { const g = await API.guide(n); if (g) { if (token === S.token) { S.guide = g; uiUpdate('overview'); } return; } } catch { break; }
  }
  if (token === S.token) { S.guide = false; uiUpdate('overview'); }
}

async function loadWeather() {
  const token = S.token, to = S.trip.to;
  try { const w = await API.weather(to.lat, to.lon); if (token === S.token) { S.weather = w; uiUpdate('overview'); } }
  catch { if (token === S.token) { S.weather = false; uiUpdate('overview'); } }
}

function setBase(p, custom = true) {
  S.base = { name: p.name, lat: p.lat, lon: p.lon, custom };
  S.routes = {};
  Object.values(S.places).forEach(list => (list || []).forEach(seedDist));
  Object.keys(S.places).forEach(c => S.places[c]?.length && enrich(c));
  Array.from({ length: S.plan.days }, (_, i) => ensureRoute(i + 1));
  refreshMarkers(); renderContent(); save();
  toast(custom ? `Base set to ${p.name}` : 'Base reset to city centre');
}

/* ============================== cost model ============================== */
function calcModes() {
  const T = S.trip, R = S.region, rc = S.reach;
  if (!T || !rc) return [];
  const pax = T.travelers, air = rc.air, road = rc.road, domestic = T.from.cc === T.to.cc;
  const interstate = !!(T.from.state && T.to.state && T.from.state !== T.to.state);
  const out = [];
  /* lo/hi are pre-tax base prices per unit; each end is taxed separately, the breakdown uses the midpoint. */
  const add = ({ id, ico, name, time, kind, lo, hi, units, ctx = {}, unit, per, note, roundTrip }) => {
    const c = k => ({ ...ctx, ...(ctx[k] || {}) });
    const pl = priceOf(kind, lo, c('lo')), ph = priceOf(kind, hi, c('hi')), pm = priceOf(kind, (lo + hi) / 2, c('mid'));
    out.push({
      id, ico, name, time, roundTrip, unit, note, breakdown: pm,
      lo: pl.total * units, hi: ph.total * units, taxMid: pm.tax * units,
      per: per(pl.total * units, ph.total * units), perUnit: range(pl.total, ph.total),
    });
  };
  const perPerson = (a, b) => `${range(a / pax, b / pax)} per person, all-in`;
  if (air >= R.flight.minKm) {
    const f = R.flight, one = f.base + f.perKm * air;
    add({ id: 'flight', ico: '✈️', name: 'Flight', time: air / f.speed * 60 + f.overhead, kind: 'flight', lo: one * f.lo, hi: one * f.hi, units: pax,
      unit: 'per person, one-way', per: perPerson,
      note: `Door-to-door includes ~${f.overhead / 60} h for airport transfers, check-in & security. Fares swing a lot with booking date.` });
  }
  if (road && domestic) {
    const { train: tr, bus, cab, selfDrive: sd } = R;
    if (road >= tr.minKm && road <= tr.maxKm) {
      add({ id: 'train', ico: '🚆', name: 'Train', time: road / tr.speed * 60 + 45, kind: 'train', lo: tr.base + tr.lo * road, hi: tr.base + tr.hi * road, units: pax,
        ctx: { lo: { cls: 'sl' }, hi: { cls: 'ac' }, mid: { cls: 'ac' } }, unit: 'per person, AC class', per: perPerson,
        note: 'Low end is a basic sleeper-type class, high end a premium AC class. Check station-to-hotel transfer time.' });
    }
    if (road >= bus.minKm && road <= bus.maxKm) {
      add({ id: 'bus', ico: '🚌', name: 'Bus', time: road / bus.speed * 60 + 20, kind: 'bus', lo: bus.base + bus.lo * road, hi: bus.base + bus.hi * road, units: pax,
        unit: 'per person', per: perPerson, note: 'Sleeper & AC coaches run overnight on many routes.' });
    }
    const cars = Math.ceil(pax / cab.seats), cost = Math.max(cab.min, cab.perKm * road);
    add({ id: 'cab', ico: '🚕', name: 'Cab (one-way drop)', time: road / cab.speed * 60 + 10, kind: 'cab', lo: cost * .9, hi: cost * 1.35, units: cars,
      ctx: { km: road, interstate }, unit: 'per car', per: (a, b) => `${range(a, b)} for ${cars} car${cars > 1 ? 's' : ''}, all-in`,
      note: `Door-to-door and flexible stops. Tolls${interstate ? ' and an inter-state permit' : ''} are included; parking and night charges may be extra.` });
    if (road <= sd.maxKm) {
      const days = nights() + 1;
      add({ id: 'self', ico: '🚗', name: 'Self-drive (round trip)', time: road / cab.speed * 60, kind: 'rental', lo: sd.perDay * days * .85, hi: sd.perDay * days * 1.4, units: cars, roundTrip: true,
        ctx: { km: road }, unit: `per car, ${days} days`, per: (a, b) => `${range(a, b)} for the whole trip, all-in`,
        note: `Rental for ${days} days plus GST, fuel and tolls both ways; you keep the car at the destination. A refundable deposit is usually held on top.` });
    }
  }
  const fast = Math.min(...out.filter(m => m.id !== 'self').map(m => m.time));
  const cheap = Math.min(...out.map(m => m.lo / (m.id === 'self' ? 2 : 1)));
  out.forEach(m => { m.fastest = m.time === fast; m.cheapest = m.lo / (m.id === 'self' ? 2 : 1) === cheap; });
  return out;
}

function calcBudget() {
  const T = S.trip, R = S.region, pax = T.travelers, tier = T.tier, n = nights(), days = n + 1;
  const cheapest = calcModes().find(m => m.cheapest);
  const rooms = Math.ceil(pax / 2);
  const row = (k, kind, lo, hi, sub, mult = 1) => ({
    k, sub, lo: priceOf(kind, lo).total * mult, hi: priceOf(kind, hi).total * mult, tax: priceOf(kind, (lo + hi) / 2).tax * mult,
  });
  const trips = cheapest ? (cheapest.roundTrip ? 1 : 2) : 0;
  const rows = [
    { k: '✈️ Getting there & back', sub: cheapest?.name, lo: (cheapest?.lo || 0) * trips, hi: (cheapest?.hi || 0) * trips, tax: (cheapest?.taxMid || 0) * trips },
    row('🏨 Stay', 'stay', R.stay.hotel * tier * .7, R.stay.hotel * tier * 1.4, `${rooms} room${rooms > 1 ? 's' : ''} × ${n} night${n > 1 ? 's' : ''}, incl. room taxes`, n * rooms),
    row('🍽️ Food', 'food', R.food * tier * pax * days * .8, R.food * tier * pax * days * 1.25, 'incl. GST & service charge'),
    row('🚕 Local transport', 'ride', R.local * Math.ceil(pax / 3) * days * .8, R.local * Math.ceil(pax / 3) * days * 1.4 * tier, 'cabs & autos, incl. tax'),
    row('🎟️ Sights & shopping', 'act', R.act * pax * days * tier * .7, R.act * pax * days * tier * 1.5, 'entry fees incl. tax'),
  ];
  const lo = rows.reduce((s, r) => s + r.lo, 0), hi = rows.reduce((s, r) => s + r.hi, 0), tax = rows.reduce((s, r) => s + r.tax, 0);
  return { rows, lo, hi, tax };
}

/* ============================== views ============================== */
function uiUpdate(cat) {
  renderLayerBar();
  if (S.tab === 'overview' || S.tab === 'reach') { if (cat === 'reach' || cat === 'overview' || S.tab === 'overview') renderContent(); }
  (TAB_CATS[S.tab] || []).forEach(refreshList);
  refreshMarkers();
}

function renderTabs() {
  $('#tabs').innerHTML = TABS.map(t =>
    `<button class="tab ${S.tab === t.id ? 'on' : ''}" role="tab" data-act="tab" data-tab="${t.id}"><span class="i">${t.ico}</span>${t.label}</button>`).join('');
}

function renderLayerBar() {
  $('#layerbar').innerHTML = LAYER_ORDER.map(cat => {
    const C = CATEGORIES[cat], n = S.places[cat]?.length;
    return `<button class="lchip ${S.layers.has(cat) ? 'on' : ''}" data-act="layer" data-cat="${cat}">${C.emoji} ${C.label}${S.loading[cat] ? ' <small>…</small>' : n != null ? ` <small>${n}</small>` : ''}</button>`;
  }).join('');
}

function setTab(tab, silent) {
  S.tab = tab;
  renderTabs();
  const cats = TAB_CATS[tab] || [];
  S.layers = new Set(tab === 'overview' ? ['see'] : cats);
  cats.forEach(c => S.places[c] ? fitCat(c) : loadCat(c));
  if (tab === 'reach' && S.trip) {
    map.fitBounds(L.latLngBounds([[S.trip.from.lat, S.trip.from.lon], [S.trip.to.lat, S.trip.to.lon]]), { padding: [60, 60], maxZoom: 12 });
  }
  if (tab === 'plan') for (let d = 1; d <= S.plan.days; d++) ensureRoute(d);
  renderLayerBar(); renderContent(); refreshMarkers();
  $('#content').scrollTop = 0;
  if (!silent) save();
}

function renderContent() {
  const V = { overview: viewOverview, reach: viewReach, stay: () => viewCat('stay'), move: viewMove, eat: () => viewCat('food'), shop: () => viewCat('shop'), see: () => viewCat('see'), plan: viewPlan };
  const st = $('#content').scrollTop;
  $('#content').innerHTML = (V[S.tab] || viewOverview)();
  $('#content').scrollTop = st;
  (TAB_CATS[S.tab] || []).forEach(refreshList);
}

const needTrip = () => `<div class="empty"><div style="font-size:42px">🗺️</div><p><b>Plan a trip first</b></p><p>Enter where you're travelling from and to in the bar above, then hit <b>Plan trip</b>.</p></div>`;
const spinner = t => `<div class="muted"><span class="spinner"></span>${t}</div>`;
const linkBtns = (arr, cls = 'btn sm') => arr.map(([n, u]) => `<a class="${cls}" target="_blank" rel="noopener" href="${esc(u)}">${esc(n)} ↗</a>`).join('');

function excerpt(text, max = 1400) {
  if (!text) return '';
  let t = text.replace(/^=+\s*(.*?)\s*=+$/gm, '$1:').replace(/\n{3,}/g, '\n\n').trim();
  if (t.length > max) t = t.slice(0, max).replace(/\s\S*$/, '') + '…';
  return esc(t);
}
function guideBlock(title, keys, max) {
  if (S.guide === null) return `<div class="box">${spinner('Loading local guide…')}</div>`;
  if (!S.guide) return '';
  const k = keys.find(k => S.guide.sections[k]);
  if (!k) return '';
  return `<details class="box" open><summary>${title}</summary><div class="excerpt">${excerpt(S.guide.sections[k], max)}</div>
    <div class="small muted">Source: <a href="${esc(S.guide.url)}" target="_blank" rel="noopener">Wikivoyage</a> (CC BY-SA)</div></details>`;
}

/* ---------- overview ---------- */
function viewOverview() {
  if (!S.trip) return welcome();
  const T = S.trip, rc = S.reach, n = nights();
  const wx = weatherStrip();
  const b = calcBudget();
  const max = Math.max(...b.rows.map(r => r.hi)) || 1;
  return `
  <div class="box hero">
    <h2>${esc(T.from.name)} → ${esc(T.to.name)}</h2>
    <div class="muted">${esc(T.to.label)}<br>${T.start ? esc(dayLabel(1)) : ''} · ${n} night${n > 1 ? 's' : ''} · ${T.travelers} traveller${T.travelers > 1 ? 's' : ''}</div>
    <div class="grid2" style="margin-top:10px">
      <div class="stat"><b>${rc ? fmtKm(rc.air) : '…'}</b><span>as the crow flies</span></div>
      <div class="stat"><b>${rc ? (rc.road ? fmtKm(rc.road) + ' · ' + fmtMin(rc.roadTime) : 'No road route') : '…'}</b><span>by road</span></div>
    </div>
  </div>
  ${wx}
  <h3>💰 Rough trip budget</h3>
  <div class="box">
    ${rc ? `<div class="bud">${b.rows.map(r => `<div>${r.k}<div class="small muted">${esc(r.sub || '')}</div></div><b>${range(r.lo, r.hi)}</b><div class="bar"><i style="width:${Math.max(4, r.hi / max * 100)}%"></i></div>`).join('')}
      <div class="tot">Total estimate (all taxes included)</div><div class="tot">${range(b.lo, b.hi)}</div>
      <div class="small muted">of which taxes, fees, fuel &amp; tolls ≈</div><div class="small muted">${money(b.tax)}</div></div>
      <p class="small muted" style="margin-top:8px">For ${T.travelers} traveller${T.travelers > 1 ? 's' : ''}, ${['budget', 'comfort', 'premium'][[.6, 1, 2].indexOf(T.tier)] || 'comfort'} style. Change travellers, dates or style in the top bar. Open <b>Get there</b> and <b>Stay</b> for itemised taxes.</p>
      <p class="note">${DISCLAIMER}</p>`
      : spinner('Working out routes…')}
  </div>
  <h3>🚀 Plan it</h3>
  <div class="grid2">
    ${[['reach', '✈️', 'Compare how to get there'], ['stay', '🏨', 'Hotels, homestays & Airbnb'], ['move', '🚕', 'Cabs, rentals & transit'], ['eat', '🍽️', 'Where to eat nearby'], ['shop', '🛍️', 'Markets & shopping'], ['see', '📍', 'Spots on the map']]
      .map(([t, i, l]) => `<button class="btn" data-act="tab" data-tab="${t}">${i} ${l}</button>`).join('')}
  </div>
  ${S.guide ? `<h3>📖 About ${esc(T.to.name)}</h3>${guideBlock('Understand the destination', ['understand'], 1200) || `<div class="box"><div class="excerpt">${excerpt(S.guide.intro, 900)}</div></div>`}` : ''}
  <h3>💡 Tips</h3>
  <div class="box"><ul style="margin:0;padding-left:18px">${S.region.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
}

function welcome() {
  return `
  <div class="box hero">
    <h2>Plan the whole trip in one place</h2>
    <p class="muted">Pick where you're going and see everything on a live map – with road distance &amp; travel time from your base to every spot.</p>
  </div>
  <div class="box"><ul style="margin:0;padding-left:18px;line-height:1.9">
    <li>✈️🚆🚌🚕 Compare flight, train, bus &amp; cab for your route</li>
    <li>🏨 Hotels, guest houses &amp; Airbnb-style stays with price estimates</li>
    <li>🚗 Local rentals, cabs, metro &amp; stations</li>
    <li>🍽️ Restaurants &amp; cafés (veg filter) · 🛍️ shopping places</li>
    <li>📍 Sights with distance &amp; drive time · 🗓️ day-by-day route planner</li>
  </ul></div>
  <h3>Try a sample trip</h3>
  <div class="chips">${SAMPLE_TRIPS.map(([a, b], i) => `<button class="chip" data-act="sample" data-i="${i}">${esc(a)} → ${esc(b)}</button>`).join('')}</div>
  <p class="note">Data: OpenStreetMap (places &amp; maps), OSRM (road routing), Wikivoyage, Open-Meteo. Fares &amp; room prices are planning estimates; booking buttons open the provider's own site for live prices.</p>`;
}

const WX = c => c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 57 ? '🌦️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌦️' : '⛈️';
function weatherStrip() {
  if (S.weather === null) return `<div class="box">${spinner('Checking forecast…')}</div>`;
  if (!S.weather) return '';
  const T = S.trip, s = T.start, e = T.end;
  let days = S.weather.filter(d => d.date >= s && d.date <= e);
  let cap = 'Forecast for your dates';
  if (!days.length) { days = S.weather.slice(0, 7); cap = 'Trip dates are beyond the 16-day forecast – showing the next 7 days'; }
  return `<h3>🌦️ Weather</h3><div class="wx">${days.map(d => `<div>${new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}<b>${WX(d.code)}</b>${Math.round(d.max)}°/${Math.round(d.min)}°<br>💧${d.rain ?? 0}%</div>`).join('')}</div><div class="small muted">${cap}</div>`;
}

/* ---------- get there ---------- */
function viewReach() {
  if (!S.trip) return needTrip();
  const T = S.trip, rc = S.reach, R = S.region;
  if (!rc) return spinner('Loading…');
  const modes = calcModes();
  const date = T.start || '';
  const ap = rc.airports, fi = ap.from[0]?.iata, ti = ap.to[0]?.iata;
  const fromN = T.from.city || T.from.name, toN = T.to.city || T.to.name;
  const gf = `https://www.google.com/travel/flights?q=${q(`Flights from ${fromN} to ${toN} on ${date}`)}`;
  const sky = fi && ti ? `https://www.skyscanner.net/transport/flights/${fi.toLowerCase()}/${ti.toLowerCase()}/${date.slice(2).replace(/-/g, '')}/?adults=${T.travelers}` : '';
  const kayak = fi && ti ? `https://www.kayak.com/flights/${fi}-${ti}/${date}/${T.travelers}adults` : '';
  const r2r = `https://www.rome2rio.com/map/${q(fromN)}/${q(toN)}`;
  const gmaps = m => `https://www.google.com/maps/dir/?api=1&origin=${q(fromN)}&destination=${q(toN)}&travelmode=${m}`;
  const links = {
    flight: [['Google Flights', gf], ...(sky ? [['Skyscanner', sky]] : []), ...(kayak ? [['Kayak', kayak]] : []), ...R.links.flightExtra],
    train: [...R.links.train, ['Google Maps transit', gmaps('transit')]],
    bus: [...R.links.bus, ['Google Maps transit', gmaps('transit')]],
    cab: [...R.links.cab, ['Google Maps', gmaps('driving')]],
    self: [...R.links.rent, ['Google Maps', gmaps('driving')]],
  };
  const card = m => `<div class="box mode"><div class="ico">${m.ico}</div><div>
    <div class="row between"><h4>${m.name}</h4><span class="small"><b>${fmtMin(m.time)}</b></span></div>
    <div class="price">${m.per}</div>
    <div class="row" style="margin:4px 0">${m.fastest ? '<span class="tag good">⚡ Fastest</span>' : ''}${m.cheapest ? '<span class="tag good">💰 Cheapest</span>' : ''}${m.roundTrip ? '' : `<span class="tag">Group total ${range(m.lo, m.hi)} one-way</span>`}<span class="tag good">all taxes &amp; fees included</span></div>
    <div class="small muted">${m.note}</div>
    ${breakdownHtml(m.breakdown, m.unit)}
    <div class="link-row">${linkBtns(links[m.id] || [])}</div></div></div>`;
  const apList = (arr, label) => arr.length ? `<div class="small"><b>${label}</b></div>${arr.map(a => `<div class="row between small" style="padding:2px 0"><span>✈ ${esc(a.name)} ${a.iata ? `<span class="tag">${esc(a.iata)}</span>` : ''}</span><span class="muted">${fmtKm(a.d)} from centre</span></div>`).join('')}` : '';
  return `
  <div class="box hero"><h2>${esc(fromN)} → ${esc(toN)}</h2>
    <div class="muted">${fmtKm(rc.air)} straight-line${rc.road ? ` · ${fmtKm(rc.road)} by road (${fmtMin(rc.roadTime)} driving)` : ' · no road connection found'} · ${T.travelers} traveller${T.travelers > 1 ? 's' : ''}${date ? ' · ' + esc(dayLabel(1)) : ''}</div></div>
  ${rc.loading && !modes.length ? spinner('Comparing options…') : ''}
  ${modes.map(card).join('') || (rc.loading ? '' : '<div class="box">For this distance, check the multi-modal planner below.</div>')}
  <div class="link-row"><a class="btn" target="_blank" rel="noopener" href="${r2r}">🌐 All options on Rome2Rio ↗</a></div>
  <h3>🛬 Airports &amp; stations</h3>
  <div class="box">
    ${rc.loading && !ap.from.length ? spinner('Finding airports…') : ''}
    ${apList(ap.from, `Near ${fromN}`)}${apList(ap.to, `Near ${toN}`)}
    ${!rc.loading && !ap.from.length && !ap.to.length ? '<div class="small muted">No commercial airports found within 100 km of either city.</div>' : ''}
    ${rc.stations.length ? `<div class="small" style="margin-top:8px"><b>Stations near ${esc(toN)}</b></div>${rc.stations.map(a => `<div class="row between small" style="padding:2px 0"><span>${a.sub === 'bus station' ? '🚌' : '🚉'} ${esc(a.name)}${a.code ? ` <span class="tag">${esc(a.code)}</span>` : ''}</span><span class="muted">${fmtKm(a.d)}</span></div>`).join('')}` : ''}
  </div>
  <p class="note">${DISCLAIMER}</p>`;
}

/* ---------- category tabs (stay / eat / shop / see) ---------- */
const SORTS = {
  stay: [['dist', 'Nearest'], ['price', 'Price ↑'], ['stars', 'Stars'], ['name', 'A–Z']],
  food: [['dist', 'Nearest'], ['name', 'A–Z']],
  shop: [['dist', 'Nearest'], ['name', 'A–Z']],
  see: [['notable', 'Top sights'], ['dist', 'Nearest'], ['name', 'A–Z']],
  rent: [['dist', 'Nearest'], ['name', 'A–Z']],
  transit: [['dist', 'Nearest'], ['name', 'A–Z']],
};
const RADII = [1, 2, 3, 5, 8, 12, 20, 30];

function toolbar(cat, withVeg) {
  const F = filt(cat), r = (S.radius[cat] ?? CATEGORIES[cat].radius) / 1000;
  const radii = [...new Set([...RADII, r])].sort((a, b) => a - b);
  return `<div class="toolbar">
    <input type="search" placeholder="Search ${CATEGORIES[cat].label.toLowerCase()}…" value="${esc(F.q)}" data-f="q" data-cat="${cat}">
    <select data-f="sort" data-cat="${cat}" title="Sort">${SORTS[cat].map(([v, l]) => `<option value="${v}" ${F.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <select data-f="radius" data-cat="${cat}" title="Search radius around city centre">${radii.map(v => `<option value="${v}" ${v === r ? 'selected' : ''}>${v} km</option>`).join('')}</select>
    ${withVeg ? `<label class="chip ${F.veg ? 'on' : ''}" style="cursor:pointer"><input type="checkbox" data-f="veg" data-cat="${cat}" ${F.veg ? 'checked' : ''} hidden>🥦 Veg only</label>` : ''}
  </div><div id="pchips-${cat}"></div>`;
}

function viewCat(cat) {
  if (!S.trip) return needTrip();
  const T = S.trip, city = T.to.city || T.to.name;
  let intro = '';
  if (cat === 'stay') {
    const d = { ci: T.start, co: T.end }, n = nights();
    const air = `https://www.airbnb.com/s/${q(city)}/homes?checkin=${d.ci}&checkout=${d.co}&adults=${T.travelers}`;
    const bk = `https://www.booking.com/searchresults.html?ss=${q(city)}&checkin=${d.ci}&checkout=${d.co}&group_adults=${T.travelers}&no_rooms=${Math.ceil(T.travelers / 2)}`;
    const ag = `https://www.agoda.com/search?textToSearch=${q(city)}&checkIn=${d.ci}&checkOut=${d.co}&adults=${T.travelers}`;
    const gh = `https://www.google.com/travel/search?q=${q('hotels in ' + city)}`;
    intro = `<div class="box"><h4>Book stays in ${esc(city)}</h4>
      <div class="small muted">${n} night${n > 1 ? 's' : ''} · ${T.travelers} guest${T.travelers > 1 ? 's' : ''} – dates are pre-filled on each site.</div>
      <div class="link-row">${linkBtns([['🏠 Airbnb', air], ['Booking.com', bk], ['Agoda', ag], ['Google Hotels', gh], ...S.region.links.stayExtra], 'btn sm solid')}</div>
      <p class="small muted" style="margin:8px 0 0">Below: stays listed on OpenStreetMap. Use <b>Apartment</b> / <b>Guest house</b> filters for Airbnb-style options. Prices are estimated <b>all-in per room/night</b> (room tax and platform fee included; hover the price for the split). Tap <b>💲 Prices</b> to compare rates on Google Hotels.</p>
      <p class="note" style="margin-top:8px">${DISCLAIMER}</p></div>`;
  } else if (cat === 'food') intro = guideBlock('🍛 What to eat here', ['eat'], 1100);
  else if (cat === 'shop') intro = guideBlock('🧺 What to buy here', ['buy'], 1100);
  else if (cat === 'see') intro = guideBlock('🏛️ Highlights', ['see'], 1100);
  return `${intro}${toolbar(cat, cat === 'food')}<div id="plist-${cat}"></div>`;
}

function refreshList(cat) {
  const list = $('#plist-' + cat); if (!list) return;
  const chipsEl = $('#pchips-' + cat);
  const F = filt(cat), C = CATEGORIES[cat];
  if (S.loading[cat]) { list.innerHTML = `<div class="box">${spinner(`Finding ${C.label.toLowerCase()} near ${esc(S.trip.to.name)}…`)}</div>`; if (chipsEl) chipsEl.innerHTML = ''; return; }
  if (S.errors[cat] && !S.places[cat]?.length) {
    list.innerHTML = `<div class="err">${esc(S.errors[cat])}</div><button class="btn sm" data-act="retry" data-cat="${cat}">↻ Retry</button>`;
    if (chipsEl) chipsEl.innerHTML = ''; return;
  }
  const all = S.places[cat] || [];
  if (chipsEl) {
    const counts = {};
    all.forEach(p => p.chips.forEach(c => counts[c] = (counts[c] || 0) + 1));
    const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 10);
    chipsEl.innerHTML = top.length ? `<div class="chips"><button class="chip ${F.chip ? '' : 'on'}" data-act="chip" data-cat="${cat}" data-v="">All ${all.length}</button>${top.map(([c, n]) => `<button class="chip ${F.chip === c ? 'on' : ''}" data-act="chip" data-cat="${cat}" data-v="${esc(c)}">${esc(c)} ${n}</button>`).join('')}</div>` : '';
  }
  const items = visible(cat), lim = S.limit[cat] || 20;
  list.innerHTML = (S.notes[cat] ? `<p class="note">${esc(S.notes[cat])}</p>` : '')
    + (items.length ? `<div class="small muted" style="margin:2px 0 6px">${items.length} result${items.length > 1 ? 's' : ''} · distance &amp; drive time from <b>${esc(S.base.name)}</b></div>` : '')
    + items.slice(0, lim).map(cardHtml).join('')
    + (items.length > lim ? `<button class="btn" data-act="more" data-cat="${cat}">Show ${Math.min(20, items.length - lim)} more</button>` : '')
    + (!items.length ? '<div class="empty">No matches. Try clearing filters or widening the radius.</div>' : '');
}

function distBlock(p) {
  const walk = p.dist <= 2.5 ? ` · 🚶 ${fmtMin(p.dist / 4.8 * 60)}` : '';
  return `<div class="pc-dist"><b>${p.approx ? '≈ ' : ''}${fmtKm(p.dist)}</b>🚗 ${p.approx ? '≈ ' : ''}${fmtMin(p.dur)}${walk}</div>`;
}

function detailTags(p) {
  const t = p.tags, out = [];
  const stars = parseFloat(t.stars);
  if (stars) out.push(`<span class="tag warn">${'★'.repeat(Math.min(5, Math.round(stars)))}</span>`);
  if (p.cat === 'stay') {
    const sp = stayPrice(stayBase(p));
    const tip = `Room ${money(sp.base)}${sp.lines.map(l => ` + ${l.label} ${money(l.amt)}`).join('')} = ${money(sp.total)}`;
    out.push(`<span class="tag good" title="${esc(tip)}">≈ ${money(sp.total)}/night incl. taxes</span>`);
  }
  if (p.notable && p.cat === 'see') out.push('<span class="tag good">★ Notable</span>');
  if (p.cat === 'food' && ['yes', 'only'].includes(t['diet:vegetarian'])) out.push('<span class="tag good">🥦 Veg-friendly</span>');
  if (t.cuisine && p.cat === 'food') out.push(`<span class="tag">${esc(t.cuisine.split(';').slice(0, 2).map(pretty).join(', '))}</span>`);
  if (t.opening_hours) out.push(`<span class="tag" title="${esc(t.opening_hours)}">🕒 ${esc(t.opening_hours.length > 30 ? t.opening_hours.slice(0, 28) + '…' : t.opening_hours)}</span>`);
  if (['wlan', 'yes', 'wifi'].includes(t.internet_access)) out.push('<span class="tag">📶 Wi-Fi</span>');
  if (t.wheelchair === 'yes') out.push('<span class="tag">♿</span>');
  if (t.fee === 'no') out.push('<span class="tag good">Free entry</span>');
  if (t.iata) out.push(`<span class="tag">${esc(t.iata)}</span>`);
  return out.join('');
}

function actionsHtml(p, popup) {
  const t = p.tags || {}, city = S.trip.to.city || S.trip.to.name;
  const inPlan = S.plan.items.some(i => i.key === p.key);
  const web = safeUrl(t.website || t['contact:website']);
  const tel = (t.phone || t['contact:phone'] || '').replace(/[^+\d]/g, '');
  const dir = `https://www.google.com/maps/dir/?api=1&origin=${S.base.lat},${S.base.lon}&destination=${p.lat},${p.lon}&travelmode=driving`;
  const rev = `https://www.google.com/maps/search/?api=1&query=${q(p.name + ' ' + city)}`;
  const px = `https://www.google.com/travel/search?q=${q(p.name + ' ' + city)}`;
  return `<button class="btn sm solid" data-act="plan-add" data-key="${p.key}">${inPlan ? '✓ In plan' : '➕ Add to plan'}</button>
    ${popup ? '' : `<button class="btn sm" data-act="focus" data-key="${p.key}">📍 Map</button>`}
    ${p.cat === 'stay' ? `<button class="btn sm" data-act="set-base" data-key="${p.key}">🏠 Use as base</button><a class="btn sm" target="_blank" rel="noopener" href="${px}">💲 Prices</a>` : ''}
    <a class="btn sm" target="_blank" rel="noopener" href="${dir}">🧭 Directions</a>
    ${['food', 'shop', 'see'].includes(p.cat) ? `<a class="btn sm" target="_blank" rel="noopener" href="${rev}">⭐ Reviews</a>` : ''}
    ${web ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(web)}">🔗 Website</a>` : ''}
    ${tel ? `<a class="btn sm" href="tel:${esc(tel)}">📞 Call</a>` : ''}`;
}

function cardHtml(p) {
  const C = CATEGORIES[p.cat], t = p.tags;
  const addr = [t['addr:street'], t['addr:suburb'] || t['addr:city']].filter(Boolean).join(', ');
  return `<article class="pcard" data-key="${p.key}">
    <div class="pc-top"><div class="pc-ico" style="--c:${C.color}22">${C.emoji}</div>
      <div class="pc-main"><h4>${esc(p.name)}</h4><div class="pc-sub">${esc(pretty(p.sub))}${addr ? ' · ' + esc(addr) : ''}</div></div>${distBlock(p)}</div>
    <div class="pc-meta">${detailTags(p)}</div>
    <div class="pc-actions">${actionsHtml(p, false)}</div></article>`;
}

function popupHtml(p) {
  return `<div class="pp"><h4>${esc(p.name)}</h4>
    <div class="small muted">${esc(pretty(p.sub))} · ${p.approx ? '≈ ' : ''}${fmtKm(p.dist)} · 🚗 ${p.approx ? '≈ ' : ''}${fmtMin(p.dur)}</div>
    <div class="pc-meta">${detailTags(p)}</div><div class="pc-actions">${actionsHtml(p, true)}</div></div>`;
}

/* ---------- get around ---------- */
function viewMove() {
  if (!S.trip) return needTrip();
  const R = S.region, d = nights() + 1;
  const fares = [['🚕', 'Cab / taxi', R.ride.cab], ['🛺', 'Auto / tuk-tuk', R.ride.auto], ['🏍️', 'Bike taxi', R.ride.bike]];
  return `
  <h3>🚕 Ride-hailing – typical fares</h3>
  <div class="box">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr class="muted small"><td></td><td>3 km</td><td>8 km</td><td>20 km</td></tr>
      ${fares.map(([i, n, [b, k]]) => `<tr style="border-top:1px solid var(--line)"><td style="padding:6px 0">${i} ${n}</td>${[3, 8, 20].map(km => `<td><b>${money(priceOf('ride', b + k * km).total)}</b></td>`).join('')}</tr>`).join('')}
    </table>
    <div class="link-row">${linkBtns(R.links.ride)}</div>
    <p class="small muted" style="margin:8px 0 0">Includes ${esc(R.tax.ride.map(r => r.label).join(', '))}. Excludes surge pricing and tolls; apps available vary by city.</p>
  </div>
  <h3>🚗 Rent a vehicle – daily rates</h3>
  <div class="box">
    ${R.rentDay.map(([i, n, [lo, hi]]) => { const a = priceOf('rentday', lo).total, b = priceOf('rentday', hi).total; return `<div style="padding:5px 0;border-bottom:1px solid var(--line)"><div class="row between"><span>${i} ${n}</span><b>${range(a, b)}/day</b></div><div class="small muted" style="text-align:right">${d} days ≈ ${range(a * d, b * d)}</div></div>`; }).join('')}
    <p class="small muted" style="margin:6px 0 0">Includes ${esc(R.tax.rentday.map(r => r.label).join(', '))}. Fuel, tolls and a refundable deposit are extra.</p>
    <div class="link-row">${linkBtns(R.links.rent, 'btn sm solid')}</div>
    <p class="small muted" style="margin:8px 0 0">You usually need a valid driving licence (and an IDP abroad), ID and a deposit.</p>
  </div>
  <h3>🔎 Rental shops &amp; garages found nearby</h3>
  ${toolbar('rent', false)}<div id="plist-rent"></div>
  <h3>🚉 Airports, stations &amp; metro</h3>
  ${toolbar('transit', false)}<div id="plist-transit"></div>`;
}

/* ---------- itinerary ---------- */
function viewPlan() {
  if (!S.trip) return needTrip();
  const P = S.plan;
  let html = `<div class="row between" style="margin-bottom:8px"><div class="small muted">Add spots from any tab with <b>➕ Add to plan</b>. New stops go to the highlighted day.</div></div>
    <div class="chips">${Array.from({ length: P.days }, (_, i) => i + 1).map(d => `<button class="chip ${P.active === d ? 'on' : ''}" data-act="plan-day" data-day="${d}">Day ${d}</button>`).join('')}
    <button class="chip" data-act="plan-addday">＋</button>${P.days > 1 ? '<button class="chip" data-act="plan-rmday">－</button>' : ''}</div>`;
  for (let d = 1; d <= P.days; d++) {
    const items = P.items.filter(i => i.day === d), color = DAY_COLORS[(d - 1) % DAY_COLORS.length], r = S.routes[d];
    const total = r && !r.pending ? `${fmtKm(r.dist)} · ${fmtMin(r.dur)} driving` : items.length ? 'calculating…' : '';
    html += `<div class="day"><div class="day-h"><div><span class="dot" style="background:${color}"></span><b>Day ${d}</b> <span class="muted small">${esc(dayLabel(d))}</span><div class="small muted">${total}</div></div>
      <div class="row">${items.length > 1 ? `<button class="btn sm" data-act="plan-opt" data-day="${d}">✨ Optimise</button>` : ''}${items.length ? `<a class="btn sm" target="_blank" rel="noopener" href="${gmapsRoute(items)}">🧭 Google Maps</a>` : ''}</div></div>`;
    if (!items.length) html += `<div class="stop muted">${P.active === d ? 'Nothing yet – add spots from the other tabs.' : 'Empty'}</div>`;
    else {
      html += `<div class="small muted">🏠 Start: ${esc(S.base.name)}</div>`;
      items.forEach((it, i) => {
        const leg = r?.legs?.[i];
        html += `<div class="leg">${leg ? `🚗 ${fmtKm(leg.dist)} · ${fmtMin(leg.dur)}${r.fail ? ' (est.)' : ''}` : '…'}</div>
          <div class="stop" data-key="${it.key}"><div class="n" style="background:${color}">${i + 1}</div>
          <div class="t"><b>${esc(it.place.name)}</b><div class="small muted">${esc(pretty(it.place.sub))}</div></div>
          <button class="ib" title="Show on map" data-act="focus" data-key="${it.key}">📍</button>
          <button class="ib" title="Move up" data-act="plan-up" data-key="${it.key}" ${i === 0 ? 'disabled' : ''}>↑</button>
          <button class="ib" title="Move down" data-act="plan-down" data-key="${it.key}" ${i === items.length - 1 ? 'disabled' : ''}>↓</button>
          <button class="ib" title="Remove" data-act="plan-remove" data-key="${it.key}">✕</button></div>`;
      });
      const back = r?.legs?.[items.length];
      html += `<div class="leg">${back ? `🚗 ${fmtKm(back.dist)} · ${fmtMin(back.dur)}` : '…'}</div><div class="small muted">🏠 Back to ${esc(S.base.name)}</div>`;
    }
    html += '</div>';
  }
  html += `<div class="row no-print"><button class="btn solid" data-act="plan-copy">📋 Copy itinerary</button><button class="btn" data-act="plan-print">🖨️ Print</button>${P.items.length ? '<button class="btn" data-act="plan-clear">🗑️ Clear all</button>' : ''}</div>`;
  return html;
}

const gmapsRoute = items => 'https://www.google.com/maps/dir/' + [S.base, ...items.map(i => i.place), S.base].map(p => `${p.lat},${p.lon}`).join('/');

async function ensureRoute(day) {
  const items = S.plan.items.filter(i => i.day === day);
  if (!items.length) { delete S.routes[day]; return; }
  const pts = [S.base, ...items.map(i => i.place), S.base];
  const sig = pts.map(p => p.lat.toFixed(5) + p.lon.toFixed(5)).join('|');
  if (S.routes[day]?.sig === sig) return;
  S.routes[day] = { sig, pending: true };
  const token = S.token;
  let res;
  try { res = { sig, ...(await API.osrmRoute(pts, true)) }; }
  catch {
    const legs = pts.slice(1).map((p, i) => { const dist = hav(pts[i], p) * 1.35; return { dist, dur: dist / 28 * 60 }; });
    res = { sig, fail: true, legs, coords: pts.map(p => [p.lat, p.lon]), dist: legs.reduce((s, l) => s + l.dist, 0), dur: legs.reduce((s, l) => s + l.dur, 0) };
  }
  if (token !== S.token || S.routes[day]?.sig !== sig) return;
  S.routes[day] = res;
  drawPlan();
  if (S.tab === 'plan') renderContent();
}
function replan(day) {
  drawPlan(); save();
  for (let d = 1; d <= S.plan.days; d++) ensureRoute(d);
  if (S.tab === 'plan') renderContent();
  renderListsIfVisible();
}
const renderListsIfVisible = () => (TAB_CATS[S.tab] || []).forEach(refreshList);

function planText() {
  const T = S.trip, P = S.plan;
  let t = `TPVM trip:${T.from.name} → ${T.to.name} (${T.start} to ${T.end}, ${T.travelers} traveller${T.travelers > 1 ? 's' : ''})\nBase: ${S.base.name}\n`;
  for (let d = 1; d <= P.days; d++) {
    const items = P.items.filter(i => i.day === d), r = S.routes[d];
    t += `\nDay ${d} – ${dayLabel(d)}\n`;
    if (!items.length) t += '  (free day)\n';
    items.forEach((it, i) => { const l = r?.legs?.[i]; t += `  ${i + 1}. ${it.place.name} (${pretty(it.place.sub)})${l ? ` – ${fmtKm(l.dist)}, ${fmtMin(l.dur)} from previous` : ''}\n`; });
  }
  return t;
}

/* ============================== persistence ============================== */
function save() {
  try {
    localStorage.setItem('tpvm.v1',JSON.stringify({ trip: S.trip, base: S.base, plan: S.plan, tab: S.tab }));
  } catch { /* storage unavailable */ }
}

/* ============================== events ============================== */
const ACT = {
  tab: el => setTab(el.dataset.tab),
  sample: async el => {
    const [a, b] = SAMPLE_TRIPS[+el.dataset.i];
    $('#fromInput').value = a; $('#toInput').value = b;
    $('#fromInput')._place = $('#toInput')._place = null;
    startTrip();
  },
  focus: el => focusPlace(el.dataset.key),
  layer: el => {
    const cat = el.dataset.cat;
    if (S.layers.has(cat)) S.layers.delete(cat); else { S.layers.add(cat); S.trip && loadCat(cat); }
    renderLayerBar(); refreshMarkers();
  },
  chip: el => { const F = filt(el.dataset.cat); F.chip = el.dataset.v; S.limit[el.dataset.cat] = 20; refreshList(el.dataset.cat); refreshMarkers(); },
  more: el => { S.limit[el.dataset.cat] = (S.limit[el.dataset.cat] || 20) + 20; refreshList(el.dataset.cat); },
  retry: el => { S.places[el.dataset.cat] = null; loadCat(el.dataset.cat, true); },
  'set-base': el => { const p = findPlace(el.dataset.key); if (p) setBase(p); },
  'reset-base': () => setBase({ name: `${S.trip.to.name} centre`, lat: S.trip.to.lat, lon: S.trip.to.lon }, false),
  'plan-add': el => {
    const p = findPlace(el.dataset.key); if (!p) return;
    if (S.plan.items.some(i => i.key === p.key)) { toast('Already in your plan'); return; }
    S.plan.items.push({ key: p.key, day: S.plan.active, place: { key: p.key, cat: p.cat, name: p.name, lat: p.lat, lon: p.lon, sub: p.sub, tags: { website: p.tags.website, phone: p.tags.phone }, dist: p.dist, dur: p.dur, approx: p.approx } });
    toast(`Added to Day ${S.plan.active}`);
    map.closePopup(); replan();
    renderListsIfVisible();
  },
  'plan-remove': el => { S.plan.items = S.plan.items.filter(i => i.key !== el.dataset.key); replan(); },
  'plan-up': el => movePlan(el.dataset.key, -1),
  'plan-down': el => movePlan(el.dataset.key, 1),
  'plan-day': el => { S.plan.active = +el.dataset.day; save(); renderContent(); toast(`New stops will go to Day ${S.plan.active}`); },
  'plan-addday': () => { if (S.plan.days < 10) { S.plan.days++; S.plan.active = S.plan.days; replan(); } },
  'plan-rmday': () => {
    const last = S.plan.days; if (last < 2) return;
    S.plan.items.forEach(i => { if (i.day === last) i.day = last - 1; });
    S.plan.days--; S.plan.active = Math.min(S.plan.active, S.plan.days); delete S.routes[last]; replan();
  },
  'plan-opt': el => {
    const d = +el.dataset.day, items = S.plan.items.filter(i => i.day === d), ordered = [];
    let cur = S.base; const left = items.slice();
    while (left.length) {
      let bi = 0, bd = Infinity;
      left.forEach((it, i) => { const k = hav(cur, it.place); if (k < bd) { bd = k; bi = i; } });
      const [n] = left.splice(bi, 1); ordered.push(n); cur = n.place;
    }
    S.plan.items = S.plan.items.filter(i => i.day !== d).concat(ordered);
    replan(); toast('Stops re-ordered by nearest-next');
  },
  'plan-copy': async () => { try { await navigator.clipboard.writeText(planText()); toast('Itinerary copied'); } catch { toast('Copy blocked by the browser'); } },
  'plan-print': () => window.print(),
  'plan-clear': () => { if (confirm('Remove all stops from every day?')) { S.plan.items = []; S.routes = {}; replan(); } },
};

function movePlan(key, dir) {
  const it = S.plan.items.find(i => i.key === key); if (!it) return;
  const idxs = S.plan.items.map((x, i) => x.day === it.day ? i : -1).filter(i => i >= 0);
  const pos = idxs.indexOf(S.plan.items.indexOf(it)), swap = idxs[pos + dir];
  if (swap == null) return;
  const a = S.plan.items, i = idxs[pos];
  [a[i], a[swap]] = [a[swap], a[i]];
  replan();
}

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (el && ACT[el.dataset.act]) { e.preventDefault(); ACT[el.dataset.act](el); }
});

let searchTimer;
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.f === 'q') {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { filt(el.dataset.cat).q = el.value.trim(); S.limit[el.dataset.cat] = 20; refreshList(el.dataset.cat); refreshMarkers(); }, 200);
  }
});
document.addEventListener('change', e => {
  const el = e.target, cat = el.dataset.cat;
  if (el.dataset.f === 'sort') { filt(cat).sort = el.value; refreshList(cat); }
  else if (el.dataset.f === 'radius') { S.radius[cat] = +el.value * 1000; S.places[cat] = null; loadCat(cat, true); }
  else if (el.dataset.f === 'veg') { filt(cat).veg = el.checked; el.parentElement.classList.toggle('on', el.checked); refreshList(cat); refreshMarkers(); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.matches('.toolbar input[type=search]')) e.preventDefault();
});

/* ---------- trip form ---------- */
function setupAC(inputId, suggId) {
  const input = $(inputId), ul = $(suggId); let timer;
  input.addEventListener('input', () => {
    input._place = null; clearTimeout(timer);
    const v = input.value.trim();
    if (v.length < 3) { ul.classList.remove('open'); return; }
    timer = setTimeout(async () => {
      try {
        const r = await API.geocode(v);
        ul._r = r;
        ul.innerHTML = r.map((x, i) => `<li data-i="${i}">${esc(x.label)}</li>`).join('') || '<li class="muted">No matches</li>';
        ul.classList.add('open');
      } catch { /* ignore */ }
    }, 450);
  });
  ul.addEventListener('mousedown', e => {
    const li = e.target.closest('li[data-i]'); if (!li) return;
    input._place = ul._r[+li.dataset.i]; input.value = input._place.label; ul.classList.remove('open');
  });
  input.addEventListener('blur', () => setTimeout(() => ul.classList.remove('open'), 160));
}

async function resolvePlace(input) {
  if (input._place) return input._place;
  const r = await API.geocode(input.value.trim());
  return r[0] || null;
}

async function startTrip() {
  const btn = $('#planBtn'); btn.disabled = true; btn.textContent = 'Finding…';
  try {
    const from = await resolvePlace($('#fromInput')), to = await resolvePlace($('#toInput'));
    if (!to) { toast('Could not find that destination'); return; }
    if (!from) { toast('Could not find the origin city'); return; }
    $('#fromInput').value = from.label; $('#toInput').value = to.label;
    S.trip = { from, to, ...formValues() };
    activateTrip(false);
  } catch (err) {
    toast('Lookup failed – check your connection and try again');
  } finally { btn.disabled = false; btn.textContent = 'Plan trip'; }
}
const formValues = () => ({
  start: $('#startDate').value, end: $('#endDate').value,
  travelers: Math.max(1, Math.min(20, +$('#travelers').value || 1)), tier: +$('#tier').value || 1,
});

function syncForm() {
  if (!S.trip) return;
  Object.assign(S.trip, formValues());
  S.region = regionFor(S.trip);
  const n = nights();
  if (S.plan.days < n + 1 && !S.plan.items.length) S.plan.days = n + 1;
  save(); renderContent(); renderListsIfVisible();
}

/* ============================== init ============================== */
function init() {
  initMap(); renderTabs(); renderLayerBar();
  const today = new Date(), s = new Date(today), e = new Date(today);
  s.setDate(s.getDate() + 14); e.setDate(e.getDate() + 17);
  $('#startDate').value = iso(s); $('#endDate').value = iso(e);
  $('#startDate').min = iso(today);
  setupAC('#fromInput', '#fromSugg'); setupAC('#toInput', '#toSugg');
  $('#tripForm').addEventListener('submit', ev => { ev.preventDefault(); startTrip(); });
  ['#startDate', '#endDate', '#travelers', '#tier'].forEach(id => $(id).addEventListener('change', syncForm));

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('tpvm.v1') || localStorage.getItem('wayfarer.v1') || 'null'); } catch { /* ignore */ }
  if (saved?.trip?.to && saved.trip.from) {
    S.trip = saved.trip; S.plan = saved.plan || S.plan; S.base = saved.base; S.tab = saved.tab || 'overview';
    $('#fromInput').value = S.trip.from.label; $('#toInput').value = S.trip.to.label;
    $('#fromInput')._place = S.trip.from; $('#toInput')._place = S.trip.to;
    if (S.trip.start) $('#startDate').value = S.trip.start;
    if (S.trip.end) $('#endDate').value = S.trip.end;
    $('#travelers').value = S.trip.travelers; $('#tier').value = S.trip.tier;
    activateTrip(true);
  } else renderContent();
}
init();
})();
