/* TPVM assistant: understands a trip request (or a pasted itinerary), then builds it with the portal's own
   data: geocoding, road routing, places, the Indian price/tax model and Wikivoyage.

   - Instant mode (default): a rules-based parser tuned for Indian trips. No download, works everywhere.
   - Optional on-device AI: a small open model (Qwen2.5, Apache-2.0) run in the browser with WebLLM helps with
     messier wording and summarises Wikivoyage answers. It only *understands*; distances, times and costs always
     come from the portal's engine, never from the model. */
(() => {
'use strict';
const T = window.TPVM;
if (!T) return;
const { S, ico, esc, fmtKm, fmtMin, range, money, hav } = T;
const $ = (s, el = document) => el.querySelector(s);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms = 30000, step = 350) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { if (fn()) return true; } catch { /* keep waiting */ } await sleep(step); }
  return false;
}

/* ============================== language: Indian travel phrasing ============================== */
const ALIAS = {
  bangalore: 'Bengaluru', bombay: 'Mumbai', calcutta: 'Kolkata', madras: 'Chennai', cochin: 'Kochi', trivandrum: 'Thiruvananthapuram',
  pondicherry: 'Puducherry', pondy: 'Puducherry', banaras: 'Varanasi', benares: 'Varanasi', kashi: 'Varanasi', gurgaon: 'Gurugram',
  poona: 'Pune', dilli: 'Delhi', simla: 'Shimla', mysore: 'Mysuru', mangalore: 'Mangaluru', baroda: 'Vadodara', allahabad: 'Prayagraj',
  vizag: 'Visakhapatnam', ncr: 'Delhi', ladakh: 'Leh', 'leh ladakh': 'Leh', 'new delhi': 'New Delhi', hampi: 'Hampi', 'pink city': 'Jaipur',
};
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const STOPWORDS = new Set(['i', 'we', 'how', 'what', 'when', 'where', 'why', 'who', 'plan', 'trip', 'want', 'go', 'going', 'travel', 'get', 'can', 'should', 'is', 'are', 'the', 'a', 'an', 'my', 'our', 'please', 'help', 'me', 'show', 'tell', 'do', 'does', 'best', 'any', 'add', 'remove', 'delete', 'find', 'search', 'day', 'days', 'night', 'nights', 'reach', 'visit', 'see', 'ok', 'okay', 'yes', 'no', 'thanks', 'thank', 'cool', 'great', 'nice', 'good', 'bye', 'sure', 'hmm']);
const NOT_PLACES = new Set(['food', 'street food', 'local food', 'shopping', 'sightseeing', 'temples', 'museums', 'forts', 'markets', 'beaches', 'nightlife', 'culture', 'heritage', 'adventure', 'sights', 'places', 'things', 'it', 'there', 'everything', 'city', 'the city', 'and', 'more', 'etc', 'budget', 'luxury', 'relaxing']);
const clean = s => String(s || '').replace(/\s+/g, ' ').replace(/^[\s,.;:–—-]+|[\s,.;:–—-]+$/g, '').trim();
const cityLike = s => { s = clean(s); const w = s.split(' '); return !!s && w.length <= 3 && !/\d/.test(s) && !STOPWORDS.has(w[0].toLowerCase()) && s.length > 1; };
const tidyCity = s => clean(s).replace(/\b(city|trip|tour|holiday|vacation|visit|please)\b$/i, '').replace(/^(the)\s+/i, '').trim();
const END = '(?=\\s+(?:for|on|with|in|by|via|from|visit|see|seeing|staying|budget|luxury|cheap|premium|comfort|that|where|and\\s+(?:see|visit|cover)|\\d)|[,.;!?\\n]|$)';

function parseRoute(text) {
  let from = null, to = null, m;
  if ((m = text.match(new RegExp('\\bfrom\\s+(.+?)\\s+to\\s+(.+?)' + END, 'i'))) && cityLike(m[1]) && cityLike(m[2])) { from = m[1]; to = m[2]; }
  else if ((m = text.match(/^\s*(?:plan\s+)?([A-Za-z][A-Za-z .'-]{1,30}?)\s*(?:->|→|–|—|\bto\b)\s*([A-Za-z][A-Za-z .'-]{1,30}?)(?=\s+(?:for|on|with|in|by|via|visit|see|budget|luxury|cheap|\d)|[,.;!?\n]|$)/i)) && cityLike(m[1]) && cityLike(m[2])) { from = m[1]; to = m[2]; }
  if (!from && !to && (m = text.match(new RegExp('\\b(?:reach|get to|go to|going to|travel to|travelling to|drive to|fly to|trip to|visit)\\s+(.+?)\\s+from\\s+(.+?)' + END, 'i'))) && cityLike(m[1]) && cityLike(m[2])) { to = m[1]; from = m[2]; }
  if (!to) {
    const pats = [
      new RegExp('\\b(?:trip|travel|travelling|traveling|journey|holiday|vacation|tour|go|going|fly|drive|head|heading)\\s+to\\s+(.+?)' + END, 'i'),
      new RegExp('\\b\\d+[- ]?days?\\s+(?:in|at|around)\\s+(.+?)' + END, 'i'),
      new RegExp('\\b(?:weekend|trip|holiday|vacation|stay)\\s+(?:in|at)\\s+(.+?)' + END, 'i'),
      /\bplan\s+(?:a\s+|an\s+|my\s+|the\s+)?(?:\d+[- ]?days?\s+)?([A-Za-z][A-Za-z .'-]{1,25}?)\s+(?:trip|itinerary|tour)\b/i,
    ];
    for (const re of pats) { m = text.match(re); if (m && cityLike(m[1])) { to = m[1]; break; } }
  }
  if (!from) { m = text.match(new RegExp('\\b(?:from|starting from|leaving from|departing from|starting in)\\s+(.+?)' + END, 'i')); if (m && cityLike(m[1])) from = m[1]; }
  from = from && tidyCity(from); to = to && tidyCity(to);
  if (from && to && from.toLowerCase() === to.toLowerCase()) from = null;
  return { from, to };
}

function parseDate(text) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  let m = text.match(/\b(20\d{2})-(\d{2})-(\d{2})\b/); if (m) return m[0];
  const build = (day, mon, yr) => {
    let d = new Date(yr || today.getFullYear(), mon, +day);
    if (!yr && d < today) d = new Date(today.getFullYear() + 1, mon, +day);
    return isNaN(d) ? null : iso(d);
  };
  m = text.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*(?:\s+(20\d{2}))?\b/i);
  if (m) return build(m[1], MONTHS.indexOf(m[2].toLowerCase()), m[3] && +m[3]);
  m = text.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(20\d{2}))?\b/i);
  if (m) return build(m[2], MONTHS.indexOf(m[1].toLowerCase()), m[3] && +m[3]);
  if (/\btomorrow\b/i.test(text)) { const d = new Date(today); d.setDate(d.getDate() + 1); return iso(d); }
  return null;
}

const splitList = s => String(s).split(/\s*(?:,|;|\band\b|&|\+|→|->|\n|•|\bthen\b)\s*/i)
  .map(x => clean(x).replace(/\s+(?:for|on|with|in|by|budget|luxury|cheap|from|to|and)\b.*$/i, '').replace(/^(?:the|a)\s+(?=[A-Z])/i, ''))
  .filter(x => x.length > 2 && x.length < 60 && !NOT_PLACES.has(x.toLowerCase()) && !/^\d+$/.test(x));

function parsePlaces(text) {
  const groups = [], found = [];
  const chunks = text.split(/(?=\bday\s*\d+\s*[:\-–—])/i);
  let pre = text;
  if (chunks.length > 1 || /^day\s*\d+\s*[:\-–—]/i.test(text.trim())) {
    pre = '';
    for (const c of chunks) {
      const m = c.match(/^\s*day\s*(\d+)\s*[:\-–—]\s*([\s\S]*)$/i);
      if (m) { const names = splitList(m[2].split(/[.!?]\s+(?=[A-Z])/)[0]); if (names.length) groups.push({ day: +m[1], places: names }); }
      else pre += c + ' ';
    }
  }
  const verbs = /(?:\bvisit(?:ing)?|\bsee(?:ing)?|\bcover|\binclude|\bexplore|\bstops?(?: at| in)?|\bplaces?(?: like| such as| to see)?|\bmust[- ]see|\bsightseeing(?: at| in| of)?|\bcheck(?:ing)? out)\s*:?\s+([^.!?\n]+)/gi;
  let m;
  while ((m = verbs.exec(pre))) found.push(...splitList(m[1]));
  if (!found.length && !groups.length) {   // a bulleted or numbered list on its own lines
    const lines = pre.split('\n').map(l => l.trim()).filter(l => /^([-*•]|\d+[.)])\s+/.test(l));
    if (lines.length >= 2) lines.forEach(l => found.push(...splitList(l.replace(/^([-*•]|\d+[.)])\s+/, ''))));
  }
  return { groups, found: [...new Set(found)] };
}

function parseNumbers(text) {
  const out = {};
  let m;
  if ((m = text.match(/(\d+)\s*[- ]?\s*nights?/i))) out.nights = +m[1];
  else if ((m = text.match(/(\d+)\s*[- ]?\s*days?\b/i))) out.nights = Math.max(1, +m[1] - 1);
  else if (/\bweekend\b/i.test(text)) out.nights = 1;
  else if ((m = text.match(/\b(\d+|a|one)\s*weeks?\b/i))) out.nights = ((/^\d/.test(m[1]) ? +m[1] : 1) * 7) - 1;
  if ((m = text.match(/\b(\d+)\s*(?:people|persons?|pax|adults?|travell?ers?|guests|friends|members|of us)\b/i)) || (m = text.match(/\b(?:family|group) of (\d+)/i))) out.travelers = Math.min(20, +m[1]);
  else if ((m = text.match(/\bfor\s+(\d{1,2})\b(?!\s*[- ]?\s*(?:days?|nights?|weeks?|hrs?|hours?|km|k\b|rs|inr|₹|lakh))/i))) out.travelers = Math.min(20, +m[1]);
  else if (/\bsolo\b|\bby myself\b|\balone\b/i.test(text)) out.travelers = 1;
  else if (/\b(couple|honeymoon)\b/i.test(text)) out.travelers = 2;
  if (/\b(budget|cheap|backpack\w*|economy|low[- ]cost|shoestring)\b/i.test(text)) out.tier = 0.6;
  else if (/\b(luxury|premium|5[- ]?star|splurge|lavish|high[- ]end)\b/i.test(text)) out.tier = 2;
  else if (/\b(comfort\w*|mid[- ]?range|standard)\b/i.test(text)) out.tier = 1;
  return out;
}

/** Everything the rules can read from one message. */
function parse(text) {
  const route = parseRoute(text), { groups, found } = parsePlaces(text), nums = parseNumbers(text);
  const inRoute = n => n && [route.from, route.to].some(x => x && (x.toLowerCase() === n.toLowerCase()));
  let places = found.filter(n => !inRoute(n));
  const groupsClean = groups.map(g => ({ day: g.day, places: g.places.filter(n => !inRoute(n)) })).filter(g => g.places.length);
  let to = route.to;
  if (!to && !route.from && places.length === 1 && !groupsClean.length && text.trim().split(/\s+/).length <= 8) { to = places[0]; places = []; }
  return { ...route, to, ...nums, start: parseDate(text), places, groups: groupsClean };
}

/** What kind of message is this? */
function classify(text, p) {
  const t = text.toLowerCase().trim();
  const hasTrip = !!S.trip;
  if (/^(hi|hello|hey|namaste|namaskar|help|what can you do|who are you)\b/.test(t)) return 'help';
  if (/\b(reset|start over|new trip|clear (?:the |my )?(?:plan|itinerary|stops))\b/.test(t)) return 'reset';
  const isQ = /^(what|when|where|how|which|is|are|can|should|any|do|does|best)\b/.test(t) || t.endsWith('?');
  const followUp = hasTrip && /\b(cost|price|budget|how much|on the way|along|near|nearby|around|optimi[sz]e)\b/.test(t);
  if (isQ && !p.from && !p.groups.length && !/\b(plan|itinerary)\b/.test(t) && !followUp) return 'question';
  const planLike = p.from || p.groups.length || p.places.length > 1 || p.to;
  if (hasTrip && !p.from && !planLike) {
    if (/\b(on the way|along the (?:route|way|road|journey)|en ?route|on route|on my way)\b/.test(t) || (/\b(along|on the)\b/.test(t) && topicOf(t))) return 'along';
    if (/\b(cost|price|budget|expens|how much|total|spend)\b/.test(t)) return 'cost';
    if (/\b(optimi[sz]e|re-?order|best order|shortest)\b/.test(t)) return 'optimise';
    if (/^\s*add\s+/.test(t)) return 'add';
    if (/\b(suggest|recommend|fill|what else)\b/.test(t) && /\b(sights?|places|days?|more)\b/.test(t)) return 'suggest';
    if (/\b(near|nearby|around|close to|closest|find)\b/.test(t) && topicOf(t)) return 'nearby';
    if (/\b(copy|share|export)\b/.test(t)) return 'copy';
  }
  if (planLike) return 'plan';
  if (/\b(what|when|where|how|which|is|are|can|should|best|safe|tips?|worth|recommend)\b/.test(t) || t.endsWith('?')) return 'question';
  if (t.split(/\s+/).length <= 4 && /^[a-z .'-]+$/i.test(t) && cityLike(t)) { p.to = tidyCity(text); return 'plan'; }
  return 'other';
}

const topicOf = t => T.topicFor(t.replace(/\b(on the way|along the (?:route|way|road|journey)|en ?route|near(?:by)?|around|find|any|a|the|show|me|is there|are there|where|can i|for)\b/g, ' ').replace(/\s+/g, ' ').trim()) || T.topicFor(t);

/* ============================== chat UI ============================== */
const ui = {};
let started = false, pending = null, lastPlan = null, busy = false, typedDest = '';   // typedDest: the destination as the user wrote it ("Ooty")

function buildUI() {
  const panel = $('.panel');
  ui.fab = document.createElement('button');
  ui.fab.className = 'chat-fab'; ui.fab.type = 'button'; ui.fab.setAttribute('aria-label', 'Open the TPVM assistant');
  ui.fab.innerHTML = `${ico('chat')}<span>Ask TPVM</span>`;
  ui.box = document.createElement('section');
  ui.box.className = 'chat'; ui.box.hidden = true; ui.box.setAttribute('aria-label', 'TPVM assistant');
  ui.box.innerHTML = `
    <header class="chat-h">
      <div class="chat-t"><span class="chat-logo">${ico('wand')}</span><div><b>TPVM Assistant</b><small id="chatMode">Instant mode · works offline of any model</small></div></div>
      <div class="chat-hb"><button type="button" id="chatCfg" title="On-device AI settings" aria-label="AI settings">${ico('info')}</button><button type="button" id="chatClose" title="Close" aria-label="Close assistant">${ico('x')}</button></div>
    </header>
    <div class="chat-cfg" id="chatCfgBox" hidden>
      <b>On-device AI (optional)</b>
      <p>Instant mode already understands most trip requests. Turn this on for messier wording and for answers summarised from the travel guide. A small open model (Qwen2.5, Apache-2.0) downloads once and runs <b>in your browser</b>: nothing you type is sent to a server. Needs WebGPU (recent Chrome or Edge).</p>
      <div class="row"><select id="aiSize"><option value="light">Light · Qwen2.5 0.5B (about 400 MB)</option><option value="better">Better · Qwen2.5 1.5B (about 1 GB)</option></select>
      <button type="button" class="btn sm solid" id="aiLoad">Download &amp; enable</button></div>
      <div class="aibar" id="aiBarWrap" hidden><i id="aiBar"></i></div><small id="aiMsg"></small>
    </div>
    <div class="chat-log" id="chatLog" aria-live="polite"></div>
    <div class="chat-chips" id="chatChips"></div>
    <form class="chat-in" id="chatForm"><textarea id="chatText" rows="1" placeholder="Where to? e.g. 3 days in Jaipur from Delhi, visit Amber Fort"></textarea><button class="send" type="submit" aria-label="Send">${ico('send')}</button></form>`;
  panel.appendChild(ui.box);
  panel.appendChild(ui.fab);
  Object.assign(ui, { log: $('#chatLog'), text: $('#chatText'), mode: $('#chatMode'), cfg: $('#chatCfgBox') });

  ui.fab.addEventListener('click', openChat);
  $('#chatClose').addEventListener('click', closeChat);
  $('#chatCfg').addEventListener('click', () => { ui.cfg.hidden = !ui.cfg.hidden; });
  $('#aiLoad').addEventListener('click', () => (AI.state === 'ready' ? aiDisable() : aiEnable($('#aiSize').value)));
  $('#chatForm').addEventListener('submit', e => { e.preventDefault(); send(ui.text.value); });
  ui.text.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(ui.text.value); } });
  ui.text.addEventListener('input', () => { ui.text.style.height = 'auto'; ui.text.style.height = Math.min(120, ui.text.scrollHeight) + 'px'; });
  ui.log.addEventListener('click', onLogClick);
  $('#chatChips').addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (b) send(b.dataset.q); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !ui.box.hidden) closeChat(); });
}

function openChat() {
  if (!started) { started = true; greet(); }
  ui.box.hidden = false; ui.fab.hidden = true;
  setTimeout(() => ui.text.focus(), 50);
  try { if (localStorage.getItem('tpvm.ai') && AI.state === 'off') aiEnable(localStorage.getItem('tpvm.ai')); } catch { /* ignore */ }
}
function closeChat() { ui.box.hidden = true; ui.fab.hidden = false; }
const isMobile = () => matchMedia('(max-width: 900px)').matches;

const EXAMPLES = [
  '3 days in Jaipur from Delhi for 2, visit Amber Fort and Hawa Mahal',
  'Mumbai to Goa, 4 days, budget, visit Fort Aguada and Basilica of Bom Jesus',
  'Kolkata to Darjeeling for 5 days',
  'Bengaluru to Hyderabad. Day 1: Charminar, Golconda Fort. Day 2: Ramoji Film City',
];
function setChips(list) { $('#chatChips').innerHTML = list.map(q => `<button type="button" data-q="${esc(q)}">${esc(q.length > 52 ? q.slice(0, 50) + '…' : q).replace(/\n/g, ' ')}</button>`).join(''); }

function greet() {
  say(`<p><b>Namaste!</b> Tell me where you want to go, or paste your whole itinerary. I'll find the places, draw the route on the map, work out distances and times, and add up the cost with taxes.</p>
    <p class="cb-hint">Try one of the examples below, or ask things like “petrol pumps on the way”, “how much will it cost?”, “add Jantar Mantar to day 2”, or “best time to visit?”.</p>`);
  setChips(EXAMPLES);
}

function say(html, cls = 'bot') {
  const el = document.createElement('div');
  el.className = 'msg ' + cls;
  el.innerHTML = `<div class="bubble">${html}</div>`;
  ui.log.appendChild(el);
  const api = {
    el,
    set(h) { el.firstChild.innerHTML = h; scroll(); return api; },
    append(h) { el.firstChild.insertAdjacentHTML('beforeend', h); scroll(); return api; },
  };
  scroll();
  return api;
}
const scroll = () => { ui.log.scrollTop = ui.log.scrollHeight; };
const working = (b, m) => b.set(`<span class="spinner"></span>${m}`);

function onLogClick(e) {
  const b = e.target.closest('[data-cb]'); if (!b) return;
  const a = b.dataset.cb;
  if (a === 'plan') { T.setTab('plan'); fitPlan(); if (isMobile()) closeChat(); }
  else if (a === 'journey') { T.setTab('overview'); if (isMobile()) closeChat(); }
  else if (a === 'along') { T.setTab('along'); if (isMobile()) closeChat(); }
  else if (a === 'search') { T.setTab('search'); if (isMobile()) closeChat(); }
  else if (a === 'copy') copyPlan();
  else if (a === 'cost') send('How much will it cost?');
  else if (a === 'q') send(b.dataset.q);
}

const copyPlan = () => navigator.clipboard?.writeText(T.planText()).then(() => T.toast('Itinerary copied'), () => T.toast('Copy blocked by the browser'));

function fitPlan() {
  const pts = S.plan.items.map(i => [i.place.lat, i.place.lon]);
  if (S.base) pts.push([S.base.lat, S.base.lon]);
  if (pts.length) T.fitPts(pts, { pad: { top: 90, bottom: 50, left: 50, right: 50 }, maxZoom: 14 });
}

/* ============================== understanding ============================== */
/** True if `name` (or an everyday alias of it, like Bangalore for Bengaluru) really appears in what the user typed. */
function appearsIn(text, name) {
  const lower = text.toLowerCase(), n = String(name).toLowerCase();
  if (lower.includes(n)) return true;
  if (Object.entries(ALIAS).some(([k, v]) => v.toLowerCase() === n && lower.includes(k))) return true;
  return n.split(/\s+/).some(w => w.length >= 5 && lower.includes(w));
}

async function understand(text, bot) {
  const rules = parse(text);
  rules.type = classify(text, rules);
  // The rules decide whenever they recognise the message. The AI only helps with messages they cannot read,
  // and nothing it returns is used unless it really appears in what the user typed (small models invent things).
  const needsAI = rules.type === 'other' || (rules.type === 'plan' && !rules.to);
  if (AI.state !== 'ready' || !needsAI) return rules;
  working(bot, 'Reading your message with the on-device AI…');
  try {
    const ai = await aiParse(text);
    if (!ai) return rules;
    const grounded = n => n && appearsIn(text, n);
    const inText = n => n != null && new RegExp('\\b(' + n + '|' + (n + 1) + ')\\b').test(text);
    const merged = { ...rules };
    if (rules.type === 'other' && ['plan', 'cost', 'along', 'nearby', 'add', 'question'].includes(ai.intent)) merged.type = ai.intent;
    if (merged.from == null && grounded(ai.from)) merged.from = ai.from;
    if (merged.to == null && grounded(ai.to)) merged.to = ai.to;
    if (merged.nights == null && inText(ai.nights)) merged.nights = ai.nights;
    if (merged.travelers == null && ai.travelers != null && new RegExp('\\b' + ai.travelers + '\\b').test(text)) merged.travelers = ai.travelers;
    if (merged.tier == null && ai.tier != null) merged.tier = ai.tier;
    if (!merged.places.length) merged.places = ai.places.filter(grounded);
    if (!merged.groups.length) merged.groups = ai.groups.map(g => ({ day: g.day, places: g.places.filter(grounded) })).filter(g => g.places.length);
    merged.topic = SEARCH_TOPICS.some(t => t.id === ai.topic) ? ai.topic : null;
    return merged;
  } catch (e) { console.warn('AI parse failed, using rules:', e.message); return rules; }
}

/* ============================== doing things ============================== */
async function send(raw) {
  const text = String(raw || '').trim();
  if (!text || busy) return;
  ui.text.value = ''; ui.text.style.height = 'auto'; setChips([]);
  say(esc(text).replace(/\n/g, '<br>'), 'user');
  busy = true;
  const bot = say('<span class="spinner"></span>Thinking…');
  try { await handle(text, bot); }
  catch (e) { console.error(e); bot.set(`<p>Sorry, something went wrong: ${esc(e.message || e)}.</p><p class="cb-hint">Check your connection and try again.</p>`); }
  finally { busy = false; scroll(); }
}

async function handle(text, bot) {
  // answering "where are you starting from?"
  if (pending && !/\b(reset|start over)\b/i.test(text)) {
    const cand = tidyCity(text.replace(/^(?:from|starting from|i(?:'m| am) (?:in|from))\s+/i, '').replace(/[.!?]+$/, ''));
    if (cityLike(cand) && text.trim().split(/\s+/).length <= 6) {
      const it = { ...pending, [pending.need === 'to' ? 'to' : 'from']: cand }; pending = null;
      return executePlan(it, bot);
    }
    pending = null;
  }
  const it = await understand(text, bot);
  switch (it.type) {
    case 'help': return bot.set(helpHtml());
    case 'reset': return doReset(bot);
    case 'plan': return executePlan(it, bot);
    case 'cost': return doCost(bot);
    case 'along': return doAlong(it, text, bot);
    case 'nearby': return doNearby(it, text, bot);
    case 'add': return doAdd(text, bot);
    case 'optimise': return doOptimise(bot);
    case 'suggest': return doSuggest(bot);
    case 'copy': copyPlan(); return bot.set('<p>Itinerary copied to your clipboard.</p>');
    case 'question': return doQuestion(text, bot);
    default: return bot.set(helpHtml(true));
  }
}

const helpHtml = unsure => `<p>${unsure ? "I'm not sure what you'd like to do. " : ''}I can:</p>
  <ul class="cb-list"><li><b>Plan a trip:</b> “3 days in Jaipur from Delhi for 2 people, visit Amber Fort and Hawa Mahal”</li>
  <li><b>Use your itinerary:</b> paste it, e.g. “Day 1: Charminar, Golconda Fort / Day 2: …”</li>
  <li><b>Find things:</b> “petrol pumps on the way”, “pharmacy near the hotel”</li>
  <li><b>Estimate cost:</b> “how much will it cost?”</li><li><b>Answer travel questions:</b> “best time to visit Jaipur?”</li></ul>`;

const geocodeIndia = async name => {
  const key = ALIAS[name.toLowerCase()] || name;
  const rows = await API.geocode(key);
  return rows.find(r => r.cc === 'IN') || rows[0] || null;
};

const GENERIC = new Set(['fort', 'temple', 'museum', 'palace', 'garden', 'gardens', 'beach', 'market', 'church', 'mandir', 'masjid', 'park', 'lake', 'bazaar', 'gate', 'tomb']);
const tokens = s => String(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !['the', 'and', 'near', 'for'].includes(w));
const close = (a, b) => {   // equal, or one edit apart (for words of 4+ letters)
  if (a === b) return true;
  if (a.length < 4 || b.length < 4 || Math.abs(a.length - b.length) > 1) return false;
  let i = 0, j = 0, edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++edits > 1) return false;
    if (a.length > b.length) i++; else if (a.length < b.length) j++; else { i++; j++; }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};
/** Find a named place near the destination. */
async function resolveStop(name, near) {
  const { rows } = await API.searchPlaces(name, near.lat, near.lon, 40);
  const want = tokens(name);
  const weight = w => (GENERIC.has(w) ? 0.35 : 1), total = want.reduce((t, w) => t + weight(w), 0) || 1;
  let best = null, bestScore = -1;
  for (const r of rows) {
    const have = tokens((r.name || '') + ' ' + (r.display_name || '').split(',').slice(0, 2).join(' '));
    const sc = want.reduce((t, w) => t + (have.some(h => close(w, h)) ? weight(w) : 0), 0) / total;
    if (sc > bestScore + 1e-9) { best = r; bestScore = sc; }
  }
  if (!best || bestScore < 0.55) return null;
  const p = T.searchRow(best);
  return p && hav(near, p) <= 150 ? p : null;
}

const addDays = (iso, n) => { const d = new Date(iso + 'T00:00:00'); d.setDate(d.getDate() + n); return new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 10); };

/** Split a nearest-neighbour chain of places into day groups: places a few km apart share a day. */
function clusterChain(chain, days) {
  const segs = [];
  chain.forEach((p, i) => { if (i && hav(chain[i - 1], p) <= 6) segs[segs.length - 1].push(p); else segs.push([p]); });
  while (segs.length > days) {   // too many groups: merge the two closest neighbours
    let bi = 0, bd = Infinity;
    for (let i = 0; i < segs.length - 1; i++) { const g = hav(segs[i][segs[i].length - 1], segs[i + 1][0]); if (g < bd) { bd = g; bi = i; } }
    segs.splice(bi, 2, segs[bi].concat(segs[bi + 1]));
  }
  return segs;
}

async function executePlan(it, bot) {
  if (!it.to) {
    pending = { ...it, need: 'to' };
    return bot.set('<p>Where would you like to go?</p>');
  }
  let fromObj = null;
  if (!it.from) {
    if (S.trip?.from) fromObj = S.trip.from;
    else { pending = { ...it, need: 'from' }; return bot.set(`<p>Great choice, <b>${esc(it.to)}</b>. Where are you travelling from?</p><p class="cb-hint">Just type a city, for example “Delhi”.</p>`); }
  }
  working(bot, `Finding ${esc(it.to)}…`);
  const to = await geocodeIndia(it.to);
  if (!to) return bot.set(`<p>I couldn't find a place called “${esc(it.to)}”. Could you check the spelling or add the state, like “Munnar, Kerala”?</p>`);
  const from = fromObj || await geocodeIndia(it.from);
  if (!from) return bot.set(`<p>I couldn't find “${esc(it.from)}”. Could you check the spelling?</p>`);

  typedDest = it.to;
  const explicit = it.groups.length > 0;
  const maxDay = explicit ? Math.max(...it.groups.map(g => g.day)) : 0;
  const nights = it.nights ?? (explicit ? Math.max(1, maxDay - 1) : 2);
  const today = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 10);
  let start = it.start || $('#startDate').value;
  if (!start || start < today) start = addDays(today, 14);   // never plan a trip that starts in the past
  const tier = it.tier ?? +$('#tier').value, travelers = it.travelers ?? +$('#travelers').value;
  T.beginTrip({ from, to, start, end: addDays(start, nights), travelers, tier });

  working(bot, `Drawing the route from ${esc(from.city || from.name)} to ${esc(to.city || to.name)}…`);
  await waitFor(() => S.reach && (S.reach.coords?.length || !S.reach.loading), 25000);

  // the places the user asked for
  const wanted = [];
  it.groups.forEach(g => g.places.forEach(n => wanted.push({ name: n, day: g.day })));
  it.places.forEach(n => { if (!wanted.some(w => w.name.toLowerCase() === n.toLowerCase())) wanted.push({ name: n, day: null }); });
  // a city the user is travelling between is not a stop (small AI models often list them as places)
  const norm = n => (ALIAS[String(n).toLowerCase()] || String(n)).toLowerCase().trim();
  const cityNames = new Set([it.from, it.to, from.name, from.city, to.name, to.city].filter(Boolean).map(norm));
  for (let i = wanted.length - 1; i >= 0; i--) if (cityNames.has(norm(wanted[i].name))) wanted.splice(i, 1);
  const found = [], missing = [];
  for (let i = 0; i < wanted.length; i++) {
    working(bot, `Locating ${esc(wanted[i].name)} (${i + 1} of ${wanted.length})…`);
    let p = null;
    try { p = await resolveStop(wanted[i].name, to); } catch { /* treated as not found */ }
    if (p && !found.some(f => hav(f.p, p) < 0.08)) found.push({ p, day: wanted[i].day });
    else if (!p) missing.push(wanted[i].name);
  }

  let suggested = false;
  if (!wanted.length) {
    working(bot, `Finding the main sights in ${esc(to.city || to.name)}…`);
    await waitFor(() => !S.loading.see && S.places.see, 50000);
    const list = (S.places.see || []).filter(p => p.dist <= 15)
      .sort((a, b) => (b.notable - a.notable) || (a.dist - b.dist)).slice(0, Math.min(9, (nights + 1) * 3));
    list.forEach(p => found.push({ p, day: null }));
    suggested = list.length > 0;
  }

  // spread the stops over the days
  let days = nights + 1;
  if (explicit && it.nights == null) days = Math.max(days, maxDay);
  if (found.length > days * 4) days = Math.min(10, Math.ceil(found.length / 4));
  const buckets = Array.from({ length: days }, () => []);
  found.filter(f => f.day).forEach(f => buckets[Math.min(days, f.day) - 1].push(f.p));
  const free = found.filter(f => !f.day).map(f => f.p);
  const autoDays = new Set();
  if (free.length) {
    const hasFixed = found.some(f => f.day);
    const ordered = []; let cur = S.base; const left = free.slice();
    while (left.length) { let bi = 0, bd = Infinity; left.forEach((p, i) => { const k = hav(cur, p); if (k < bd) { bd = k; bi = i; } }); const [n] = left.splice(bi, 1); ordered.push(n); cur = n; }
    if (!hasFixed) clusterChain(ordered, days).forEach((seg, i) => buckets[i].push(...seg));
    else ordered.forEach(p => { let bi = 0; buckets.forEach((b, i) => { if (b.length < buckets[bi].length) bi = i; }); buckets[bi].push(p); });
    buckets.forEach((b, i) => { if (b.length) autoDays.add(i + 1); });
    if (hasFixed) it.groups.forEach(g => autoDays.delete(g.day));
  }
  S.plan.items = []; S.routes = {}; S.plan.days = days; S.plan.active = 1;
  buckets.forEach((b, i) => b.forEach(p => T.planAddPlace(p, i + 1)));
  autoDays.forEach(d => T.optimiseDay(d));
  T.replan();
  T.setTab('plan');
  const usedDays = buckets.map((b, i) => b.length ? i + 1 : 0).filter(Boolean);
  working(bot, 'Working out distances, times and costs…');
  await waitFor(() => usedDays.every(d => S.routes[d] && !S.routes[d].pending), 30000);
  fitPlan();

  lastPlan = { from, to, days };
  bot.set(planCard({ from, to, days, missing, suggested, nights }));
  if (isMobile()) bot.append('<p class="cb-hint">Tap “Show itinerary” to see it on the map.</p>');
  setChips(['How much will it cost?', 'Petrol pumps on the way', 'Best time to visit ' + (to.city || to.name) + '?', 'Optimise the order']);
}

function planCard({ from, to, days, missing, suggested, nights }) {
  const trip = S.trip, fromN = from.city || from.name, toN = to.city || to.name, rc = S.reach;
  const modes = T.calcModes(), b = T.calcBudget();
  let h = `<div class="cb"><div class="cb-route"><b>${esc(fromN)} → ${esc(toN)}</b><span>${rc?.road ? `${fmtKm(rc.road)} · ${fmtMin(rc.roadTime)} by road` : `${fmtKm(rc?.air)} by air`}</span></div>
    <div class="cb-sub">${esc(T.dayLabel(1))} · ${nights} night${nights > 1 ? 's' : ''} · ${trip.travelers} traveller${trip.travelers > 1 ? 's' : ''} · ${['budget', 'comfort', 'premium'][[.6, 1, 2].indexOf(trip.tier)] || 'comfort'}</div>`;
  if (modes.length) {
    h += `<h5>${ico('plane', 'xs')} Getting there</h5><ul class="cb-list">${modes.map(m => `<li><b>${m.name}</b> · ${fmtMin(m.time)}<br><span class="cb-mut">${m.per}</span>${m.cheapest ? ' <i class="cb-tag">cheapest</i>' : ''}${m.fastest ? ' <i class="cb-tag">fastest</i>' : ''}</li>`).join('')}</ul>`;
  }
  h += `<h5>${ico('calendar', 'xs')} Your itinerary${suggested ? ' <span class="cb-mut">(suggested sights)</span>' : ''}</h5>`;
  for (let d = 1; d <= days; d++) {
    const items = S.plan.items.filter(i => i.day === d), r = S.routes[d];
    if (!items.length) { h += `<div class="cb-day"><b>Day ${d}</b> <span class="cb-mut">${esc(T.dayLabel(d))} · open day. </span><button type="button" class="cb-link" data-cb="q" data-q="Suggest sights to fill the open days">Fill it with nearby sights</button></div>`; continue; }
    h += `<div class="cb-day"><b>Day ${d}</b> <span class="cb-mut">${esc(T.dayLabel(d))}${r && !r.pending ? ` · ${fmtKm(r.dist)} · ${fmtMin(r.dur)} driving` : ''}</span><ol>${items.map((it2, i) => {
      const leg = r?.legs?.[i];
      return `<li>${esc(it2.place.name)}${leg ? ` <span class="cb-mut">${i === 0 ? '' : '+'}${fmtKm(leg.dist)} · ${fmtMin(leg.dur)}${i === 0 ? ' from your base' : ''}</span>` : ''}</li>`;
    }).join('')}</ol></div>`;
  }
  if (missing.length) h += `<p class="cb-warn">Couldn't find: ${missing.map(esc).join(', ')}. Try the exact name, or search for it in the box above the tabs.</p>`;
  h += `<h5>${ico('wallet', 'xs')} Estimated cost <span class="cb-mut">(all taxes included)</span></h5><div class="cb-rows">${b.rows.map(r => `<div><span>${r.k}</span><b>${range(r.lo, r.hi)}</b></div>`).join('')}<div class="cb-tot"><span>Total</span><b>${range(b.lo, b.hi)}</b></div></div>
    <p class="cb-hint">About ${money(b.tax)} of that is taxes, fees, fuel and tolls. These are estimates, not quotes. Check booking sites before you pay.</p>
    <div class="cb-btns"><button type="button" data-cb="plan">${ico('pin', 'xs')}Show itinerary</button><button type="button" data-cb="journey">${ico('route', 'xs')}Show journey</button><button type="button" data-cb="copy">${ico('copy', 'xs')}Copy plan</button></div></div>`;
  return h;
}

function doReset(bot) {
  S.plan.items = []; S.routes = {}; T.replan();
  bot.set('<p>Cleared the itinerary. Tell me about your next trip whenever you are ready.</p>');
  setChips(EXAMPLES);
}

function doCost(bot) {
  if (!S.trip) return bot.set('<p>Tell me where you are going first, and I will work out the cost.</p>');
  const b = T.calcBudget(), n = T.nights();
  bot.set(`<div class="cb"><div class="cb-route"><b>${esc(S.trip.from.city || S.trip.from.name)} → ${esc(S.trip.to.city || S.trip.to.name)}</b><span>${n} night${n > 1 ? 's' : ''} · ${S.trip.travelers} traveller${S.trip.travelers > 1 ? 's' : ''}</span></div>
    <div class="cb-rows">${b.rows.map(r => `<div><span>${r.k}${r.sub ? ` <span class="cb-mut">· ${esc(r.sub)}</span>` : ''}</span><b>${range(r.lo, r.hi)}</b></div>`).join('')}<div class="cb-tot"><span>Total, all taxes included</span><b>${range(b.lo, b.hi)}</b></div></div>
    <p class="cb-hint">About ${money(b.tax)} is taxes, fees, fuel and tolls. Change travellers, dates or style (budget, comfort, premium) in the top bar, or tell me, e.g. “same trip but luxury”. Estimates only.</p></div>`);
}

async function doAlong(it, text, bot) {
  if (!S.reach?.coords?.length) return bot.set('<p>I need a road route first. Tell me where you are travelling from and to.</p>');
  const topic = (it.topic && SEARCH_TOPICS.find(t => t.id === it.topic)) || topicOf(text);
  if (!topic) return bot.set('<p>What should I look for along the way? For example fuel, food, ATMs, hospitals, toilets, EV charging or car repair.</p>');
  working(bot, `Searching the whole route for ${esc(topic.label.toLowerCase())}…`);
  T.setTab('along');
  await T.runAlong({ topic: topic.id });
  const list = S.along.places.slice().sort((a, b) => a.along - b.along);
  if (!list.length) return bot.set(`<p>I couldn't find ${esc(topic.label.toLowerCase())} within a few km of the road. Try another topic.</p>`);
  const pick = list.filter((p, i) => i === 0 || p.along - list[i - 1].along > 8).slice(0, 7);
  bot.set(`<p>Found <b>${list.length}</b> ${esc(topic.label.toLowerCase())} stops along ${esc(S.trip.from.city || S.trip.from.name)} → ${esc(S.trip.to.city || S.trip.to.name)}. Spread along the road:</p>
    <ul class="cb-list">${pick.map(p => `<li><b>${esc(p.name)}</b> <span class="cb-mut">· ${p.along < .5 ? 'at the start' : fmtKm(p.along) + ' from ' + esc(S.trip.from.city || S.trip.from.name)} · ${fmtKm(p.off)} off route</span></li>`).join('')}</ul>
    <p class="cb-hint">${S.along.note ? esc(S.along.note) + ' ' : ''}All of them are pinned on the map.</p>
    <div class="cb-btns"><button type="button" data-cb="along">${ico('route', 'xs')}Open “On the way”</button></div>`);
}

async function doNearby(it, text, bot) {
  const topic = (it.topic && SEARCH_TOPICS.find(t => t.id === it.topic)) || topicOf(text);
  if (!topic) return bot.set('<p>What should I look for? For example a pharmacy, ATM, cafe or petrol pump.</p>');
  working(bot, `Looking for ${esc(topic.label.toLowerCase())} near ${esc(S.trip.to.city || S.trip.to.name)}…`);
  T.searchUI(topic.label);
  await waitFor(() => S.search.done && S.search.q.toLowerCase() === topic.label.toLowerCase(), 50000);
  const list = S.search.places.slice(0, 6);
  if (!list.length) return bot.set(`<p>I couldn't find ${esc(topic.label.toLowerCase())} near ${esc(S.trip.to.city || S.trip.to.name)}.</p>`);
  bot.set(`<p>Nearest <b>${esc(topic.label.toLowerCase())}</b> to ${esc(S.base.name)}:</p><ul class="cb-list">${list.map(p => `<li><b>${esc(p.name)}</b> <span class="cb-mut">· ${p.approx ? '≈ ' : ''}${fmtKm(p.dist)} · ${fmtMin(p.dur)} by car</span></li>`).join('')}</ul>
    <div class="cb-btns"><button type="button" data-cb="search">${ico('search', 'xs')}Open results</button></div>`);
}

async function doAdd(text, bot) {
  if (!S.trip) return bot.set('<p>Plan a trip first, then I can add places to it.</p>');
  const m = text.match(/^\s*add\s+(.+?)(?:\s+(?:to|on|in)\s+day\s*(\d+))?\s*$/i);
  const names = splitList(m ? m[1] : text.replace(/^\s*add\s+/i, ''));
  if (!names.length) return bot.set('<p>Which place should I add? For example “add Jantar Mantar to day 2”.</p>');
  const day = Math.min(S.plan.days, Math.max(1, +(m?.[2]) || S.plan.active || 1));
  const added = [], missing = [];
  for (const n of names) {
    working(bot, `Locating ${esc(n)}…`);
    let p = null; try { p = await resolveStop(n, S.trip.to); } catch { /* not found */ }
    if (p && T.planAddPlace(p, day)) added.push(p); else missing.push(n);
  }
  T.replan();
  await waitFor(() => S.routes[day] && !S.routes[day].pending, 20000);
  const r = S.routes[day];
  bot.set(`${added.length ? `<p>Added ${added.map(p => `<b>${esc(p.name)}</b>`).join(', ')} to <b>Day ${day}</b>.${r ? ` Day ${day} is now ${fmtKm(r.dist)} · ${fmtMin(r.dur)} of driving.` : ''}</p>` : ''}${missing.length ? `<p class="cb-warn">Couldn't find: ${missing.map(esc).join(', ')}.</p>` : ''}
    <div class="cb-btns"><button type="button" data-cb="plan">${ico('pin', 'xs')}Show itinerary</button></div>`);
}

/** Fill days that have nothing planned with the nearest notable sights that are not in the plan yet. */
async function doSuggest(bot) {
  if (!S.trip) return bot.set('<p>Tell me where you are going first.</p>');
  const open = Array.from({ length: S.plan.days }, (_, i) => i + 1).filter(d => !S.plan.items.some(i => i.day === d));
  if (!open.length) return bot.set('<p>Every day already has something planned. Tell me which day to add to, e.g. “add Jantar Mantar to day 2”.</p>');
  working(bot, 'Finding nearby sights…');
  await waitFor(() => !S.loading.see && S.places.see, 50000);
  const have = S.plan.items.map(i => i.place);
  const pool = (S.places.see || []).filter(p => p.dist <= 15 && !have.some(h => hav(h, p) < 0.1))
    .sort((a, b) => (b.notable - a.notable) || (a.dist - b.dist));
  if (!pool.length) return bot.set('<p>I could not find more sights nearby. Try “add” with a specific place name.</p>');
  const added = [];
  open.forEach((d, i) => pool.slice(i * 3, i * 3 + 3).forEach(p => { if (T.planAddPlace(p, d)) added.push(p.name); }));
  open.forEach(d => T.optimiseDay(d));
  T.replan();
  await waitFor(() => open.every(d => !S.plan.items.some(x => x.day === d) || (S.routes[d] && !S.routes[d].pending)), 25000);
  fitPlan();
  bot.set(`<p>Filled ${open.length === 1 ? 'Day ' + open[0] : 'the open days'} with nearby sights: ${added.map(n => `<b>${esc(n)}</b>`).join(', ')}.</p><p class="cb-hint">These come from OpenStreetMap and are simply the closest notable places, so check they suit you.</p>
    <div class="cb-btns"><button type="button" data-cb="plan">${ico('pin', 'xs')}Show itinerary</button><button type="button" data-cb="cost">${ico('wallet', 'xs')}Update the cost</button></div>`);
}

async function doOptimise(bot) {
  if (!S.plan.items.length) return bot.set('<p>There is nothing in the itinerary to re-order yet.</p>');
  for (let d = 1; d <= S.plan.days; d++) T.optimiseDay(d);
  T.replan();
  await waitFor(() => Array.from({ length: S.plan.days }, (_, i) => i + 1).every(d => !S.plan.items.some(x => x.day === d) || (S.routes[d] && !S.routes[d].pending)), 25000);
  const tot = Object.values(S.routes).reduce((s, r) => s + (r.dist || 0), 0);
  bot.set(`<p>Re-ordered each day so the next stop is always the nearest one. Total driving is now about <b>${fmtKm(tot)}</b>.</p><div class="cb-btns"><button type="button" data-cb="plan">${ico('pin', 'xs')}Show itinerary</button></div>`);
}

/* ============================== travel questions (Wikivoyage, optionally summarised by the AI) ============================== */
const SECTION_KEYS = [
  [/best time|when to (?:visit|go)|weather|climate|season|monsoon|summer|winter|rain/i, ['understand', 'climate'], 'Climate|Weather|When to visit|Climate and weather|Seasons?'],
  [/\b(eat|food|restaurant|dish|veg|cuisine|breakfast|lunch|dinner|street food)\b/i, ['eat']],
  [/\b(drink|bar|nightlife|alcohol|pub)\b/i, ['drink']],
  [/\b(buy|shop|shopping|souvenir|market|bazaar|bargain)\b/i, ['buy']],
  [/get around|local transport|metro|auto|rickshaw|taxi|within the city/i, ['get around']],
  [/\b(reach|get in|how to get|flight|train|airport|station|by road)\b/i, ['get in']],
  [/\b(safe|safety|scam|danger|security)\b/i, ['stay safe']],
  [/\b(sleep|stay|hotel|hostel|where to stay|accommodation)\b/i, ['sleep']],
  [/\b(see|visit|sights|attractions|things to|do)\b/i, ['see', 'do']],
];
/** The text under one sub-heading (like "Climate") inside a guide section. */
const subsection = (text, names) => {
  const m = new RegExp('^=+\\s*(?:' + names + ')\\s*=+\\s*$', 'im').exec(text || '');
  if (!m) return '';
  const rest = text.slice(m.index + m[0].length), n = rest.search(/^=+\s*[^=\n]+\s*=+\s*$/m);
  return (n >= 0 ? rest.slice(0, n) : rest).trim();
};
const tidyGuide = (txt, max) => { let t = String(txt || '').replace(/^=+\s*(.*?)\s*=+$/gm, '$1:').replace(/\n{3,}/g, '\n\n').trim(); if (t.length > max) t = t.slice(0, max).replace(/\s\S*$/, '') + '…'; return t; };

const QSTOP = new Set(['what', 'is', 'the', 'an', 'of', 'to', 'in', 'on', 'at', 'for', 'and', 'or', 'are', 'can', 'you', 'my', 'best', 'when', 'where', 'how', 'which', 'should', 'does', 'it', 'there', 'about', 'visit', 'going', 'trip', 'travel', 'tell', 'please', 'any', 'good', 'time', 'place', 'places', 'worth', 'recommend', 'have', 'has', 'had', 'get', 'around', 'here', 'will', 'would', 'could', 'much', 'many', 'there', 'near', 'nearby']);
const SYN = [
  [/best time|when to|season|weather|climate|monsoon|rain|summer|winter/i, ['season', 'month', 'climate', 'weather', 'summer', 'winter', 'monsoon', 'rain', 'temperature', 'festival', 'snow']],
  [/\b(eat|food|restaurant|dish|veg|cuisine|breakfast|lunch|dinner)\b/i, ['eat', 'food', 'restaurant', 'cuisine', 'dish', 'vegetarian', 'thali', 'sweet', 'street']],
  [/\b(safe|safety|scam|danger|crime|women|solo)\b/i, ['safe', 'scam', 'crime', 'danger', 'police', 'harass', 'theft', 'caution', 'tout']],
  [/get around|local transport|metro|rickshaw|taxi|auto\b/i, ['auto', 'rickshaw', 'taxi', 'bus', 'metro', 'cab', 'local', 'ride']],
  [/\b(stay|hotel|hostel|sleep|accommodation)\b/i, ['hotel', 'hostel', 'stay', 'guest', 'lodge', 'budget', 'price']],
  [/\b(shop|buy|souvenir|market|bazaar)\b/i, ['buy', 'shop', 'market', 'bazaar', 'souvenir', 'handicraft']],
  [/\b(reach|get in|how to get|flight|train|airport|station)\b/i, ['flight', 'train', 'airport', 'station', 'bus', 'road', 'reach']],
];
/** The sentences in the guide that best match the question: real text, never generated. */
function bestSentences(g, question, k = 3, city = '') {
  const cityWords = new Set(tokens(city));   // the city name is in nearly every sentence, so it says nothing about relevance
  const lead = String(g.intro || '').slice(0, 260).toLowerCase();   // the guide's opening sentence names the place (Ooty, Ootacamund…)
  const q = tokens(question).filter(w => !QSTOP.has(w) && !cityWords.has(w) && !lead.includes(w));
  const extra = (SYN.find(([re]) => re.test(question)) || [null, []])[1];
  const prior = (SECTION_KEYS.find(([re]) => re.test(question)) || [null, []])[1];
  const sentences = [];
  const add = (sec, txt) => String(txt || '').replace(/^=+.*=+$/gm, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9])/).forEach(x => {
    x = x.replace(/\s+/g, ' ').trim();
    if (x.length > 25 && x.length < 420) sentences.push({ s: x, sec });
  });
  add('intro', g.intro);
  Object.entries(g.sections).forEach(([sec, txt]) => add(sec, txt));
  // words found in a large share of the sentences (usually the place name itself) say nothing about relevance
  const common = new Set(q.filter(w => sentences.filter(x => x.s.toLowerCase().includes(w)).length > Math.max(4, sentences.length * 0.2)));
  return sentences.map(x => {
    const low = x.s.toLowerCase();
    let sc = 0;
    q.forEach(w => { if (!common.has(w) && low.includes(w)) sc += 2; });
    extra.forEach(w => { if (low.includes(w)) sc += 1; });
    if (sc && prior.includes(x.sec)) sc += 0.5;
    return { ...x, sc };
  }).filter(x => x.sc >= 2).sort((a, b) => b.sc - a.sc).slice(0, k);
}

async function doQuestion(text, bot) {
  const city = S.trip?.to ? (S.trip.to.city || S.trip.to.name) : null;
  const hitsHtml = hits => hits.map(h => `<p><a href="${esc(h.url)}" target="_blank" rel="noopener"><b>${esc(h.title)}</b></a><br><span class="cb-mut">${stripTags(h.snippet)}…</span></p>`).join('');
  if (!city) {
    working(bot, 'Searching the travel guides…');
    const hits = await API.wikiSearch('wikivoyage', text, 3).catch(() => []);
    return bot.set(hits.length ? `<p>Here is what the travel guides say:</p>${hitsHtml(hits)}<p class="cb-hint">Tell me where you are going and I can be more specific.</p>` : '<p>Tell me where you are going and I will look up the travel guide for it.</p>');
  }
  working(bot, `Reading the ${esc(city)} travel guide…`);
  await waitFor(() => S.guide !== null, 15000);
  const g = S.guide;
  if (!g) {
    const hits = await API.wikiSearch('wikivoyage', `${text} ${city}`, 3).catch(() => []);
    return bot.set(hits.length ? hitsHtml(hits) : `<p>I couldn't find a travel guide for ${esc(city)}.</p>`);
  }
  const link = `<p class="cb-hint">Source: <a href="${esc(g.url)}" target="_blank" rel="noopener">Wikivoyage</a> (CC BY-SA). I quote the guide; I don't guess.</p>`;
  const found = bestSentences(g, text, 3, `${city} ${S.trip.to.name} ${typedDest}`);
  if (!found.length) {
    const web = `https://www.google.com/search?q=${encodeURIComponent(`${text} ${city}`)}`;
    return bot.set(`<p>The ${esc(city)} travel guide doesn't say anything specific about that.</p><p class="cb-hint"><a href="${web}" target="_blank" rel="noopener">Search the web for it</a> or check a local source.</p>`);
  }
  const quote = found.map(f => f.s).join(' ');
  let summary = null;
  if (AI.state === 'ready') {
    working(bot, 'Summarising…');
    try { summary = await aiSummarise(text, found.map(f => f.s)); } catch (e) { console.warn('AI summary skipped:', e.message); }
  }
  bot.set(`${summary ? `<p>${esc(summary)}</p><p class="cb-hint">AI summary of the guide text below.</p>` : `<p>From the <b>${esc(city)}</b> travel guide:</p>`}<div class="cb-quote">${esc(quote)}</div>${link}`);
}
const stripTags = h => esc(new DOMParser().parseFromString(String(h), 'text/html').body.textContent);

/* ============================== optional on-device AI (WebLLM) ============================== */
const AI = { engine: null, state: 'off', id: '' };
const MODELS = {
  light: ['Qwen2.5-0.5B-Instruct-q4f16_1-MLC', 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC'],
  better: ['Qwen2.5-1.5B-Instruct-q4f16_1-MLC', 'Qwen2.5-1.5B-Instruct-q4f32_1-MLC'],
};
const WEBLLM = 'https://esm.run/@mlc-ai/web-llm@0.2.86';
const aiMsg = (m, pct) => {
  $('#aiMsg').textContent = m;
  const wrap = $('#aiBarWrap'); wrap.hidden = pct == null; if (pct != null) $('#aiBar').style.width = Math.round(pct * 100) + '%';
};
function setMode() {
  ui.mode.textContent = AI.state === 'ready' ? `On-device AI · ${AI.id.replace(/-Instruct.*/, '').replace('Qwen', 'Qwen ')}` : 'Instant mode · no download needed';
  $('#aiLoad').textContent = AI.state === 'ready' ? 'Turn off' : AI.state === 'loading' ? 'Loading…' : 'Download & enable';
  $('#aiLoad').disabled = AI.state === 'loading';
}

async function aiEnable(size) {
  if (AI.state !== 'off') return;
  AI.state = 'loading'; setMode(); ui.cfg.hidden = false;
  try {
    if (!navigator.gpu) throw new Error('This browser has no WebGPU, which the on-device AI needs. Instant mode still works. A recent Chrome or Edge on a laptop or desktop is best.');
    aiMsg('Loading the AI library…', 0);
    const webllm = await import(WEBLLM);
    const available = new Set(webllm.prebuiltAppConfig.model_list.map(m => m.model_id));
    const ids = (MODELS[size] || MODELS.light).filter(i => available.has(i));
    if (!ids.length) throw new Error('That model is not offered by this version of the AI library.');
    let lastErr;
    for (const id of ids) {
      try {
        AI.engine = await webllm.CreateMLCEngine(id, { initProgressCallback: r => aiMsg(r.text || 'Downloading the model…', r.progress ?? 0) });
        AI.id = id; AI.state = 'ready'; lastErr = null; break;
      } catch (e) { lastErr = e; }
    }
    if (lastErr) throw lastErr;
    try { localStorage.setItem('tpvm.ai', size); } catch { /* ignore */ }
    aiMsg('Ready. The model is cached in your browser; it will load faster next time.', null);
    say('<p>On-device AI is on. I can now handle messier wording and summarise travel-guide answers. Everything still runs in your browser.</p>');
  } catch (e) {
    AI.state = 'off'; AI.engine = null;
    aiMsg(e.message || String(e), null);
  }
  setMode();
}
async function aiDisable() {
  try { await AI.engine?.unload(); } catch { /* ignore */ }
  AI.engine = null; AI.state = 'off'; try { localStorage.removeItem('tpvm.ai'); } catch { /* ignore */ }
  aiMsg('Turned off. Instant mode is active.', null); setMode();
}

const AI_SYSTEM = `You are the language front-end of an Indian trip planner. Convert the traveller's message into ONE JSON object and output JSON only.
Fields:
"intent": "plan" (wants a trip, itinerary or route), "cost" (asks what the current trip costs), "along" (wants fuel/food/ATM etc. on the way), "nearby" (wants something near the destination), "add" (wants to add a place), "question" (general travel question) or "other".
"from": starting city or null. "to": destination city or town or null.
"nights": integer or null (3 days = 2 nights). "travelers": integer or null. "style": "budget", "comfort", "premium" or null.
"start_date": "YYYY-MM-DD" or null.
"places": specific places or attractions to visit (never the origin or destination city).
"days": [{"day": 1, "places": ["..."]}] only if the traveller grouped places by day, else [].
"topic": for along/nearby one of fuel, food, cafe, atm, medical, pharmacy, hotel, ev, toilet, repair, sight, else null.
Use standard Indian city names (Bengaluru, Mumbai, Kolkata, Chennai, Kochi, Varanasi). Never invent places the traveller did not mention.
Example: "3 days in Jaipur from Delhi, see Amber Fort and Hawa Mahal" -> {"intent":"plan","from":"Delhi","to":"Jaipur","nights":2,"travelers":null,"style":null,"start_date":null,"places":["Amber Fort","Hawa Mahal"],"days":[],"topic":null}
Example: "any petrol pump on the way?" -> {"intent":"along","from":null,"to":null,"nights":null,"travelers":null,"style":null,"start_date":null,"places":[],"days":[],"topic":"fuel"}`;

const withTimeout = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('AI timed out')), ms))]);
async function aiParse(text) {
  const req = { messages: [{ role: 'system', content: AI_SYSTEM }, { role: 'user', content: text }], temperature: 0, max_tokens: 380 };
  let res;
  try { res = await withTimeout(AI.engine.chat.completions.create({ ...req, response_format: { type: 'json_object' } }), 45000); }
  catch (e) { if (/timed out/.test(e.message)) throw e; res = await withTimeout(AI.engine.chat.completions.create(req), 45000); }
  const raw = res.choices?.[0]?.message?.content || '';
  const j = JSON.parse(raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1));
  const str = v => (typeof v === 'string' && clean(v) && !/^(null|none|n\/a)$/i.test(clean(v)) ? clean(v) : null);
  const num = v => (Number.isFinite(+v) && +v > 0 ? Math.round(+v) : null);
  const list = a => (Array.isArray(a) ? a.map(str).filter(Boolean) : []);
  const style = str(j.style)?.toLowerCase();
  return {
    intent: str(j.intent)?.toLowerCase(), from: str(j.from), to: str(j.to), nights: num(j.nights), travelers: num(j.travelers),
    tier: style === 'budget' ? 0.6 : style === 'premium' ? 2 : style === 'comfort' ? 1 : null,
    start: /^\d{4}-\d{2}-\d{2}$/.test(str(j.start_date) || '') ? j.start_date : null,
    places: list(j.places), topic: str(j.topic)?.toLowerCase() || null,
    groups: Array.isArray(j.days) ? j.days.map(d => ({ day: num(d?.day), places: list(d?.places) })).filter(d => d.day && d.places.length) : [],
  };
}
const MONTH_RE = /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b/gi;
/** An AI answer is only shown if every number, month and mid-sentence name in it appears in the source sentences. */
function verified(answer, facts) {
  const src = facts.toLowerCase();
  const nums = answer.match(/\d[\d,.]*/g) || [], months = answer.match(MONTH_RE) || [];
  const names = (answer.replace(/(^|[.!?]\s+)[A-Z]\w*/g, '$1').match(/\b[A-Z][a-z]{3,}\b/g) || []);
  return [...nums, ...months, ...names].every(w => src.includes(w.toLowerCase().replace(/[,.]$/, '')));
}
async function aiSummarise(question, sentences) {
  const facts = sentences.map(x => '- ' + x).join('\n');
  const res = await withTimeout(AI.engine.chat.completions.create({
    messages: [
      { role: 'system', content: 'Answer the question in at most two short sentences using ONLY the facts provided. Stay as close to the wording of the facts as you can. Do not call anything "the best" unless the facts say so. Do not add any number, month, price or place name that is not in the facts, and never mention "the facts". If the facts do not answer the question, reply exactly: NONE' },
      { role: 'user', content: `Facts:\n${facts}\n\nQuestion: ${question}` },
    ],
    temperature: 0, max_tokens: 120,
  }), 45000);
  const out = clean((res.choices?.[0]?.message?.content || '').replace(/,?\s*(?:as|according to|based on)\s+(?:mentioned|stated|per|in)?\s*(?:in\s+)?the\s+(?:facts|text|context|guide)\b[^.]*/gi, ''));
  if (!out || /^none\b/i.test(out) || !verified(out, facts)) return null;
  return out;
}

/* ============================== boot ============================== */
buildUI();
setMode();
window.TPVMAssistant = { parse, classify, ALIAS };
})();
