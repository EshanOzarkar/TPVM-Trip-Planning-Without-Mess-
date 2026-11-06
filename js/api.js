/* Network layer. All services are free & keyless:
   Nominatim (geocoding), Overpass (OSM places), OSRM (road distance/time),
   Wikivoyage (local guide text), Open-Meteo (weather). */

const API = (() => {
  const cache = new Map();

  async function fetchJSON(url, { method = 'GET', body, headers, timeout = 25000 } = {}) {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), timeout);
    try {
      const r = await fetch(url, { method, body, headers, signal: ctl.signal });
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return await r.json();
    } finally { clearTimeout(t); }
  }

  /* ---------- persistent cache (24h) ---------- */
  const LS = 'wf.c.';
  const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };
  function lsGet(k) {
    try { const v = JSON.parse(localStorage.getItem(LS + hash(k))); if (v && Date.now() - v.t < 864e5) return v.d; } catch { /* none */ }
    return null;
  }
  function lsSet(k, d) {
    try { localStorage.setItem(LS + hash(k), JSON.stringify({ t: Date.now(), d })); }
    catch { try { Object.keys(localStorage).filter(x => x.startsWith(LS)).forEach(x => localStorage.removeItem(x)); } catch { /* ignore */ } }
  }

  /* Nominatim allows ~1 request/second. */
  let nomLast = 0;
  async function nomGate() {
    const wait = nomLast + 1100 - Date.now();
    nomLast = Date.now() + Math.max(0, wait);
    if (wait > 0) await new Promise(r => setTimeout(r, wait));
  }

  /* ---------- Geocoding ---------- */
  async function geocode(q) {
    const key = 'g:' + q.toLowerCase();
    if (cache.has(key)) return cache.get(key);
    await nomGate();
    const j = await fetchJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&accept-language=en&q=${encodeURIComponent(q)}`);
    const out = j.map(x => {
      const a = x.address || {};
      const city = a.city || a.town || a.village || a.municipality || a.county || x.name;
      const name = x.name || city;
      return {
        name, city, state: a.state || '', country: a.country || '',
        cc: (a.country_code || '').toUpperCase(), lat: +x.lat, lon: +x.lon,
        label: [name, a.state, a.country].filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(', '),
      };
    });
    cache.set(key, out);
    return out;
  }

  /* ---------- Overpass (serialised: public servers allow ~2 slots) ---------- */
  const OVERPASS = [
    ['https://overpass-api.de/api/interpreter', 14000],
    ['https://overpass.kumi.systems/api/interpreter', 9000],
  ];
  let chain = Promise.resolve();

  let overpassDownUntil = 0; // circuit breaker: skip dead servers for a few minutes

  async function runOverpass(ql) {
    if (cache.has(ql)) return cache.get(ql);
    const hit = lsGet(ql);
    if (hit) { cache.set(ql, hit); return hit; }
    if (Date.now() < overpassDownUntil) throw new Error('Overpass recently unreachable');
    let lastErr;
    for (const [ep, timeout] of OVERPASS) {
      try {
        // GET: the main server answers POST from browsers with 406 on some networks
        const j = await fetchJSON(`${ep}?data=${encodeURIComponent(ql)}`, { timeout });
        cache.set(ql, j.elements || []);
        lsSet(ql, j.elements || []);
        return j.elements || [];
      } catch (e) { lastErr = e; }
    }
    overpassDownUntil = Date.now() + 3 * 60 * 1000;
    throw new Error('Overpass servers are busy (' + (lastErr?.message || 'timeout') + ').');
  }

  /** Backup source: Nominatim category search inside a bounding box, shaped like Overpass elements. */
  const NOM_CATS = new Set(['tourism', 'historic', 'amenity', 'shop', 'leisure', 'railway', 'aeroway']);
  async function nominatimPlaces(terms, lat, lon, r) {
    const dLat = r / 111000, dLon = r / (111000 * Math.cos(lat * Math.PI / 180));
    const vb = `${lon - dLon},${lat + dLat},${lon + dLon},${lat - dLat}`;
    const seen = new Set(), out = [];
    for (const term of terms) {
      const key = `n:${term}:${lat.toFixed(3)},${lon.toFixed(3)},${r}`;
      let rows = cache.get(key) || lsGet(key);
      if (!rows) {
        await nomGate();
        rows = await fetchJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&extratags=1&bounded=1&limit=40&accept-language=en&viewbox=${vb}&q=${encodeURIComponent(term)}`);
        lsSet(key, rows);
      }
      cache.set(key, rows);
      for (const x of rows) {
        const id = x.osm_type + x.osm_id;
        if (seen.has(id) || !NOM_CATS.has(x.category) || !x.name) continue;
        seen.add(id);
        out.push({ type: x.osm_type, id: x.osm_id, lat: +x.lat, lon: +x.lon, tags: { ...(x.extratags || {}), name: x.name, [x.category]: x.type } });
      }
    }
    return out;
  }

  function overpass(ql) {
    const p = chain.then(() => runOverpass(ql));
    chain = p.catch(() => {});
    return p;
  }

  function groupsQL(groups, lat, lon, r) {
    const a = `(around:${r},${lat},${lon})`;
    let q = '[out:json][timeout:30];';
    groups.forEach((g, i) => {
      q += `(${g.f.map(f => `nwr${f}${a};`).join('')})->.g${i};.g${i} out center tags qt ${g.limit};`;
    });
    return q;
  }

  const places = (groups, lat, lon, r) => overpass(groupsQL(groups, lat, lon, r));

  const airports = (lat, lon, r) => overpass(
    `[out:json][timeout:30];nwr["aeroway"="aerodrome"]["iata"]["name"](around:${r},${lat},${lon});out center tags qt 20;`);

  const stations = (lat, lon, r) => overpass(
    `[out:json][timeout:30];(nwr["railway"="station"]["station"!~"^(subway|light_rail)$"]["name"](around:${r},${lat},${lon});nwr["amenity"="bus_station"]["name"](around:${r},${lat},${lon}););out center tags qt 60;`);

  /* ---------- Live search ---------- */
  /** Everything Overpass finds within `radius` metres of a route (a list of [lat, lon] points). */
  const alongOverpass = (filter, pts, radius) => overpass(
    `[out:json][timeout:40];nwr${filter}(around:${radius},${pts.map(p => p[0].toFixed(4) + ',' + p[1].toFixed(4)).join(',')});out center tags qt 400;`);

  /** Nominatim search for `term` inside a square of half-width `km` around a point (backup for along-route search). */
  async function nominatimBox(term, lat, lon, km) {
    const key = `nb:${term}:${lat.toFixed(2)},${lon.toFixed(2)},${km}`;
    let rows = cache.get(key) || lsGet(key);
    if (!rows) {
      const dLat = km / 111, dLon = km / (111 * Math.cos(lat * Math.PI / 180));
      await nomGate();
      rows = await fetchJSON(`https://nominatim.openstreetmap.org/search?format=jsonv2&extratags=1&bounded=1&limit=30&accept-language=en&viewbox=${lon - dLon},${lat + dLat},${lon + dLon},${lat - dLat}&q=${encodeURIComponent(term)}`);
      lsSet(key, rows);
    }
    cache.set(key, rows);
    return rows.filter(x => x.name && NOM_CATS.has(x.category))
      .map(x => ({ type: x.osm_type, id: x.osm_id, lat: +x.lat, lon: +x.lon, tags: { ...(x.extratags || {}), name: x.name, [x.category]: x.type } }));
  }

  /** Nominatim free-text search biased to a box around (lat, lon); widens if few local hits. */
  async function searchPlaces(term, lat, lon, km = 40) {
    const key = `s:${term.toLowerCase()}:${lat.toFixed(2)},${lon.toFixed(2)}`;
    if (cache.has(key)) return cache.get(key);
    const dLat = km / 111, dLon = km / (111 * Math.cos(lat * Math.PI / 180));
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&extratags=1&addressdetails=1&limit=30&accept-language=en&viewbox=${lon - dLon},${lat + dLat},${lon + dLon},${lat - dLat}&q=${encodeURIComponent(term)}`;
    await nomGate();
    let rows = await fetchJSON(url + '&bounded=1');
    let wide = false;
    if (rows.length < 3) {
      await nomGate();
      const more = await fetchJSON(url + '&bounded=0');
      const seen = new Set(rows.map(r => r.osm_type + r.osm_id));
      rows = rows.concat(more.filter(r => !seen.has(r.osm_type + r.osm_id)));
      wide = true;
    }
    const out = { rows, wide };
    cache.set(key, out);
    return out;
  }

  /** Full-text search on a Wikimedia site ('wikivoyage' | 'wikipedia'). */
  async function wikiSearch(site, term, limit = 5) {
    const key = `ws:${site}:${term.toLowerCase()}`;
    if (cache.has(key)) return cache.get(key);
    const j = await fetchJSON(`https://en.${site}.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(term)}&srlimit=${limit}&format=json&origin=*`);
    const out = (j.query?.search || []).map(r => ({
      title: r.title, snippet: r.snippet,
      url: `https://en.${site}.org/wiki/${encodeURIComponent(r.title.replace(/ /g, '_'))}`,
    }));
    cache.set(key, out);
    return out;
  }

  /* ---------- OSRM ---------- */
  const OSRM = 'https://router.project-osrm.org';
  const ll = p => `${(+p.lon).toFixed(5)},${(+p.lat).toFixed(5)}`;

  /** Road distance/duration from src to each dest (max 99 dests). */
  async function osrmTable(src, dests) {
    const coords = [src, ...dests].map(ll).join(';');
    const idx = dests.map((_, i) => i + 1).join(';');
    const j = await fetchJSON(`${OSRM}/table/v1/driving/${coords}?sources=0&destinations=${idx}&annotations=duration,distance`);
    if (j.code !== 'Ok') throw new Error(j.code);
    return j.durations[0].map((d, i) => ({
      dur: d == null ? null : d / 60,
      dist: j.distances[0][i] == null ? null : j.distances[0][i] / 1000,
    }));
  }

  async function osrmRoute(pts, geometry = true) {
    const j = await fetchJSON(`${OSRM}/route/v1/driving/${pts.map(ll).join(';')}?overview=${geometry ? 'full' : 'false'}&geometries=geojson`);
    if (j.code !== 'Ok' || !j.routes?.length) throw new Error(j.code || 'NoRoute');
    const r = j.routes[0];
    return {
      dist: r.distance / 1000, dur: r.duration / 60,
      coords: geometry ? r.geometry.coordinates.map(([x, y]) => [y, x]) : [],
      legs: r.legs.map(l => ({ dist: l.distance / 1000, dur: l.duration / 60 })),
    };
  }

  /* ---------- Wikivoyage ---------- */
  async function guide(title) {
    const key = 'w:' + title;
    if (cache.has(key)) return cache.get(key);
    const j = await fetchJSON(`https://en.wikivoyage.org/w/api.php?action=query&prop=extracts&explaintext=1&redirects=1&format=json&origin=*&titles=${encodeURIComponent(title)}`);
    const page = Object.values(j.query?.pages || {})[0];
    let out = null;
    if (page && page.missing === undefined && page.extract) {
      const text = page.extract;
      const re = /^==\s*([^=].*?)\s*==\s*$/gm;
      const marks = [];
      let m;
      while ((m = re.exec(text))) marks.push({ title: m[1], start: m.index, end: re.lastIndex });
      out = { intro: text.slice(0, marks[0]?.start ?? 600).trim(), sections: {} };
      marks.forEach((mk, i) => {
        out.sections[mk.title.toLowerCase()] = text.slice(mk.end, marks[i + 1]?.start ?? text.length).trim();
      });
      out.url = 'https://en.wikivoyage.org/wiki/' + encodeURIComponent(page.title.replace(/ /g, '_'));
    }
    cache.set(key, out);
    return out;
  }

  /* ---------- Weather ---------- */
  async function weather(lat, lon) {
    const j = await fetchJSON(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`);
    const d = j.daily;
    return d.time.map((t, i) => ({
      date: t, code: d.weather_code[i], max: d.temperature_2m_max[i], min: d.temperature_2m_min[i], rain: d.precipitation_probability_max[i],
    }));
  }

  return { geocode, places, nominatimPlaces, searchPlaces, alongOverpass, nominatimBox, wikiSearch, airports, stations, osrmTable, osrmRoute, guide, weather };
})();
