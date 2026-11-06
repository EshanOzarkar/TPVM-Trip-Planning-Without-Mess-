/* Static configuration: map categories, regional price models, sample trips. */

const CATEGORIES = {
  see: {
    label: 'Explore', color: '#0284c7', radius: 12000,
    groups: [
      { limit: 150, f: [
        '["tourism"~"^(attraction|museum|viewpoint|gallery|theme_park|zoo|aquarium)$"]["name"]',
        '["historic"~"^(monument|castle|fort|palace|memorial|archaeological_site|ruins)$"]["name"]'] },
      { limit: 100, f: [
        '["leisure"~"^(park|garden|nature_reserve)$"]["name"]["wikidata"]',
        '["amenity"="place_of_worship"]["name"]["wikidata"]'] },
    ],
  },
  stay: {
    label: 'Stays', color: '#7c3aed', radius: 6000,
    groups: [{ limit: 250, f: ['["tourism"~"^(hotel|guest_house|hostel|apartment|motel|resort|chalet)$"]["name"]'] }],
  },
  food: {
    label: 'Food', color: '#ea580c', radius: 3000,
    groups: [
      { limit: 220, f: ['["amenity"~"^(restaurant|cafe|fast_food|food_court|ice_cream)$"]["name"]'] },
      { limit: 50, f: ['["shop"~"^(bakery|confectionery|pastry)$"]["name"]'] },
    ],
  },
  shop: {
    label: 'Shopping', color: '#db2777', radius: 7000,
    groups: [
      { limit: 120, f: [
        '["shop"~"^(mall|department_store|souvenir|handicraft|craft|gift)$"]["name"]',
        '["amenity"="marketplace"]["name"]'] },
      { limit: 120, f: ['["shop"~"^(jewelry|clothes|fabric|boutique|antiques|art|books|variety_store)$"]["name"]'] },
    ],
  },
  rent: {
    label: 'Rentals', color: '#059669', radius: 15000,
    groups: [{ limit: 80, f: [
      '["amenity"~"^(car_rental|motorcycle_rental|bicycle_rental|boat_rental)$"]["name"]',
      '["shop"="rental"]["name"]'] }],
  },
  transit: {
    label: 'Stations', color: '#475569', radius: 25000,
    groups: [
      { limit: 10, f: ['["aeroway"="aerodrome"]["iata"]["name"]'] },
      { limit: 40, f: ['["railway"="station"]["station"!~"^(subway|light_rail)$"]["name"]'] },
      { limit: 80, f: ['["railway"="station"]["station"="subway"]["name"]'] },
      { limit: 30, f: ['["amenity"="bus_station"]["name"]'] },
    ],
  },
};

/* Search phrases for the Nominatim backup source, used when Overpass is unreachable. */
const FALLBACK_TERMS = {
  see: ['tourist attraction', 'museum', 'fort', 'temple', 'park'],
  stay: ['hotel', 'guest house', 'hostel', 'resort'],
  food: ['restaurant', 'cafe', 'fast food', 'sweet shop'],
  shop: ['shopping mall', 'market', 'handicraft', 'souvenir'],
  rent: ['car rental', 'bike rental'],
  transit: ['railway station', 'bus station', 'airport'],
};

const LAYER_ORDER =['see', 'stay', 'food', 'shop', 'rent', 'transit'];
const STAR_MULT = { 1: 0.5, 2: 0.7, 3: 1, 4: 1.9, 5: 3.4 };
const DAY_COLORS = ['#e11d48', '#2563eb', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#be185d', '#4d7c0f', '#9333ea', '#0f766e'];

/* Price models are rough planning estimates, not live fares. */
const REGIONS = {
  IN: {
    name: 'India', cur: '₹', locale: 'en-IN',
    // Pre-tax base fares per person; lo/hi multiply the base to give a typical low/high booking.
    flight: { base: 1500, perKm: 2.6, lo: 0.75, hi: 1.9, speed: 780, overhead: 180, minKm: 350 },
    train: { base: 60, lo: 0.55, hi: 2.6, speed: 60, minKm: 40, maxKm: 2500 },      // lo = Sleeper, hi = AC / Shatabdi-type
    bus: { base: 40, lo: 1.4, hi: 2.9, speed: 45, minKm: 30, maxKm: 900 },
    cab: { perKm: 13, min: 1500, speed: 50, seats: 4 },
    selfDrive: { perDay: 2200, fuelPerKm: 7, maxKm: 1500 },
    stay: { hostel: 900, guest_house: 2200, apartment: 3000, chalet: 4500, motel: 2600, hotel: 4000, resort: 8500 },
    food: 850, local: 650, act: 550,
    ride: { cab: [55, 15], auto: [28, 13], bike: [20, 8] },
    rentDay: [['🛵', 'Scooter / bike', [400, 700]], ['🚗', 'Hatchback (self-drive)', [1500, 2500]],
      ['🚙', 'SUV (self-drive)', [3500, 5500]], ['🧑‍✈️', 'Car + driver (8h / 80km)', [2200, 3200]]],
    links: {
      ride: [['Uber', 'https://www.uber.com/in/en/'], ['Ola', 'https://www.olacabs.com/'], ['Rapido', 'https://www.rapido.bike/'], ['inDrive', 'https://indrive.com/']],
      rent: [['Zoomcar', 'https://www.zoomcar.com/'], ['Revv', 'https://www.revv.co.in/'], ['MyChoize', 'https://www.mychoize.com/']],
      train: [['IRCTC', 'https://www.irctc.co.in/nget/train-search'], ['ixigo Trains', 'https://www.ixigo.com/trains'], ['ConfirmTkt', 'https://www.confirmtkt.com/']],
      bus: [['redBus', 'https://www.redbus.in/'], ['AbhiBus', 'https://www.abhibus.com/']],
      cab: [['Savaari', 'https://www.savaari.com/'], ['Uber Intercity', 'https://www.uber.com/in/en/ride/'], ['Ola Outstation', 'https://www.olacabs.com/']],
      flightExtra: [['MakeMyTrip', 'https://www.makemytrip.com/flights/']],
      stayExtra: [['MakeMyTrip', 'https://www.makemytrip.com/hotels/'], ['Goibibo', 'https://www.goibibo.com/hotels/']],
    },
    /* Tax & fee rules, applied in order to a pre-tax base: pct = % of the running total,
       flat = fixed amount, perKm = per km of the route. Mirrors the rules in force at the time of writing;
       rates change, so keep this table up to date. */
    tax: {
      flight: [
        { label: 'Fuel surcharge & airline fees', pct: 0.08 },
        { label: 'GST 5% (economy)', pct: 0.05 },
        { label: 'Airport charges (user development fee, security)', flat: 450 },
        { label: 'Booking convenience fee', flat: 300 },
      ],
      train: {
        sl: [{ label: 'Reservation fee', flat: 20 }, { label: 'Superfast surcharge', flat: 30 }, { label: 'IRCTC convenience fee', flat: 15 }],
        ac: [{ label: 'Reservation fee', flat: 40 }, { label: 'Superfast surcharge', flat: 45 }, { label: 'GST 5% (AC classes)', pct: 0.05 }, { label: 'IRCTC convenience fee', flat: 35 }],
      },
      bus: [{ label: 'GST 5% (AC coaches)', pct: 0.05 }, { label: 'Online booking fee', flat: 50 }],
      cab: [
        { label: 'GST 5%', pct: 0.05 },
        { label: 'Highway tolls (approx.)', perKm: 1.8 },
        { label: 'Inter-state permit / entry tax (approx.)', flat: 500, if: 'interstate' },
      ],
      rental: [{ label: 'GST 18%', pct: 0.18 }, { label: 'Fuel, round trip (approx.)', perKm: 14 }, { label: 'Tolls, round trip (approx.)', perKm: 3.6 }],
      rentday: [{ label: 'GST 18%', pct: 0.18 }],
      stay: {
        slabs: [[1000, 0, 'GST (nil up to ₹1,000)'], [7500, 0.05, 'GST 5% (room up to ₹7,500)'], [Infinity, 0.18, 'GST 18% (room above ₹7,500)']],
        fee: 0.02, feeLabel: 'Platform & booking fee',
      },
      food: [{ label: 'Service charge (common, optional)', pct: 0.05 }, { label: 'GST 5%', pct: 0.05 }],
      ride: [{ label: 'GST 5%', pct: 0.05 }],
      act: [{ label: 'Entry fees & GST (avg.)', pct: 0.09 }],
    },
    tips: ['Pre-paid auto & taxi counters at stations and airports avoid haggling.', 'Book trains 60–120 days ahead; Tatkal opens 1 day before.', 'Carry cash for small eateries and local markets — UPI works almost everywhere.'],
  },
  DEFAULT: {
    name: 'International', cur: '$', locale: 'en-US',
    flight: { base: 40, perKm: 0.085, lo: 0.8, hi: 2.2, speed: 800, overhead: 180, minKm: 400 },
    train: { base: 5, lo: 0.07, hi: 0.25, speed: 100, minKm: 40, maxKm: 1500 },
    bus: { base: 3, lo: 0.04, hi: 0.09, speed: 70, minKm: 40, maxKm: 1200 },
    cab: { perKm: 1.1, min: 60, speed: 70, seats: 4 },
    selfDrive: { perDay: 55, fuelPerKm: 0.12, maxKm: 2000 },
    stay: { hostel: 25, guest_house: 60, apartment: 90, chalet: 110, motel: 65, hotel: 110, resort: 220 },
    food: 40, local: 13, act: 22,
    ride: { cab: [3, 1.3], auto: [2, 1.1], bike: [1.5, 0.9] },
    rentDay: [['🛵', 'Scooter / bike', [25, 45]], ['🚗', 'Compact car', [40, 70]],
      ['🚙', 'SUV', [80, 130]], ['🧑‍✈️', 'Car + driver (8h)', [150, 260]]],
    links: {
      ride: [['Uber', 'https://www.uber.com/'], ['Bolt', 'https://bolt.eu/'], ['Lyft', 'https://www.lyft.com/']],
      rent: [['Rentalcars', 'https://www.rentalcars.com/'], ['Discover Cars', 'https://www.discovercars.com/'], ['Turo', 'https://turo.com/']],
      train: [['Omio', 'https://www.omio.com/'], ['Trainline', 'https://www.thetrainline.com/']],
      bus: [['FlixBus', 'https://www.flixbus.com/']],
      cab: [['Uber', 'https://www.uber.com/'], ['Bolt', 'https://bolt.eu/']],
      flightExtra: [],
      stayExtra: [],
    },
    /* Generic approximations: tax systems differ widely by country, so these are broad averages. */
    tax: {
      flight: [
        { label: 'Airline fees & fuel surcharge', pct: 0.06 },
        { label: 'Government taxes (VAT / excise)', pct: 0.1 },
        { label: 'Airport & security charges', flat: 12 },
        { label: 'Booking fee', flat: 6 },
      ],
      train: {
        sl: [{ label: 'VAT / sales tax', pct: 0.1 }, { label: 'Booking fee', flat: 2 }],
        ac: [{ label: 'VAT / sales tax', pct: 0.1 }, { label: 'Booking fee', flat: 2 }],
      },
      bus: [{ label: 'VAT / sales tax', pct: 0.1 }, { label: 'Booking fee', flat: 1.5 }],
      cab: [{ label: 'Taxes (VAT / sales tax)', pct: 0.1 }, { label: 'Tolls (approx.)', perKm: 0.06 }],
      rental: [{ label: 'Sales tax & road fees', pct: 0.2 }, { label: 'Fuel, round trip (approx.)', perKm: 0.24 }, { label: 'Tolls, round trip (approx.)', perKm: 0.1 }],
      rentday: [{ label: 'Sales tax & fees', pct: 0.15 }],
      stay: { slabs: [[Infinity, 0.12, 'Hotel & occupancy taxes (approx.)']], fee: 0.02, feeLabel: 'Platform & booking fee' },
      food: [{ label: 'Service / tip (approx.)', pct: 0.1 }, { label: 'Sales tax / VAT', pct: 0.08 }],
      ride: [{ label: 'Taxes & fees', pct: 0.08 }],
      act: [{ label: 'Entry fees & taxes (avg.)', pct: 0.08 }],
    },
    tips: ['Check airport-to-city train links — often cheaper and faster than taxis.', 'Many cities sell day/multi-day transit passes.', 'Keep offline maps for the area.'],
  },
};

const SAMPLE_TRIPS = [
  ['Delhi', 'Jaipur'], ['Mumbai', 'Goa'], ['Bengaluru', 'Munnar'], ['Delhi', 'Manali'], ['London', 'Paris'],
];

/* Things people look for on a trip. `nom` is the phrase Nominatim understands, `ql` the matching
   Overpass filter (used for along-the-route search), `terms` are everyday words that map to it. */
const SEARCH_TOPICS = [
  { id: 'fuel', label: 'Petrol pump', ic: 'fuel', nom: 'petrol station', ql: '["amenity"="fuel"]', terms: ['petrol', 'petrol pump', 'petrol station', 'pump', 'gas', 'gas station', 'fuel', 'diesel', 'cng'] },
  { id: 'food', label: 'Food', ic: 'utensils', nom: 'restaurant', ql: '["amenity"~"^(restaurant|fast_food|food_court)$"]', terms: ['food', 'restaurant', 'dhaba', 'eat', 'meal', 'lunch', 'dinner', 'breakfast', 'street food', 'thali'] },
  { id: 'cafe', label: 'Cafe', ic: 'coffee', nom: 'cafe', ql: '["amenity"="cafe"]', terms: ['cafe', 'coffee', 'tea', 'chai'] },
  { id: 'atm', label: 'ATM', ic: 'banknote', nom: 'atm', ql: '["amenity"~"^(atm|bank)$"]', terms: ['atm', 'cash', 'bank', 'money'] },
  { id: 'medical', label: 'Hospital', ic: 'cross', nom: 'hospital', ql: '["amenity"~"^(hospital|clinic)$"]', terms: ['hospital', 'doctor', 'clinic', 'emergency', 'medical'] },
  { id: 'pharmacy', label: 'Pharmacy', ic: 'pill', nom: 'pharmacy', ql: '["amenity"="pharmacy"]', terms: ['pharmacy', 'chemist', 'medical store', 'medicine', 'drugstore'] },
  { id: 'hotel', label: 'Hotel', ic: 'bed', nom: 'hotel', ql: '["tourism"~"^(hotel|motel|guest_house|hostel)$"]', terms: ['hotel', 'stay', 'lodge', 'room', 'motel', 'night'] },
  { id: 'ev', label: 'EV charging', ic: 'zap', nom: 'charging station', ql: '["amenity"="charging_station"]', terms: ['ev', 'charging', 'charger', 'ev charging', 'electric'] },
  { id: 'toilet', label: 'Toilets', ic: 'toilet', nom: 'toilets', ql: '["amenity"="toilets"]', terms: ['toilet', 'toilets', 'restroom', 'washroom', 'loo'] },
  { id: 'repair', label: 'Car repair', ic: 'wrench', nom: 'car repair', ql: '["shop"="car_repair"]', terms: ['mechanic', 'garage', 'repair', 'puncture', 'car repair', 'tyre'] },
  { id: 'sight', label: 'Sights', ic: 'camera', nom: 'tourist attraction', ql: '["tourism"~"^(attraction|viewpoint|museum)$"]', terms: ['sights', 'sight', 'attraction', 'attractions', 'viewpoint', 'museum', 'things to see'] },
];
