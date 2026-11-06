/* TPVM – application logic: state, map, views, live search, itinerary. */
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

/* ============================== icons (inline SVG, 24px grid) ============================== */
const IC = {
  compass: '<circle cx="12" cy="12" r="10"/><path d="m16.24 7.76-1.8 5.41a2 2 0 0 1-1.27 1.27L7.76 16.24l1.8-5.41a2 2 0 0 1 1.27-1.27z"/>',
  plane: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>',
  bed: '<path d="M2 4v16M2 8h18a2 2 0 0 1 2 2v10M2 17h20M6 8v9"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>',
  utensils: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>',
  bag: '<path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4zM3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0z"/><circle cx="12" cy="10" r="3"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  home: '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M9 22V12h6v10"/>',
  nav: '<polygon points="3 11 22 2 13 21 11 13 3 11"/>',
  train: '<rect x="5" y="3" width="14" height="14" rx="3"/><path d="M5 11h14M9 21l1.5-4M15 21l-1.5-4"/><circle cx="9" cy="14" r=".8"/><circle cx="15" cy="14" r=".8"/>',
  bus: '<rect x="4" y="3" width="16" height="14" rx="2.5"/><path d="M4 10h16M7 21v-4M17 21v-4"/><circle cx="8" cy="13.5" r=".8"/><circle cx="16" cy="13.5" r=".8"/>',
  key: '<circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6M15.5 7.5l3 3L22 7l-3-3"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>',
  clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
  wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h13v4"/><path d="M3 5v14a2 2 0 0 0 2 2h15V7"/><path d="M16 14h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  x: '<path d="M18 6 6 18M6 6l12 12"/>',
  up: '<path d="m5 12 7-7 7 7M12 19V5"/>',
  down: '<path d="m19 12-7 7-7-7M12 5v14"/>',
  phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z"/>',
  star: '<polygon points="12 2 15.1 8.3 22 9.3 17 14.1 18.2 21 12 17.8 5.8 21 7 14.1 2 9.3 8.9 8.3 12 2"/>',
  link: '<path d="M15 3h6v6M10 14 21 3M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>',
  copy: '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  printer: '<path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
  trash: '<path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6"/>',
  wand: '<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 17l.7 1.8 1.8.7-1.8.7L19 22l-.7-1.8-1.8-.7 1.8-.7z"/>',
  leaf: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10z"/><path d="M2 21c0-3 1.9-5.4 5.1-6.8"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8M21 3v5h-5"/>',
  route: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  fuel: '<path d="M3 22h12M4 9h10M14 22V4a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v18"/><path d="M14 13h2a2 2 0 0 1 2 2v2a2 2 0 0 0 2 2 2 2 0 0 0 2-2V9.8a2 2 0 0 0-.6-1.4L18 5"/>',
  coffee: '<path d="M17 8h1a4 4 0 1 1 0 8h-1"/><path d="M3 8h14v9a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4z"/><path d="M6 2v2M10 2v2M14 2v2"/>',
  pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7z"/><path d="m8.5 8.5 7 7"/>',
  cross: '<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M12 8v8M8 12h8"/>',
  banknote: '<rect x="2" y="6" width="20" height="12" rx="2"/><circle cx="12" cy="12" r="2"/><path d="M6 12h.01M18 12h.01"/>',
  landmark: '<path d="M3 22h18M6 18v-7M10 18v-7M14 18v-7M18 18v-7M12 2 3 7h18z"/>',
  temple: '<path d="M12 2v3M5 21V11l7-5 7 5v10M3 21h18M9 21v-6h6v6"/>',
  tree: '<circle cx="12" cy="9" r="6"/><path d="M12 15v7M9 22h6"/>',
  cart: '<circle cx="8" cy="21" r="1"/><circle cx="19" cy="21" r="1"/><path d="M2.05 2.05h2l2.66 12.42a2 2 0 0 0 2 1.58h9.78a2 2 0 0 0 1.95-1.57l1.65-7.43H5.12"/>',
  camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
  fort: '<path d="M3 22V8l3 2V5h3v3h6V5h3v5l3-2v14zM10 22v-5a2 2 0 0 1 4 0v5"/>',
  waves: '<path d="M2 6c.6.5 1.2 1 2.5 1C7 7 7 5 9.5 5c2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 12c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1M2 18c.6.5 1.2 1 2.5 1 2.5 0 2.5-2 5-2 2.6 0 2.4 2 5 2 2.5 0 2.5-2 5-2 1.3 0 1.9.5 2.5 1"/>',
  building: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M9 22v-4h6v4M8 6h.01M12 6h.01M16 6h.01M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01"/>',
  burger: '<path d="M4 11a8 7 0 0 1 16 0z"/><path d="M3 15h18M5 15v1a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-1"/>',
  icecream: '<path d="m7 11 4.08 10.35a1 1 0 0 0 1.84 0L17 11"/><path d="M17 7A5 5 0 0 0 7 7"/><path d="M17 7a2 2 0 0 1 0 4H7a2 2 0 0 1 0-4"/>',
  cake: '<path d="M20 21v-8a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8M4 16s.5-1 2-1 2.5 2 4 2 2.5-2 4-2 2.5 2 4 2 2-1 2-1M2 21h20M7 8v3M12 8v3M17 8v3M7 4h.01M12 4h.01M17 4h.01"/>',
  wine: '<path d="M8 22h8M12 15v7M12 15a5 5 0 0 0 5-5c0-2-.5-4-2-8H9c-1.5 4-2 6-2 8a5 5 0 0 0 5 5z"/>',
  shirt: '<path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/>',
  gem: '<path d="M6 3h12l4 6-10 13L2 9z"/><path d="M11 3 8 9l4 13 4-13-3-6M2 9h20"/>',
  book: '<path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20"/>',
  gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"/>',
  parking: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
  mountain: '<path d="m8 3 4 8 5-5 5 15H2z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  bike: '<circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm-3 11.5V14l-3-3 4-3 2 3h2"/>',
  zap: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  wrench: '<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>',
  mail: '<rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 6L2 7"/>',
  toilet: '<circle cx="12" cy="5" r="2"/><path d="M9 22v-7H7l2-7h6l2 7h-2v7M12 22v-7"/>',
};
const ico = (n, c = '') => `<svg class="ic ${c}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n] || ''}</svg>`;
const CAT_ICON = { see: 'pin', stay: 'bed', food: 'utensils', shop: 'bag', rent: 'key', transit: 'train' };

/* Every kind of place gets its own icon and colour (keyed by the OSM tag value). */
const SUB_ICON = {
  fuel: ['fuel', '#dc2626'], charging_station: ['zap', '#16a34a'], atm: ['banknote', '#0f766e'], bank: ['landmark', '#475569'],
  pharmacy: ['pill', '#16a34a'], hospital: ['cross', '#dc2626'], clinic: ['cross', '#ef4444'], doctors: ['cross', '#ef4444'], dentist: ['cross', '#ef4444'],
  cafe: ['coffee', '#92400e'], restaurant: ['utensils', '#ea580c'], fast_food: ['burger', '#f59e0b'], food_court: ['utensils', '#ea580c'],
  ice_cream: ['icecream', '#ec4899'], bar: ['wine', '#7c3aed'], pub: ['wine', '#7c3aed'],
  bakery: ['cake', '#db2777'], confectionery: ['cake', '#db2777'], pastry: ['cake', '#db2777'],
  hotel: ['bed', '#7c3aed'], hostel: ['bed', '#8b5cf6'], motel: ['bed', '#6d28d9'], guest_house: ['home', '#a855f7'], chalet: ['home', '#a855f7'],
  apartment: ['building', '#6d28d9'], resort: ['sun', '#d946ef'],
  mall: ['bag', '#db2777'], department_store: ['bag', '#db2777'], marketplace: ['cart', '#e11d48'], supermarket: ['cart', '#e11d48'],
  clothes: ['shirt', '#be185d'], boutique: ['shirt', '#be185d'], fabric: ['shirt', '#be185d'], jewelry: ['gem', '#c026d3'], books: ['book', '#0369a1'],
  gift: ['gift', '#f43f5e'], souvenir: ['gift', '#f43f5e'], handicraft: ['gift', '#f43f5e'], craft: ['gift', '#f43f5e'], antiques: ['gem', '#a21caf'], art: ['gift', '#f43f5e'],
  attraction: ['camera', '#0284c7'], museum: ['landmark', '#0369a1'], gallery: ['landmark', '#0369a1'], theme_park: ['camera', '#0ea5e9'], zoo: ['camera', '#0ea5e9'], aquarium: ['waves', '#0ea5e9'],
  fort: ['fort', '#b45309'], castle: ['fort', '#b45309'], palace: ['fort', '#b45309'], monument: ['landmark', '#a16207'], memorial: ['landmark', '#a16207'],
  archaeological_site: ['fort', '#92400e'], ruins: ['fort', '#92400e'], viewpoint: ['mountain', '#0891b2'], beach: ['waves', '#0ea5e9'],
  park: ['tree', '#16a34a'], garden: ['tree', '#15803d'], nature_reserve: ['tree', '#15803d'], place_of_worship: ['temple', '#d97706'],
  car_rental: ['key', '#059669'], motorcycle_rental: ['bike', '#059669'], bicycle_rental: ['bike', '#059669'], boat_rental: ['waves', '#059669'], rental: ['key', '#059669'],
  airport: ['plane', '#475569'], railway_station: ['train', '#475569'], metro_station: ['train', '#2563eb'], bus_station: ['bus', '#475569'], bus_stop: ['bus', '#475569'],
  parking: ['parking', '#64748b'], police: ['shield', '#1d4ed8'], post_office: ['mail', '#b91c1c'], toilets: ['toilet', '#0d9488'], car_repair: ['wrench', '#78716c'],
};
const placeIcon = p => {
  const hit = SUB_ICON[String(p.sub || '').toLowerCase().replace(/\s+/g, '_')];
  return hit ? { ic: hit[0], color: hit[1] } : { ic: CAT_ICON[p.cat] || 'pin', color: CATEGORIES[p.cat]?.color || '#0d9488' };
};

/* ============================== state ============================== */
const TABS = [
  { id: 'overview', ico: 'compass', label: 'Overview' },
  { id: 'search', ico: 'search', label: 'Search' },
  { id: 'reach', ico: 'plane', label: 'Get there' },
  { id: 'along', ico: 'route', label: 'On the way' },
  { id: 'stay', ico: 'bed', label: 'Stay' },
  { id: 'move', ico: 'car', label: 'Get around' },
  { id: 'eat', ico: 'utensils', label: 'Eat' },
  { id: 'shop', ico: 'bag', label: 'Shop' },
  { id: 'see', ico: 'pin', label: 'Explore' },
  { id: 'plan', ico: 'calendar', label: 'Itinerary' },
];
const TAB_CATS = { stay: ['stay'], eat: ['food'], shop: ['shop'], see: ['see'], move: ['rent', 'transit'] };
const freshSearch = () => ({ q: '', seq: 0, loading: false, done: false, places: [], voy: [], wp: [], wide: false, errP: false, prev: 'overview' });
const freshAlong = () => ({ topic: '', q: '', seq: 0, loading: false, progress: '', places: [], note: '', limit: 30, done: false });

const S = {
  trip: null, region: REGIONS.DEFAULT, base: null, tab: 'overview',
  places: {}, loading: {}, errors: {}, notes: {}, radius: {}, filters: {}, limit: {},
  layers: new Set(), plan: { days: 3, items: [], active: 1 }, routes: {},
  reach: null, guide: null, weather: null, token: 0, mode: null, search: freshSearch(), along: freshAlong(),
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
let baseGroup, planGroup, routeGroup, reachGroup, searchGroup, alongGroup;

const pinIcon = (inner, cls = '', color = '#0d9488', size = 30) => L.divIcon({
  className: '', html: `<div class="pin ${cls}" style="--c:${color}">${inner}</div>`,
  iconSize: [size, size], iconAnchor: [size / 2, size / 2], popupAnchor: [0, -size / 2 + 2],
});
const labelIcon = html => L.divIcon({ className: 'lbl', html, iconSize: [0, 0] });

function initMap() {
  map = L.map('map', { zoomControl: false }).setView([22.5, 79], 5);
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }).addTo(map);
  routeGroup = L.layerGroup().addTo(map);
  reachGroup = L.layerGroup().addTo(map);
  LAYER_ORDER.forEach(c => groups[c] = L.layerGroup().addTo(map));
  searchGroup = L.layerGroup().addTo(map);
  alongGroup = L.layerGroup().addTo(map);
  planGroup = L.layerGroup().addTo(map);
  baseGroup = L.layerGroup().addTo(map);
}

function refreshMarkers() {
  if (!map) return;
  const active = TAB_CATS[S.tab] || [];
  LAYER_ORDER.forEach(cat => {
    const g = groups[cat]; g.clearLayers();
    if (!S.layers.has(cat)) return;
    const list = active.includes(cat) ? visible(cat) : (S.places[cat] || []).slice().sort((a, b) => a.dist - b.dist).slice(0, 80);
    list.forEach(p => {
      const pi = placeIcon(p);
      const m = L.marker([p.lat, p.lon], { icon: pinIcon(ico(pi.ic), '', pi.color, 26) });
      m.bindPopup(() => popupHtml(p));
      m.on('click', () => flashCard(p.key));
      markers[p.key] = m; g.addLayer(m);
    });
  });
  baseGroup.clearLayers();
  if (S.base && S.trip) {
    L.marker([S.base.lat, S.base.lon], { icon: pinIcon(ico('home'), 'base', '#0f172a', 36), zIndexOffset: 800 })
      .bindPopup(`<div class="pp"><h4>${ico('home')} Your base</h4><div class="small muted">${esc(S.base.name)}<br>All distances &amp; times are measured from here.</div>
        ${S.base.custom ? '<div class="pc-actions"><button class="btn sm" data-act="reset-base">Reset to city centre</button></div>' : ''}</div>`)
      .addTo(baseGroup);
  }
  drawJourney();
  drawSearch();
  drawAlong();
  drawPlan();
}

/* ---------- the journey: origin -> destination ---------- */
function greatCircle(a, b, n = 64) {
  const p1 = rad(a.lat), l1 = rad(a.lon), p2 = rad(b.lat), l2 = rad(b.lon);
  const d = 2 * Math.asin(Math.sqrt(Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin((l2 - l1) / 2) ** 2));
  if (d < 1e-6) return [[a.lat, a.lon], [b.lat, b.lon]];
  const pts = [];
  for (let i = 0; i <= n; i++) {
    const f = i / n, A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(p1) * Math.cos(l1) + B * Math.cos(p2) * Math.cos(l2);
    const y = A * Math.cos(p1) * Math.sin(l1) + B * Math.cos(p2) * Math.sin(l2);
    const z = A * Math.sin(p1) + B * Math.sin(p2);
    pts.push([Math.atan2(z, Math.hypot(x, y)) * 180 / Math.PI, Math.atan2(y, x) * 180 / Math.PI]);
  }
  return pts;
}

/** Which travel option is highlighted on the map (defaults to the cheapest). */
const selMode = () => S.mode || calcModes().find(m => m.cheapest)?.id || (S.reach?.road ? 'cab' : 'flight');
const journeyKind = () => (selMode() === 'flight' || !S.reach?.coords?.length) ? 'air' : 'road';
const onJourneyTab = () => S.tab === 'overview' || S.tab === 'reach' || S.tab === 'along';
let jSig = '';

/* The journey line is drawn on every tab so it never disappears: in full detail (labels, airports, stations)
   on the journey tabs, as a thinner line with small end pins everywhere else. */
function drawJourney() {
  const hud = $('#hud');
  if (!S.trip) { reachGroup.clearLayers(); jSig = ''; hud.classList.remove('show'); return; }
  const full = onJourneyTab();
  const { from, to } = S.trip, rc = S.reach, kind = journeyKind(), air = hav(from, to);
  const fromN = from.city || from.name, toN = to.city || to.name;
  const timeAir = air / S.region.flight.speed * 60 + S.region.flight.overhead;
  const text = kind === 'road' && rc?.road ? `${fmtKm(rc.road)} · ${fmtMin(rc.roadTime)} by road` : `${fmtKm(air)} · ~${fmtMin(timeAir)} by air`;
  hud.innerHTML = `<span>${esc(fromN)} → ${esc(toN)}</span><b>${text}</b>`;
  hud.classList.toggle('show', full);
  const sig = [full ? S.tab : 'thin', from.lat, to.lat, kind, rc?.coords?.length || 0, rc?.airports.from.length, rc?.airports.to.length, rc?.stations.length].join('|');
  if (sig === jSig) return;
  jSig = sig;
  reachGroup.clearLayers();

  const arc = greatCircle(from, to), showArc = air >= 150;
  const w = full ? 1 : .7;
  if (showArc) L.polyline(arc, { color: '#6366f1', weight: (kind === 'air' ? 4 : 2.5) * w, opacity: kind === 'air' ? .95 : .4, lineCap: 'round', className: kind === 'air' ? 'flow' : '', interactive: false }).addTo(reachGroup);
  if (rc?.coords?.length) {
    L.polyline(rc.coords, { color: '#fff', weight: (kind === 'road' ? 10 : 7) * w, opacity: .9, interactive: false }).addTo(reachGroup);
    L.polyline(rc.coords, { color: kind === 'road' ? '#0d9488' : '#94a3b8', weight: (kind === 'road' ? 5 : 3.5) * w, opacity: kind === 'road' ? 1 : .8, interactive: false }).addTo(reachGroup);
  } else if (!showArc) {
    L.polyline([[from.lat, from.lon], [to.lat, to.lon]], { color: '#0d9488', weight: 4 * w, dashArray: '2 9', lineCap: 'round', interactive: false }).addTo(reachGroup);
  }
  if (full) {
    const mid = kind === 'road' && rc?.coords?.length ? rc.coords[Math.floor(rc.coords.length / 2)] : arc[Math.floor(arc.length / 2)];
    L.marker(mid, { icon: labelIcon(`<div class="routelabel">${text}</div>`), interactive: false, zIndexOffset: 400 }).addTo(reachGroup);
    const end = (p, letter, color, label) => L.marker([p.lat, p.lon], { icon: labelIcon(`<div class="endpin" style="--c:${color}"><i>${letter}</i>${esc(label)}</div>`), zIndexOffset: 900 })
      .bindPopup(`<b>${esc(p.label)}</b>`).addTo(reachGroup);
    end(from, 'A', '#0d9488', fromN); end(to, 'B', '#e11d48', toN);
  } else {
    const dot = (p, letter, color) => L.marker([p.lat, p.lon], { icon: pinIcon(letter, '', color, 22), zIndexOffset: 300 }).bindPopup(`<b>${esc(p.label)}</b>`).addTo(reachGroup);
    dot(from, 'A', '#0d9488'); dot(to, 'B', '#e11d48');
  }
  if (S.tab === 'reach') {
    (rc?.airports.from || []).concat(rc?.airports.to || []).forEach(a =>
      L.marker([a.lat, a.lon], { icon: pinIcon(ico('plane'), '', '#475569', 26) })
        .bindPopup(`<b>${esc(a.name)}</b>${a.iata ? ` (${esc(a.iata)})` : ''}<br><span class="small muted">${fmtKm(a.d)} from city centre</span>`).addTo(reachGroup));
    (rc?.stations || []).forEach(a =>
      L.marker([a.lat, a.lon], { icon: pinIcon(ico(a.sub === 'bus station' ? 'bus' : 'train'), '', '#475569', 26) })
        .bindPopup(`<b>${esc(a.name)}</b><br><span class="small muted">${esc(pretty(a.sub))} · ${fmtKm(a.d)} from centre</span>`).addTo(reachGroup));
  }
}

function fitJourney() {
  if (!S.trip || !map) return;
  const { from, to } = S.trip, rc = S.reach;
  const pts = journeyKind() === 'road' && rc?.coords?.length ? rc.coords : [[from.lat, from.lon], [to.lat, to.lon]];
  map.fitBounds(L.latLngBounds(pts).extend([from.lat, from.lon]).extend([to.lat, to.lon]), { paddingTopLeft: [50, 90], paddingBottomRight: [50, 50], maxZoom: 11 });
}

function drawPlan() {
  planGroup.clearLayers(); routeGroup.clearLayers();
  for (const k in planMarkers) delete planMarkers[k];
  for (let d = 1; d <= S.plan.days; d++) {
    const color = DAY_COLORS[(d - 1) % DAY_COLORS.length];
    const items = S.plan.items.filter(i => i.day === d);
    const r = S.routes[d];
    if (r?.coords?.length) {
      L.polyline(r.coords, { color: '#fff', weight: 9, opacity: .9, interactive: false }).addTo(routeGroup);
      L.polyline(r.coords, { color, weight: 5, opacity: .95, interactive: false }).addTo(routeGroup);
    }
    items.forEach((it, idx) => {
      const m = L.marker([it.place.lat, it.place.lon], { icon: pinIcon(idx + 1, '', color, 30), zIndexOffset: 500 });
      m.bindPopup(() => popupHtml(findPlace(it.key) || it.place));
      planMarkers[it.key] = m; planGroup.addLayer(m);
    });
  }
}

function drawSearch() {
  searchGroup.clearLayers();
  if (S.tab !== 'search') return;
  S.search.places.forEach(p => {
    const pi = placeIcon(p);
    const m = L.marker([p.lat, p.lon], { icon: pinIcon(ico(pi.ic), '', pi.color, 28) });
    m.bindPopup(() => popupHtml(p));
    m.on('click', () => flashCard(p.key));
    markers[p.key] = m; searchGroup.addLayer(m);
  });
}

function drawAlong() {
  alongGroup.clearLayers();
  if (S.tab !== 'along') return;
  S.along.places.forEach(p => {
    const pi = placeIcon(p);
    const m = L.marker([p.lat, p.lon], { icon: pinIcon(ico(pi.ic), '', pi.color, 28) });
    m.bindPopup(() => popupHtml(p));
    m.on('click', () => flashCard(p.key));
    markers[p.key] = m; alongGroup.addLayer(m);
  });
}

function fitCat(cat) {
  const pts = visible(cat).slice(0, 60).map(p => [p.lat, p.lon]);
  if (S.base) pts.push([S.base.lat, S.base.lon]);
  if (pts.length > 1) map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 60], paddingBottomRight: [40, 40], maxZoom: 15 });
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
async function enrichList(list, done) {
  const token = S.token, key = bKey();
  const sorted = list.slice().sort((a, b) => a.air - b.air).slice(0, 180);
  for (let i = 0; i < sorted.length; i += 90) {
    const chunk = sorted.slice(i, i + 90);
    try {
      const res = await API.osrmTable(S.base, chunk);
      if (token !== S.token || key !== bKey()) return;
      chunk.forEach((p, j) => { const r = res[j]; if (r && r.dist != null) { p.dist = r.dist; p.dur = r.dur; p.approx = false; } });
    } catch { return; }
    done();
  }
}
const enrich = cat => enrichList(S.places[cat] || [], () => uiUpdate(cat));

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
  S.token++;
  S.mode = null; S.search = freshSearch(); S.along = freshAlong(); jSig = '';
  $('#gsearch').value = ''; $('#gclear').hidden = true;
  if (!restore) {
    S.places = {}; S.loading = {}; S.errors = {}; S.notes = {}; S.filters = {}; S.limit = {}; S.radius = {};
    S.reach = null; S.guide = null; S.weather = null; S.routes = {};
    S.plan = { days: nights() + 1, items: [], active: 1 };
    S.base = { name: `${T.to.name} centre`, lat: T.to.lat, lon: T.to.lon, custom: false };
  }
  S.layers = new Set();
  map.setView([T.to.lat, T.to.lon], 11);
  setTab(restore && S.tab !== 'search' ? S.tab : 'overview', true);
  loadCat('see');
  loadReach();
  loadGuide();
  loadWeather();
  S.plan.items.length && Array.from({ length: S.plan.days }, (_, i) => ensureRoute(i + 1));
  save();
}

async function loadReach() {
  const token = S.token, { from, to } = S.trip;
  const R = S.reach = { air: hav(from, to), road: null, roadTime: null, coords: null, airports: { from: [], to: [] }, stations: [], loading: true };
  uiUpdate('reach');
  try {
    const r = await API.osrmRoute([from, to], true);
    if (token === S.token) { R.road = r.dist; R.roadTime = r.dur; R.coords = r.coords; }
  } catch { /* overseas / no road */ }
  if (token !== S.token) return;
  if (onJourneyTab()) { uiUpdate('reach'); fitJourney(); }
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
    add({ id: 'flight', ico: 'plane', name: 'Flight', time: air / f.speed * 60 + f.overhead, kind: 'flight', lo: one * f.lo, hi: one * f.hi, units: pax,
      unit: 'per person, one-way', per: perPerson,
      note: `Door-to-door includes ~${f.overhead / 60} h for airport transfers, check-in & security. Fares swing a lot with booking date.` });
  }
  if (road && domestic) {
    const { train: tr, bus, cab, selfDrive: sd } = R;
    if (road >= tr.minKm && road <= tr.maxKm) {
      add({ id: 'train', ico: 'train', name: 'Train', time: road / tr.speed * 60 + 45, kind: 'train', lo: tr.base + tr.lo * road, hi: tr.base + tr.hi * road, units: pax,
        ctx: { lo: { cls: 'sl' }, hi: { cls: 'ac' }, mid: { cls: 'ac' } }, unit: 'per person, AC class', per: perPerson,
        note: 'Low end is a basic sleeper-type class, high end a premium AC class. Check station-to-hotel transfer time. The map shows the road corridor, not the rail line.' });
    }
    if (road >= bus.minKm && road <= bus.maxKm) {
      add({ id: 'bus', ico: 'bus', name: 'Bus', time: road / bus.speed * 60 + 20, kind: 'bus', lo: bus.base + bus.lo * road, hi: bus.base + bus.hi * road, units: pax,
        unit: 'per person', per: perPerson, note: 'Sleeper & AC coaches run overnight on many routes.' });
    }
    const cars = Math.ceil(pax / cab.seats), cost = Math.max(cab.min, cab.perKm * road);
    add({ id: 'cab', ico: 'car', name: 'Cab (one-way drop)', time: road / cab.speed * 60 + 10, kind: 'cab', lo: cost * .9, hi: cost * 1.35, units: cars,
      ctx: { km: road, interstate }, unit: 'per car', per: (a, b) => `${range(a, b)} for ${cars} car${cars > 1 ? 's' : ''}, all-in`,
      note: `Door-to-door and flexible stops. Tolls${interstate ? ' and an inter-state permit' : ''} are included; parking and night charges may be extra.` });
    if (road <= sd.maxKm) {
      const days = nights() + 1;
      add({ id: 'self', ico: 'key', name: 'Self-drive (round trip)', time: road / cab.speed * 60, kind: 'rental', lo: sd.perDay * days * .85, hi: sd.perDay * days * 1.4, units: cars, roundTrip: true,
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
  const row = (k, ic, kind, lo, hi, sub, mult = 1) => ({
    k, ic, sub, lo: priceOf(kind, lo).total * mult, hi: priceOf(kind, hi).total * mult, tax: priceOf(kind, (lo + hi) / 2).tax * mult,
  });
  const trips = cheapest ? (cheapest.roundTrip ? 1 : 2) : 0;
  const rows = [
    { k: 'Getting there & back', ic: 'plane', sub: cheapest?.name, lo: (cheapest?.lo || 0) * trips, hi: (cheapest?.hi || 0) * trips, tax: (cheapest?.taxMid || 0) * trips },
    row('Stay', 'bed', 'stay', R.stay.hotel * tier * .7, R.stay.hotel * tier * 1.4, `${rooms} room${rooms > 1 ? 's' : ''} × ${n} night${n > 1 ? 's' : ''}, incl. room taxes`, n * rooms),
    row('Food', 'utensils', 'food', R.food * tier * pax * days * .8, R.food * tier * pax * days * 1.25, 'incl. GST & service charge'),
    row('Local transport', 'car', 'ride', R.local * Math.ceil(pax / 3) * days * .8, R.local * Math.ceil(pax / 3) * days * 1.4 * tier, 'cabs & autos, incl. tax'),
    row('Sights & shopping', 'bag', 'act', R.act * pax * days * tier * .7, R.act * pax * days * tier * 1.5, 'entry fees incl. tax'),
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
    `<button class="tab ${S.tab === t.id ? 'on' : ''}" role="tab" data-act="tab" data-tab="${t.id}">${ico(t.ico)}${t.label}</button>`).join('');
  $('#tabs .on')?.scrollIntoView({ block: 'nearest', inline: 'center' });
}

function renderLayerBar() {
  $('#layerbar').innerHTML = LAYER_ORDER.map(cat => {
    const C = CATEGORIES[cat], n = S.places[cat]?.length;
    return `<button class="lchip ${S.layers.has(cat) ? 'on' : ''}" data-act="layer" data-cat="${cat}">${ico(CAT_ICON[cat], 'xs')}${C.label}${S.loading[cat] ? ' <small>…</small>' : n != null ? ` <small>${n}</small>` : ''}</button>`;
  }).join('');
}

function setTab(tab, silent) {
  S.tab = tab;
  jSig = '';
  renderTabs();
  const cats = TAB_CATS[tab] || [];
  S.layers = new Set(cats);
  cats.forEach(c => S.places[c] ? fitCat(c) : loadCat(c));
  renderLayerBar(); renderContent(); refreshMarkers();
  if (onJourneyTab() && S.trip) fitJourney();
  if (tab === 'plan') for (let d = 1; d <= S.plan.days; d++) ensureRoute(d);
  $('#content').scrollTop = 0;
  if (!silent) save();
}

function renderContent() {
  const V = { overview: viewOverview, search: viewSearch, reach: viewReach, along: viewAlong, stay: () => viewCat('stay'), move: viewMove, eat: () => viewCat('food'), shop: () => viewCat('shop'), see: () => viewCat('see'), plan: viewPlan };
  const st = $('#content').scrollTop;
  $('#content').innerHTML = (V[S.tab] || viewOverview)();
  $('#content').scrollTop = st;
  (TAB_CATS[S.tab] || []).forEach(refreshList);
}

const needTrip = () => `<div class="empty">${ico('compass')}<p><b>Plan a trip first</b></p><p>Enter where you're travelling from and to in the bar above, then hit <b>Plan trip</b>.</p></div>`;
const spinner = t => `<div class="muted"><span class="spinner"></span>${t}</div>`;
const sec = (ic, title, extra = '') => `<h3>${ico(ic, 'xs')}${title}${extra}</h3>`;
const linkBtns = (arr, cls = 'btn sm') => arr.map(([n, u]) => `<a class="${cls}" target="_blank" rel="noopener" href="${esc(u)}">${esc(n)} ${ico('link', 'xs')}</a>`).join('');

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
  const b = calcBudget();
  const max = Math.max(...b.rows.map(r => r.hi)) || 1;
  const fromN = T.from.city || T.from.name, toN = T.to.city || T.to.name;
  const nav = [['search', 'search', 'Live search', 'Places, tips and web results'], ['reach', 'plane', 'Get there', 'Flight, train, bus or cab'], ['stay', 'bed', 'Stay', 'Hotels, homestays, Airbnb'], ['move', 'car', 'Get around', 'Cabs, rentals, metro'], ['eat', 'utensils', 'Eat', 'Restaurants and cafés'], ['see', 'pin', 'Explore', 'Sights on the map']];
  return `
  <div class="hero">
    <div class="hero-route"><div><small>From</small><b>${esc(fromN)}</b></div><div class="hero-line">${ico('plane')}</div><div style="text-align:right"><small>To</small><b>${esc(toN)}</b></div></div>
    <div class="hero-meta">${esc(T.to.label)}<br>${T.start ? esc(dayLabel(1)) + ' · ' : ''}${n} night${n > 1 ? 's' : ''} · ${T.travelers} traveller${T.travelers > 1 ? 's' : ''}</div>
    <div class="pills">
      <span class="pill">${ico('nav', 'xs')}${rc ? (rc.road ? fmtKm(rc.road) + ' by road' : 'no road route') : '…'}</span>
      <span class="pill">${ico('clock', 'xs')}${rc ? (rc.road ? fmtMin(rc.roadTime) + ' drive' : '–') : '…'}</span>
      <span class="pill">${ico('plane', 'xs')}${rc ? fmtKm(rc.air) + ' by air' : '…'}</span>
    </div>
  </div>
  ${weatherStrip()}
  ${sec('wallet', 'Rough trip budget')}
  <div class="box">
    ${rc ? `<div class="bud">${b.rows.map(r => `<div class="bl">${ico(r.ic)}<div><b>${r.k}</b><div class="small muted">${esc(r.sub || '')}</div></div></div><b>${range(r.lo, r.hi)}</b><div class="bar"><i style="width:${Math.max(4, r.hi / max * 100)}%"></i></div>`).join('')}
      <div class="tot">Total (all taxes included)</div><div class="tot">${range(b.lo, b.hi)}</div>
      <div class="small muted">of which taxes, fees, fuel &amp; tolls ≈</div><div class="small muted">${money(b.tax)}</div></div>
      <p class="small muted" style="margin-top:10px">For ${T.travelers} traveller${T.travelers > 1 ? 's' : ''}, ${['budget', 'comfort', 'premium'][[.6, 1, 2].indexOf(T.tier)] || 'comfort'} style. Change travellers, dates or style in the top bar. Open <b>Get there</b> and <b>Stay</b> for itemised taxes.</p>
      <p class="note">${DISCLAIMER}</p>`
      : spinner('Working out routes…')}
  </div>
  ${sec('compass', 'Plan it')}
  <div class="navgrid">${nav.map(([t, i, l, s]) => `<button class="navcard" data-act="tab" data-tab="${t}">${ico(i)}<b>${l}</b><small>${s}</small></button>`).join('')}</div>
  ${S.guide ? sec('globe', `About ${esc(toN)}`) + (guideBlock('Understand the destination', ['understand'], 1200) || `<div class="box"><div class="excerpt">${excerpt(S.guide.intro, 900)}</div></div>`) : ''}
  ${sec('info', 'Tips')}
  <div class="box"><ul style="margin:0;padding-left:18px">${S.region.tips.map(t => `<li>${esc(t)}</li>`).join('')}</ul></div>`;
}

function welcome() {
  const feats = [['plane', 'Every way to get there', 'Flight, train, bus and cab compared, with the real route on the map.'], ['bed', 'Stays, any budget', 'Hotels, guest houses and Airbnb-style stays with all-in prices.'], ['search', 'Live search', 'Search places, tips and the web without leaving the map.'], ['calendar', 'Day-by-day plan', 'Drop spots into an itinerary and see every leg\'s distance and time.']];
  return `
  <div class="hero">
    <h2>Plan the whole trip in one place</h2>
    <p>Pick where you're going and see the journey, the stays, the food and the sights on one live map, with road distance, travel time and prices that include taxes.</p>
  </div>
  <div class="navgrid" style="margin-bottom:6px">${feats.map(([i, t, s]) => `<div class="navcard" style="cursor:default">${ico(i)}<b>${t}</b><small>${s}</small></div>`).join('')}</div>
  ${sec('compass', 'Try a sample trip')}
  <div class="chips">${SAMPLE_TRIPS.map(([a, b], i) => `<button class="chip" data-act="sample" data-i="${i}">${esc(a)} → ${esc(b)}</button>`).join('')}</div>
  <p class="note">Data: OpenStreetMap, OSRM, Wikivoyage, Wikipedia and Open-Meteo. Fares &amp; room prices are planning estimates; booking buttons open the provider's own site for real prices.</p>`;
}

const WX = c => c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 57 ? '🌦️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌦️' : '⛈️';
function weatherStrip() {
  if (S.weather === null) return `<div class="box">${spinner('Checking forecast…')}</div>`;
  if (!S.weather) return '';
  const T = S.trip, s = T.start, e = T.end;
  let days = S.weather.filter(d => d.date >= s && d.date <= e);
  let cap = 'Forecast for your dates';
  if (!days.length) { days = S.weather.slice(0, 7); cap = 'Trip dates are beyond the 16-day forecast – showing the next 7 days'; }
  return `${sec('sun', 'Weather')}<div class="wx">${days.map(d => `<div>${new Date(d.date + 'T00:00:00').toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}<b>${WX(d.code)}</b>${Math.round(d.max)}°/${Math.round(d.min)}°<br>${d.rain ?? 0}% rain</div>`).join('')}</div><div class="small muted" style="margin-top:4px">${cap}</div>`;
}

/* ---------- get there ---------- */
function viewReach() {
  if (!S.trip) return needTrip();
  const T = S.trip, rc = S.reach, R = S.region;
  if (!rc) return spinner('Loading…');
  const modes = calcModes(), sel = selMode();
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
  const card = m => `<div class="box mode ${m.id === sel ? 'sel' : ''}" data-act="mode" data-id="${m.id}" title="Click to show this journey on the map"><div class="mi">${ico(m.ico)}</div><div>
    <div class="row between"><h4>${m.name}</h4><span class="small"><b>${fmtMin(m.time)}</b></span></div>
    <div class="price">${m.per}</div>
    <div class="row" style="margin:5px 0">${m.fastest ? `<span class="tag good">${ico('clock', 'xs')}Fastest</span>` : ''}${m.cheapest ? `<span class="tag good">${ico('wallet', 'xs')}Cheapest</span>` : ''}${m.roundTrip ? '' : `<span class="tag">Group total ${range(m.lo, m.hi)} one-way</span>`}<span class="tag good">all taxes &amp; fees included</span></div>
    <div class="small muted">${m.note}</div>
    ${breakdownHtml(m.breakdown, m.unit)}
    <div class="link-row">${linkBtns(links[m.id] || [])}</div></div></div>`;
  const apList = (arr, label) => arr.length ? `<div class="small"><b>${label}</b></div>${arr.map(a => `<div class="row between small" style="padding:3px 0"><span>${ico('plane', 'xs')} ${esc(a.name)} ${a.iata ? `<span class="tag">${esc(a.iata)}</span>` : ''}</span><span class="muted">${fmtKm(a.d)} from centre</span></div>`).join('')}` : '';
  return `
  <div class="hero"><div class="hero-route"><div><small>From</small><b>${esc(fromN)}</b></div><div class="hero-line">${ico('plane')}</div><div style="text-align:right"><small>To</small><b>${esc(toN)}</b></div></div>
    <div class="hero-meta">${fmtKm(rc.air)} straight-line${rc.road ? ` · ${fmtKm(rc.road)} by road (${fmtMin(rc.roadTime)} driving)` : ' · no road connection found'} · ${T.travelers} traveller${T.travelers > 1 ? 's' : ''}${date ? ' · ' + esc(dayLabel(1)) : ''}</div></div>
  ${rc.loading && !modes.length ? spinner('Comparing options…') : ''}
  ${modes.length ? '<p class="small muted" style="margin:0 0 8px">Tap an option to see its journey on the map.</p>' : ''}
  ${modes.map(card).join('') || (rc.loading ? '' : '<div class="box">For this distance, check the multi-modal planner below.</div>')}
  <div class="link-row" style="margin-top:0"><a class="btn" target="_blank" rel="noopener" href="${r2r}">${ico('globe', 'xs')} All options on Rome2Rio ${ico('link', 'xs')}</a></div>
  ${sec('plane', 'Airports &amp; stations')}
  <div class="box">
    ${rc.loading && !ap.from.length ? spinner('Finding airports…') : ''}
    ${apList(ap.from, `Near ${fromN}`)}${apList(ap.to, `Near ${toN}`)}
    ${!rc.loading && !ap.from.length && !ap.to.length ? '<div class="small muted">No commercial airports found within 100 km of either city.</div>' : ''}
    ${rc.stations.length ? `<div class="small" style="margin-top:8px"><b>Stations near ${esc(toN)}</b></div>${rc.stations.map(a => `<div class="row between small" style="padding:3px 0"><span>${ico(a.sub === 'bus station' ? 'bus' : 'train', 'xs')} ${esc(a.name)}${a.code ? ` <span class="tag">${esc(a.code)}</span>` : ''}</span><span class="muted">${fmtKm(a.d)}</span></div>`).join('')}` : ''}
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
    <input type="search" placeholder="Filter ${CATEGORIES[cat].label.toLowerCase()}…" value="${esc(F.q)}" data-f="q" data-cat="${cat}">
    <select data-f="sort" data-cat="${cat}" title="Sort">${SORTS[cat].map(([v, l]) => `<option value="${v}" ${F.sort === v ? 'selected' : ''}>${l}</option>`).join('')}</select>
    <select data-f="radius" data-cat="${cat}" title="Search radius around city centre">${radii.map(v => `<option value="${v}" ${v === r ? 'selected' : ''}>${v} km</option>`).join('')}</select>
    ${withVeg ? `<label class="chip ${F.veg ? 'on' : ''}" style="cursor:pointer"><input type="checkbox" data-f="veg" data-cat="${cat}" ${F.veg ? 'checked' : ''} hidden>${ico('leaf', 'xs')}Veg only</label>` : ''}
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
      <div class="link-row">${linkBtns([['Airbnb', air], ['Booking.com', bk], ['Agoda', ag], ['Google Hotels', gh], ...S.region.links.stayExtra], 'btn sm solid')}</div>
      <p class="small muted" style="margin:10px 0 0">Below: stays listed on OpenStreetMap. Use <b>Apartment</b> / <b>Guest house</b> filters for Airbnb-style options. Prices are estimated <b>all-in per room/night</b> (room tax and platform fee included; hover the price for the split). Tap <b>Prices</b> to compare rates on Google Hotels.</p>
      <p class="note" style="margin-top:8px">${DISCLAIMER}</p></div>`;
  } else if (cat === 'food') intro = guideBlock('What to eat here', ['eat'], 1100);
  else if (cat === 'shop') intro = guideBlock('What to buy here', ['buy'], 1100);
  else if (cat === 'see') intro = guideBlock('Highlights', ['see'], 1100);
  return `${intro}${toolbar(cat, cat === 'food')}<div id="plist-${cat}"></div>`;
}

function refreshList(cat) {
  const list = $('#plist-' + cat); if (!list) return;
  const chipsEl = $('#pchips-' + cat);
  const F = filt(cat), C = CATEGORIES[cat];
  if (S.loading[cat]) { list.innerHTML = `<div class="box">${spinner(`Finding ${C.label.toLowerCase()} near ${esc(S.trip.to.name)}…`)}</div>`; if (chipsEl) chipsEl.innerHTML = ''; return; }
  if (S.errors[cat] && !S.places[cat]?.length) {
    list.innerHTML = `<div class="err">${esc(S.errors[cat])}</div><button class="btn sm" data-act="retry" data-cat="${cat}">${ico('refresh', 'xs')} Retry</button>`;
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
    + (items.length ? `<div class="small muted" style="margin:2px 0 7px">${items.length} result${items.length > 1 ? 's' : ''} · distance &amp; drive time from <b>${esc(S.base.name)}</b></div>` : '')
    + items.slice(0, lim).map(cardHtml).join('')
    + (items.length > lim ? `<button class="btn" data-act="more" data-cat="${cat}">Show ${Math.min(20, items.length - lim)} more</button>` : '')
    + (!items.length ? '<div class="empty">No matches. Try clearing filters or widening the radius.</div>' : '');
}

function distBlock(p) {
  if (p.along != null) {
    const atEnd = S.reach.road - p.along < 0.5;
    const head = p.along < 0.5 ? 'At the start' : atEnd ? 'At the end' : `${fmtKm(p.along)}`;
    return `<div class="pc-dist"><b>${head}</b>${p.along < 0.5 || atEnd ? `near ${esc(p.along < 0.5 ? (S.trip.from.city || S.trip.from.name) : (S.trip.to.city || S.trip.to.name))}` : `from ${esc(S.trip.from.city || S.trip.from.name)}`}<br>${fmtKm(p.off)} off route</div>`;
  }
  const walk = p.dist <= 2.5 ? ` · walk ${fmtMin(p.dist / 4.8 * 60)}` : '';
  return `<div class="pc-dist"><b>${p.approx ? '≈ ' : ''}${fmtKm(p.dist)}</b>${ico('car', 'xs')} ${p.approx ? '≈ ' : ''}${fmtMin(p.dur)}${walk}</div>`;
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
  if (p.notable && p.cat === 'see') out.push(`<span class="tag good">${ico('star', 'xs')}Notable</span>`);
  if (p.cat === 'food' && ['yes', 'only'].includes(t['diet:vegetarian'])) out.push(`<span class="tag good">${ico('leaf', 'xs')}Veg-friendly</span>`);
  if (t.cuisine && p.cat === 'food') out.push(`<span class="tag">${esc(t.cuisine.split(';').slice(0, 2).map(pretty).join(', '))}</span>`);
  if (t.opening_hours) out.push(`<span class="tag" title="${esc(t.opening_hours)}">${ico('clock', 'xs')}${esc(t.opening_hours.length > 30 ? t.opening_hours.slice(0, 28) + '…' : t.opening_hours)}</span>`);
  if (['wlan', 'yes', 'wifi'].includes(t.internet_access)) out.push('<span class="tag">Wi-Fi</span>');
  if (t.wheelchair === 'yes') out.push('<span class="tag">Accessible</span>');
  if (t.fee === 'no') out.push('<span class="tag good">Free entry</span>');
  if (t.iata) out.push(`<span class="tag">${esc(t.iata)}</span>`);
  return out.join('');
}

function actionsHtml(p, popup) {
  const t = p.tags || {}, city = S.trip.to.city || S.trip.to.name;
  const inPlan = S.plan.items.some(i => i.key === p.key);
  const web = safeUrl(t.website || t['contact:website']);
  const tel = (t.phone || t['contact:phone'] || '').replace(/[^+\d]/g, '');
  if (p.along != null) {   // a stop on the way: offer the route via this place instead of itinerary actions
    const { from, to } = S.trip;
    const via = `https://www.google.com/maps/dir/?api=1&origin=${from.lat},${from.lon}&destination=${to.lat},${to.lon}&waypoints=${p.lat},${p.lon}&travelmode=driving`;
    return `${popup ? '' : `<button class="btn sm" data-act="focus" data-key="${p.key}">${ico('pin', 'xs')}Map</button>`}
      <a class="btn sm solid" target="_blank" rel="noopener" href="${via}">${ico('route', 'xs')}Route via here</a>
      <a class="btn sm" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${q(p.name + ' ' + p.lat + ',' + p.lon)}">${ico('star', 'xs')}Reviews</a>
      ${web ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(web)}">${ico('link', 'xs')}Website</a>` : ''}
      ${tel ? `<a class="btn sm" href="tel:${esc(tel)}">${ico('phone', 'xs')}Call</a>` : ''}`;
  }
  const dir = `https://www.google.com/maps/dir/?api=1&origin=${S.base.lat},${S.base.lon}&destination=${p.lat},${p.lon}&travelmode=driving`;
  const rev = `https://www.google.com/maps/search/?api=1&query=${q(p.name + ' ' + city)}`;
  const px = `https://www.google.com/travel/search?q=${q(p.name + ' ' + city)}`;
  return `<button class="btn sm solid" data-act="plan-add" data-key="${p.key}">${ico(inPlan ? 'check' : 'plus', 'xs')}${inPlan ? 'In plan' : 'Add to plan'}</button>
    ${popup ? '' : `<button class="btn sm" data-act="focus" data-key="${p.key}">${ico('pin', 'xs')}Map</button>`}
    ${p.cat === 'stay' ? `<button class="btn sm" data-act="set-base" data-key="${p.key}">${ico('home', 'xs')}Use as base</button><a class="btn sm" target="_blank" rel="noopener" href="${px}">${ico('wallet', 'xs')}Prices</a>` : ''}
    <a class="btn sm" target="_blank" rel="noopener" href="${dir}">${ico('nav', 'xs')}Directions</a>
    ${['food', 'shop', 'see'].includes(p.cat) ? `<a class="btn sm" target="_blank" rel="noopener" href="${rev}">${ico('star', 'xs')}Reviews</a>` : ''}
    ${web ? `<a class="btn sm" target="_blank" rel="noopener" href="${esc(web)}">${ico('link', 'xs')}Website</a>` : ''}
    ${tel ? `<a class="btn sm" href="tel:${esc(tel)}">${ico('phone', 'xs')}Call</a>` : ''}`;
}

function cardHtml(p) {
  const pi = placeIcon(p), t = p.tags;
  const addr = p.addr || [t['addr:street'], t['addr:suburb'] || t['addr:city']].filter(Boolean).join(', ');
  return `<article class="pcard" data-key="${p.key}">
    <div class="pc-top"><div class="pc-ico" style="--c:${pi.color}">${ico(pi.ic)}</div>
      <div class="pc-main"><h4>${esc(p.name)}</h4><div class="pc-sub">${esc(pretty(p.sub))}${addr ? ' · ' + esc(addr) : ''}</div></div>${distBlock(p)}</div>
    <div class="pc-meta">${detailTags(p)}</div>
    <div class="pc-actions">${actionsHtml(p, false)}</div></article>`;
}

function popupHtml(p) {
  return `<div class="pp"><h4>${esc(p.name)}</h4>
    <div class="small muted">${esc(pretty(p.sub))} · ${p.along != null ? `${fmtKm(p.along)} from start · ${fmtKm(p.off)} off route` : `${p.approx ? '≈ ' : ''}${fmtKm(p.dist)} · ${p.approx ? '≈ ' : ''}${fmtMin(p.dur)} by car`}</div>
    <div class="pc-meta">${detailTags(p)}</div><div class="pc-actions">${actionsHtml(p, true)}</div></div>`;
}

/* ---------- live search ---------- */
/** Map everyday words ("petrol pump", "dhaba", "chemist") to the OSM topic they mean. */
function topicFor(term) {
  const t = term.trim().toLowerCase();
  return SEARCH_TOPICS.find(x => x.label.toLowerCase() === t || x.terms.includes(t))
    || SEARCH_TOPICS.find(x => x.terms.some(w => w.length > 3 && t.includes(w)));
}
const quickChips = () => `<div class="chips">${SEARCH_TOPICS.map(t => `<button class="chip" data-act="qsearch" data-q="${esc(t.label)}">${ico(t.ic, 'xs')}${esc(t.label)}</button>`).join('')}</div>`;

function guessCat(x) {
  const c = x.category, t = x.type;
  if (c === 'tourism' && ['hotel', 'guest_house', 'hostel', 'motel', 'apartment', 'resort', 'chalet'].includes(t)) return 'stay';
  if (c === 'amenity' && ['restaurant', 'cafe', 'fast_food', 'food_court', 'ice_cream', 'bar', 'pub'].includes(t)) return 'food';
  if (c === 'shop' || (c === 'amenity' && t === 'marketplace')) return 'shop';
  if (c === 'railway' || c === 'aeroway' || t === 'bus_station') return 'transit';
  if (c === 'amenity' && t === 'car_rental') return 'rent';
  return 'see';
}

function searchRow(x) {
  const cat = guessCat(x);
  const tags = { ...(x.extratags || {}), name: x.name || x.display_name.split(',')[0] };
  tags[x.category] = x.type;
  const p = normalize(cat, { type: x.osm_type, id: x.osm_id, lat: +x.lat, lon: +x.lon, tags });
  if (!p) return null;
  p.key = `srch:${x.osm_type[0]}${x.osm_id}`;
  p.sub = x.type;
  p.addr = x.display_name.split(',').slice(1, 4).join(',').trim();
  return p;
}

const snip = h => esc(new DOMParser().parseFromString(String(h).replace(/<span class="searchmatch">/g, '[[').replace(/<\/span>/g, ']]'), 'text/html').body.textContent)
  .replace(/\[\[/g, '<span class="searchmatch">').replace(/\]\]/g, '</span>');

async function runSearch(term) {
  const X = S.search, seq = ++X.seq;
  if (!S.trip) { renderContent(); return; }
  X.loading = true; X.done = false; renderContent();
  const to = S.trip.to, city = to.city || to.name;
  const safe = f => { try { return Promise.resolve(f()); } catch (e) { return Promise.reject(e); } };
  const phrase = topicFor(term)?.nom || term;   // "petrol pump" -> "petrol station", which OSM understands
  const [pl, voy, wp] = await Promise.allSettled([
    safe(() => API.searchPlaces(phrase, to.lat, to.lon, 40)),
    safe(() => API.wikiSearch('wikivoyage', `${term} ${city}`, 5)),
    safe(() => API.wikiSearch('wikipedia', `${term} ${city}`, 4)),
  ]);
  if (seq !== X.seq) return;
  const seen = new Set();
  // keep results near the destination only (the widened search can return matches from across the world)
  X.places = pl.status === 'fulfilled'
    ? pl.value.rows.map(searchRow).filter(p => p && hav(to, p) <= 120 && !seen.has(p.key) && seen.add(p.key)).sort((a, b) => a.air - b.air) : [];
  X.wide = pl.status === 'fulfilled' && pl.value.wide && X.places.some(p => hav(to, p) > 40);
  X.errP = pl.status === 'rejected';
  X.voy = voy.status === 'fulfilled' ? voy.value : [];
  X.wp = wp.status === 'fulfilled' ? wp.value : [];
  S.places.srch = X.places;
  X.loading = false; X.done = true;
  if (S.tab === 'search') {
    renderContent(); refreshMarkers();
    if (X.places.length) {
      const pts = X.places.slice(0, 30).map(p => [p.lat, p.lon]).concat([[S.base.lat, S.base.lon]]);
      map.fitBounds(L.latLngBounds(pts), { paddingTopLeft: [40, 60], paddingBottomRight: [40, 40], maxZoom: 15 });
    }
    enrichList(X.places, () => { if (S.tab === 'search' && seq === X.seq) { renderContent(); } });
  }
}

function viewSearch() {
  if (!S.trip) return needTrip();
  const X = S.search, city = S.trip.to.city || S.trip.to.name;
  const quick = quickChips();
  if (!X.q) {
    return `<div class="hero"><h2>Search ${esc(city)} live</h2><p>Type in the box above. Results come straight from OpenStreetMap, Wikivoyage and Wikipedia as you type, and you can open the same search on Google, Bing and more.</p></div>
      ${sec('search', 'Quick searches')}${quick}
      <p class="note">Free live sources only. A full web search engine can't be queried from a browser without a paid key, so the buttons open one in a new tab.</p>`;
  }
  const webq = `${X.q} ${city}`;
  const web = [['Google', `https://www.google.com/search?q=${q(webq)}`], ['Bing', `https://www.bing.com/search?q=${q(webq)}`], ['DuckDuckGo', `https://duckduckgo.com/?q=${q(webq)}`],
    ['Google Maps', `https://www.google.com/maps/search/?api=1&query=${q(webq)}`], ['Tripadvisor', `https://www.tripadvisor.com/Search?q=${q(webq)}`], ['Reddit', `https://www.reddit.com/search/?q=${q(webq)}`]];
  const res = (list, src) => list.map(r => `<a class="res" href="${esc(r.url)}" target="_blank" rel="noopener"><b>${esc(r.title)}</b><p>${snip(r.snippet)}…</p><span>${src} ${ico('link', 'xs')}</span></a>`).join('');
  let h = `<div class="row between" style="margin-bottom:4px"><div class="small muted"><span class="live-dot"></span>Live results for <b>${esc(X.q)}</b> near ${esc(city)}</div></div>${quick}`;
  if (X.loading) return h + `<div class="box">${spinner('Searching OpenStreetMap, Wikivoyage and Wikipedia…')}</div>`;
  h += sec('pin', 'On the map', `<em>${X.places.length}</em>`);
  h += X.errP ? '<div class="err">Place search is unavailable right now. Please try again in a moment.</div>' : '';
  h += X.places.length ? (X.wide ? '<p class="note" style="margin-bottom:8px">Few matches in the city itself, so results from the wider area (up to 120 km) are included.</p>' : '') + X.places.slice(0, 12).map(cardHtml).join('')
    : (X.errP ? '' : '<div class="box muted">No places matched. Try a simpler word like "cafe" or a place name.</div>');
  if (X.voy.length) h += sec('globe', 'Travel guides', `<em>${X.voy.length}</em>`) + res(X.voy, 'Wikivoyage');
  if (X.wp.length) h += sec('info', 'Background', `<em>${X.wp.length}</em>`) + res(X.wp, 'Wikipedia');
  h += sec('search', 'Search the web') + `<div class="link-row" style="margin-top:0">${linkBtns(web)}</div>`;
  if (S.reach?.coords?.length) h += `<div class="box" style="margin-top:12px"><div class="row between"><div><b>On your way?</b><div class="small muted">Look for “${esc(X.q)}” along the road from ${esc(S.trip.from.city || S.trip.from.name)} to ${esc(city)}.</div></div><button class="btn sm solid" data-act="along-from-search">${ico('route', 'xs')}Search the route</button></div></div>`;
  return h;
}

let gTimer;
function onGSearch(v, immediate) {
  v = v.trim();
  $('#gclear').hidden = !v;
  S.search.q = v;
  clearTimeout(gTimer);
  if (!v) { S.search.seq++; if (S.tab === 'search') setTab(S.search.prev || 'overview'); return; }
  if (S.tab !== 'search') { S.search.prev = S.tab; setTab('search'); }
  if (!S.trip) { toast('Plan a trip first so I know where to search'); return; }
  gTimer = setTimeout(() => runSearch(v), immediate ? 0 : 450);
}

/* ---------- search along the journey ---------- */
const ALONG_KM = 3;   // how far off the road we look (Overpass); the backup source uses overlapping boxes

/** Cumulative km along the route geometry, scaled so the total matches the routed distance. */
function routeIndex() {
  const R = S.reach; if (!R?.coords?.length) return null;
  if (R._cum) return R._cum;
  const c = R.coords, cum = [0];
  for (let i = 1; i < c.length; i++) cum.push(cum[i - 1] + hav({ lat: c[i - 1][0], lon: c[i - 1][1] }, { lat: c[i][0], lon: c[i][1] }));
  const k = R.road / (cum[cum.length - 1] || 1);
  R._cum = cum.map(v => v * k);
  return R._cum;
}

/** Where a place sits relative to the route: km from the start and km off the road. */
function locateOnRoute(p) {
  const c = S.reach.coords, cum = routeIndex(), cl = Math.cos(rad(p.lat));
  let bi = 0, bd = Infinity;
  for (let i = 0; i < c.length; i += 2) {
    const dy = c[i][0] - p.lat, dx = (c[i][1] - p.lon) * cl, d = dx * dx + dy * dy;
    if (d < bd) { bd = d; bi = i; }
  }
  return { along: cum[bi], off: hav({ lat: c[bi][0], lon: c[bi][1] }, p) };
}

/** Points roughly every `stepKm` along the route. */
function routeSamples(stepKm) {
  const c = S.reach.coords, cum = routeIndex(), out = [];
  let next = 0;
  for (let i = 0; i < c.length; i++) if (cum[i] >= next) { out.push(c[i]); next += stepKm; }
  out.push(c[c.length - 1]);
  return out;
}

const simplifyRoute = max => {
  const c = S.reach.coords, step = Math.max(1, Math.ceil(c.length / max)), out = [];
  for (let i = 0; i < c.length; i += step) out.push(c[i]);
  out.push(c[c.length - 1]);
  return out;
};

function alongPlace(e) {
  const t = e.tags || {};
  const key = ['amenity', 'tourism', 'historic', 'shop', 'leisure', 'railway', 'aeroway'].find(k => t[k]);
  const p = normalize(guessCat({ category: key, type: t[key] }), e);
  if (!p) return null;
  p.key = `route:${e.type[0]}${e.id}`;
  Object.assign(p, locateOnRoute(p));
  return p;
}

async function runAlong({ topic = '', q: text = '' }) {
  const X = S.along, seq = ++X.seq;
  if (!S.trip || !S.reach?.coords?.length) { renderContent(); return; }
  Object.assign(X, { topic, q: text, loading: true, places: [], note: '', done: false, limit: 30, progress: 'Starting…' });
  S.places.route = X.places;
  renderContent(); refreshMarkers();
  const T = SEARCH_TOPICS.find(t => t.id === topic);
  const seen = new Set();
  const add = els => {
    for (const e of els) {
      const p = alongPlace(e);
      if (!p || p.off > 4 || seen.has(p.key)) continue;
      seen.add(p.key); X.places.push(p);
    }
    X.places.sort((a, b) => a.along - b.along);
  };
  const paint = () => { if (S.tab === 'along' && seq === X.seq) { renderContent(); refreshMarkers(); } };
  let done = false;
  if (T?.ql) {
    try {
      X.progress = 'Searching the whole route…'; paint();
      add(await API.alongOverpass(T.ql, simplifyRoute(40), ALONG_KM * 1000));
      done = true;
    } catch { /* fall back to the backup source below */ }
  }
  if (seq !== X.seq) return;
  if (!done) {
    X.note = 'The main map-data server is busy, so I searched in steps along the route with a backup source. Coverage can be thinner.';
    const step = Math.max(25, Math.min(60, S.reach.road / 9)), pts = routeSamples(step), half = step / 2 + 3;
    const term = T?.nom || text;
    for (let i = 0; i < pts.length; i++) {
      X.progress = `Searching along the route… ${i + 1} of ${pts.length}`; paint();
      try { add(await API.nominatimBox(term, pts[i][0], pts[i][1], half)); } catch { /* skip this stretch */ }
      if (seq !== X.seq) return;
    }
  }
  S.places.route = X.places;
  X.loading = false; X.done = true; X.progress = '';
  paint();
}

function viewAlong() {
  if (!S.trip) return needTrip();
  const R = S.reach, X = S.along, T = S.trip;
  const fromN = T.from.city || T.from.name, toN = T.to.city || T.to.name;
  if (!R) return spinner('Loading the route…');
  if (!R.coords?.length) return `<div class="empty">${ico('route')}<p><b>No road route found</b></p><p>Searching along the way needs a road between ${esc(fromN)} and ${esc(toN)}. Use the live search for each end instead.</p></div>`;
  const label = SEARCH_TOPICS.find(t => t.id === X.topic)?.label || X.q;
  let h = `<div class="hero"><div class="hero-route"><div><small>From</small><b>${esc(fromN)}</b></div><div class="hero-line">${ico('car')}</div><div style="text-align:right"><small>To</small><b>${esc(toN)}</b></div></div>
    <div class="hero-meta">Find fuel, food, ATMs, hospitals and more within a few km of your ${fmtKm(R.road)} road route.</div></div>
    <div class="chips">${SEARCH_TOPICS.map(t => `<button class="chip ${X.topic === t.id ? 'on' : ''}" data-act="along-topic" data-id="${t.id}">${ico(t.ic, 'xs')}${esc(t.label)}</button>`).join('')}</div>
    <form id="alongForm" class="toolbar"><input type="search" name="q" placeholder="Or search the route: dhaba, temple, tyre shop…" value="${esc(X.topic ? '' : X.q)}"><button class="btn solid sm" type="submit">${ico('search', 'xs')}Search</button></form>`;
  if (!label) return h + `<p class="note">Pick a topic or type something. Results are listed in driving order, with how far each is from ${esc(fromN)} and how far it sits off the road. Data: OpenStreetMap.</p>`;
  if (X.loading) h += `<div class="box">${spinner(esc(X.progress || 'Searching…'))}${X.places.length ? ` <span class="small muted">${X.places.length} found so far</span>` : ''}</div>`;
  if (X.note) h += `<p class="note">${esc(X.note)}</p>`;
  if (X.done && !X.places.length) h += `<div class="box muted">Nothing found for “${esc(label)}” within a few km of the route. Try another topic or a simpler word.</div>`;
  if (X.places.length) {
    h += sec('route', `${esc(label)} on the way`, `<em>${X.places.length}</em>`) + `<div class="small muted" style="margin:-2px 0 8px">In driving order from ${esc(fromN)}. Tap a pin or card for details.</div>`;
    h += X.places.slice(0, X.limit).map(cardHtml).join('');
    if (X.places.length > X.limit) h += `<button class="btn" data-act="along-more">Show ${Math.min(30, X.places.length - X.limit)} more</button>`;
  }
  return h;
}

/* ---------- get around ---------- */
function viewMove() {
  if (!S.trip) return needTrip();
  const R = S.region, d = nights() + 1;
  const fares = [['Cab / taxi', R.ride.cab], ['Auto / tuk-tuk', R.ride.auto], ['Bike taxi', R.ride.bike]];
  return `
  ${sec('car', 'Ride-hailing – typical fares')}
  <div class="box">
    <table style="width:100%;border-collapse:collapse;font-size:13px">
      <tr class="muted small"><td></td><td>3 km</td><td>8 km</td><td>20 km</td></tr>
      ${fares.map(([n, [b, k]]) => `<tr style="border-top:1px solid var(--line)"><td style="padding:7px 0">${n}</td>${[3, 8, 20].map(km => `<td><b>${money(priceOf('ride', b + k * km).total)}</b></td>`).join('')}</tr>`).join('')}
    </table>
    <div class="link-row">${linkBtns(R.links.ride)}</div>
    <p class="small muted" style="margin:10px 0 0">Includes ${esc(R.tax.ride.map(r => r.label).join(', '))}. Excludes surge pricing and tolls; apps available vary by city.</p>
  </div>
  ${sec('key', 'Rent a vehicle – daily rates')}
  <div class="box">
    ${R.rentDay.map(([, n, [lo, hi]]) => { const a = priceOf('rentday', lo).total, b = priceOf('rentday', hi).total; return `<div style="padding:6px 0;border-bottom:1px solid var(--line)"><div class="row between"><span>${n}</span><b>${range(a, b)}/day</b></div><div class="small muted" style="text-align:right">${d} days ≈ ${range(a * d, b * d)}</div></div>`; }).join('')}
    <p class="small muted" style="margin:8px 0 0">Includes ${esc(R.tax.rentday.map(r => r.label).join(', '))}. Fuel, tolls and a refundable deposit are extra.</p>
    <div class="link-row">${linkBtns(R.links.rent, 'btn sm solid')}</div>
    <p class="small muted" style="margin:8px 0 0">You usually need a valid driving licence (and an IDP abroad), ID and a deposit.</p>
  </div>
  ${sec('key', 'Rental shops &amp; garages nearby')}
  ${toolbar('rent', false)}<div id="plist-rent"></div>
  ${sec('train', 'Airports, stations &amp; metro')}
  ${toolbar('transit', false)}<div id="plist-transit"></div>`;
}

/* ---------- itinerary ---------- */
function viewPlan() {
  if (!S.trip) return needTrip();
  const P = S.plan;
  let html = `<div class="small muted" style="margin-bottom:6px">Add spots from any tab with <b>Add to plan</b>. New stops go to the highlighted day.</div>
    <div class="chips">${Array.from({ length: P.days }, (_, i) => i + 1).map(d => `<button class="chip ${P.active === d ? 'on' : ''}" data-act="plan-day" data-day="${d}">Day ${d}</button>`).join('')}
    <button class="chip" data-act="plan-addday" title="Add a day">${ico('plus', 'xs')}</button>${P.days > 1 ? `<button class="chip" data-act="plan-rmday" title="Remove last day">${ico('x', 'xs')}</button>` : ''}</div>`;
  for (let d = 1; d <= P.days; d++) {
    const items = P.items.filter(i => i.day === d), color = DAY_COLORS[(d - 1) % DAY_COLORS.length], r = S.routes[d];
    const total = r && !r.pending ? `${fmtKm(r.dist)} · ${fmtMin(r.dur)} driving` : items.length ? 'calculating…' : '';
    html += `<div class="day"><div class="day-h"><div><span class="dot" style="background:${color}"></span><b>Day ${d}</b> <span class="muted small">${esc(dayLabel(d))}</span><div class="small muted">${total}</div></div>
      <div class="row">${items.length > 1 ? `<button class="btn sm" data-act="plan-opt" data-day="${d}">${ico('wand', 'xs')}Optimise</button>` : ''}${items.length ? `<a class="btn sm" target="_blank" rel="noopener" href="${gmapsRoute(items)}">${ico('nav', 'xs')}Google Maps</a>` : ''}</div></div>`;
    if (!items.length) html += `<div class="stop muted">${P.active === d ? 'Nothing yet – add spots from the other tabs.' : 'Empty'}</div>`;
    else {
      html += `<div class="small muted">${ico('home', 'xs')} Start: ${esc(S.base.name)}</div>`;
      items.forEach((it, i) => {
        const leg = r?.legs?.[i];
        html += `<div class="leg">${leg ? `${ico('car', 'xs')} ${fmtKm(leg.dist)} · ${fmtMin(leg.dur)}${r.fail ? ' (est.)' : ''}` : '…'}</div>
          <div class="stop" data-key="${it.key}"><div class="n" style="background:${color}">${i + 1}</div>
          <div class="t"><b>${esc(it.place.name)}</b><div class="small muted">${esc(pretty(it.place.sub))}</div></div>
          <button class="ib" title="Show on map" data-act="focus" data-key="${it.key}">${ico('pin', 'xs')}</button>
          <button class="ib" title="Move up" data-act="plan-up" data-key="${it.key}" ${i === 0 ? 'disabled' : ''}>${ico('up', 'xs')}</button>
          <button class="ib" title="Move down" data-act="plan-down" data-key="${it.key}" ${i === items.length - 1 ? 'disabled' : ''}>${ico('down', 'xs')}</button>
          <button class="ib" title="Remove" data-act="plan-remove" data-key="${it.key}">${ico('x', 'xs')}</button></div>`;
      });
      const back = r?.legs?.[items.length];
      html += `<div class="leg">${back ? `${ico('car', 'xs')} ${fmtKm(back.dist)} · ${fmtMin(back.dur)}` : '…'}</div><div class="small muted">${ico('home', 'xs')} Back to ${esc(S.base.name)}</div>`;
    }
    html += '</div>';
  }
  html += `<div class="row no-print"><button class="btn solid" data-act="plan-copy">${ico('copy', 'xs')}Copy itinerary</button><button class="btn" data-act="plan-print">${ico('printer', 'xs')}Print</button>${P.items.length ? `<button class="btn" data-act="plan-clear">${ico('trash', 'xs')}Clear all</button>` : ''}</div>`;
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
function replan() {
  drawPlan(); save();
  for (let d = 1; d <= S.plan.days; d++) ensureRoute(d);
  if (S.tab === 'plan') renderContent();
  renderListsIfVisible();
}
const renderListsIfVisible = () => (TAB_CATS[S.tab] || []).forEach(refreshList);

function planText() {
  const T = S.trip, P = S.plan;
  let t = `TPVM trip: ${T.from.name} → ${T.to.name} (${T.start} to ${T.end}, ${T.travelers} traveller${T.travelers > 1 ? 's' : ''})\nBase: ${S.base.name}\n`;
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
    localStorage.setItem('tpvm.v1', JSON.stringify({ trip: S.trip, base: S.base, plan: S.plan, tab: S.tab === 'search' ? S.search.prev : S.tab }));
  } catch { /* storage unavailable */ }
}

/* ============================== events ============================== */
const ACT = {
  tab: el => setTab(el.dataset.tab),
  sample: el => {
    const [a, b] = SAMPLE_TRIPS[+el.dataset.i];
    $('#fromInput').value = a; $('#toInput').value = b;
    $('#fromInput')._place = $('#toInput')._place = null;
    startTrip();
  },
  mode: el => { S.mode = el.dataset.id; jSig = ''; renderContent(); refreshMarkers(); fitJourney(); },
  qsearch: el => { $('#gsearch').value = el.dataset.q; onGSearch(el.dataset.q, true); },
  'along-topic': el => runAlong({ topic: el.dataset.id }),
  'along-more': () => { S.along.limit += 30; renderContent(); },
  'along-from-search': () => {
    const t = topicFor(S.search.q);
    setTab('along'); runAlong(t ? { topic: t.id } : { q: S.search.q });
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
    if (S.tab === 'search') renderContent();
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
  if (!el || !ACT[el.dataset.act]) return;
  // A link/button nested inside an actionable card keeps its own behaviour.
  const inner = e.target.closest('a, button, summary, input, select, label');
  if (inner && inner !== el && el.contains(inner)) return;
  e.preventDefault(); ACT[el.dataset.act](el);
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
document.addEventListener('submit', e => {
  if (e.target.id !== 'alongForm') return;
  e.preventDefault();
  const v = String(new FormData(e.target).get('q') || '').trim();
  if (!v) return;
  const t = topicFor(v);
  runAlong(t ? { topic: t.id } : { q: v });
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
  $('#gsearch').addEventListener('input', ev => onGSearch(ev.target.value));
  $('#gsearch').addEventListener('keydown', ev => { if (ev.key === 'Enter') { ev.preventDefault(); onGSearch(ev.target.value, true); } });
  $('#gclear').addEventListener('click', () => { $('#gsearch').value = ''; onGSearch(''); $('#gsearch').focus(); });

  let saved = null;
  try { saved = JSON.parse(localStorage.getItem('tpvm.v1') || localStorage.getItem('wayfarer.v1') || 'null'); } catch { /* ignore */ }
  if (saved?.trip?.to && saved.trip.from) {
    S.trip = saved.trip; S.plan = saved.plan || S.plan; S.base = saved.base; S.tab = saved.tab && saved.tab !== 'search' ? saved.tab : 'overview';
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
