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

| Tab | Content |
| --- | --- |
| Overview | Route summary, weather, rough budget, Wikivoyage destination guide |
| Get there | Flight / train / bus / cab / self-drive compared (time + estimated all-in fare), nearest airports & stations, links to booking sites |
| Stay | Hotels, hostels, guest houses, apartments with an estimated price per night, plus Airbnb / Booking.com / Agoda / Google Hotels links with dates pre-filled |
| Get around | Ride-hailing fare table, rental daily rates, rental shops, stations & metro |
| Eat / Shop / Explore | Places on the map with road distance + drive/walk time from your base, filters, search, sort |
| Itinerary | Multi-day plan, per-leg distance/time, route on map, nearest-next optimiser, Google Maps export, copy/print |

"Use as base" on any stay re-measures every distance from that hotel.

## Prices and taxes (estimates)

Every price shown is an **estimate**: a typical market base price plus itemised taxes and fees, so you see the full picture. Open *See taxes, fees & tolls* on a travel option, or hover a hotel's price, for the split.

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

- OpenStreetMap tiles, Overpass (places) with Nominatim as backup when Overpass is busy
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
