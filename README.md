# TPVM – Trip Planning Without Mess

An omni-channel travel planner: flights, trains, buses, cabs, stays, local rides, food and shopping on one map, with distance, time and all-in price estimates.

Static web app: no build step, no accounts, no API keys, nothing paid.

## Run

Serve the folder with any static file server, for example:

```bash
python -m http.server 5174
```

Then open http://localhost:5174.

## What it does

Five tabs, with a switcher inside the busier ones:

| Tab | Content |
| --- | --- |
| Trip | The journey drawn on the map (real road route, flight arc, distance and time), weather, rough budget, Wikivoyage destination guide |
| Travel | **Options:** flight / train / bus / cab / self-drive compared (time and estimated all-in fare), nearest airports and stations, links to booking sites; click an option to see its journey on the map. **On the way:** petrol pumps, food, cafés, ATMs, hospitals, pharmacies, hotels, EV charging, toilets, car repair and sights along your road route, in driving order, plus free-text search such as "dhaba" or "temple" |
| Stay | Typical nightly rates by kind of stay (hostel, guest house, apartment, hotel, resort) with taxes included, booking links with dates pre-filled (Airbnb, Booking.com, Agoda, Google Hotels), and stays listed on OpenStreetMap |
| Explore | **Sights, Food, Shopping** on the map with road distance and drive/walk time from your base, plus **Local rides** (ride-hailing fares, rental day rates, airports, stations and metro) |
| Itinerary | Multi-day plan, per-leg distance and time, route on the map, nearest-next optimiser, Google Maps export, copy and print |

The search box above the tabs searches live as you type: places near your destination (OpenStreetMap), travel guides (Wikivoyage), background (Wikipedia), plus one-click web search on Google, Bing, DuckDuckGo, Google Maps, Tripadvisor and Reddit. Everyday words like "petrol pump", "dhaba" and "chemist" are understood.

Every place type has its own icon and colour on the map and in the lists.

The map is a vector map you can zoom, rotate and tilt. The **3D** button tilts it to show buildings, and **Detailed / Light / Bright** switches the map style. A small marker travels your route (a plane along the flight arc, a dot along the road).

## Trip assistant (chat)

The **Ask TPVM** button opens a chat in the left panel, with the map visible beside it. Tell it where you want to go, or paste your itinerary, and it finds the places, draws the route, works out distances and times, and adds up the cost with taxes.

- **Plan:** "3 days in Jaipur from Delhi for 2, visit Amber Fort and Hawa Mahal". It understands Indian names and aliases (Bangalore, Bombay, Ooty…), dates ("12 Dec"), group size, budget or luxury, and pasted itineraries such as "Day 1: Charminar, Golconda Fort. Day 2: Ramoji Film City". Nearby stops share a day, and open days can be filled with nearby sights.
- **Follow up:** "how much will it cost?", "petrol pumps on the way", "pharmacy near the hotel", "add Jantar Mantar to day 2", "optimise the order".
- **Ask:** "how do I get around Ooty?" is answered by quoting the Wikivoyage guide. If the guide doesn't cover it, the assistant says so rather than guessing.

**How it works, and what it is not.** There is no off-the-shelf open model specialised in Indian travel, and this project does not claim one. Instead:

- *Instant mode (default):* a rules-based reader tuned for Indian trip phrasing. No download, works on any device.
- *Optional on-device AI:* tick it in the chat's settings (the ⓘ button). A small open model (Qwen2.5, Apache-2.0) runs **in your browser** through [WebLLM](https://webllm.mlc.ai) (needs WebGPU: recent Chrome or Edge). Choose Light (0.5B, about 400 MB) or Better (1.5B, about 1 GB); it downloads once and is cached. Nothing you type leaves your device. It helps with messier wording and can rephrase a guide quote.
- *Safeguards:* the AI is only used when the rules can't read a message, and nothing it extracts is used unless it actually appears in what you typed. It never supplies distances, times or costs. Those always come from the portal's own data (OpenStreetMap, road routing, the Indian tax and price model). Any AI rephrasing is rejected if it contains a number, month or name that isn't in the quoted guide text.
- *Speed:* instant mode answers in seconds. The AI step took about 35 seconds on a laptop with integrated graphics.
- *India-specific* comes from the data and rules (places, GST and fee model, local words like "dhaba" and "chemist"), not from a fine-tuned model. Fine-tuning a small model on Indian travel text would be a separate project.

### What is deliberately not included

Features that free data can't support well were removed rather than faked. In a check on Jaipur, only 7% of restaurants carried a vegetarian tag, 1% of stays a star rating and only 3 rental shops were mapped. So there is no veg-only filter, no per-hotel price or star sort, no rental-shop list and no live fares or availability. Prices are category-level estimates and booking buttons open the provider's own site.

"Use as base" on any stay re-measures every distance from that hotel.

## Prices and taxes (estimates)

Every price shown is an **estimate**: a typical market base price plus itemised taxes and fees, so you see the full picture. Open *See taxes, fees & tolls* on a travel option for the split.

| Item | Taxes / fees modelled (India) |
| --- | --- |
| Flights | Fuel surcharge, 5% GST, airport user fee & security, booking fee |
| Train | Reservation fee, superfast surcharge, 5% GST on AC classes, IRCTC fee |
| Bus | 5% GST on AC coaches, online booking fee |
| Cab | 5% GST, highway tolls, inter-state permit when the states differ |
| Self-drive / rentals | 18% GST, fuel and tolls both ways (refundable deposit not included) |
| Hotels / stays | GST by room price: nil up to ₹1,000, 5% up to ₹7,500, 18% above, plus a platform fee |
| Food | 5% GST and a typical service charge |

Outside India, broad averages are used (VAT / sales tax, airport charges, hotel occupancy tax). The rules live in `js/config.js` (`tax` per region), so they are easy to update when rates change.

These are **approximate planning prices, not quotes**. Actual prices vary by date, demand, class and provider, and tax rules change. The app shows a disclaimer next to them. Confirm on the booking site before you pay.

## Data sources (all free)

- [MapLibre GL JS](https://maplibre.org) with [OpenFreeMap](https://openfreemap.org) vector tiles (free, no key): smooth zoom and rotation, crisp labels, 3D buildings
- OpenStreetMap data via Overpass (places), with Nominatim as backup when Overpass is busy
- OSRM demo server – road distance and time (driving)
- Wikivoyage – local food / shopping / sights text (CC BY-SA)
- Open-Meteo – 16-day forecast

## Limits

- Fares and room prices are distance/category-based **estimates**. The buttons open each provider's own site, where you can see real prices. There is no booking or live availability.
- OSM coverage varies: small towns have fewer listed hotels, restaurants and rentals.
- The public OSRM / Overpass servers are for light use.

## Files

- `index.html`, `css/styles.css`
- `js/config.js` – categories, regional price and tax models (India in ₹, everything else in $)
- `js/api.js` – network layer and caching
- `js/app.js` – state, map, views, itinerary
