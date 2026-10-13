import { Place } from '../models/place.model.js';

export const GANDHINAGAR_VENUES = [
  { id: 'pl_blue_oven', name: 'The Blue Oven Cafe', category: 'cafe', latitude: 23.2185, longitude: 72.6450 },
  { id: 'pl_mocha', name: 'Cafe Mocha Gandhinagar', category: 'cafe', latitude: 23.2198, longitude: 72.6395 },
  { id: 'pl_java_plus', name: 'Java+ Cafe', category: 'cafe', latitude: 23.2205, longitude: 72.6501 },
  { id: 'pl_brew_bite', name: 'Brew & Bite Cafe Infocity', category: 'cafe', latitude: 23.1891, longitude: 72.6284 },
  { id: 'pl_starbucks_info', name: 'Starbucks Infocity', category: 'cafe', latitude: 23.1902, longitude: 72.6291 },
  { id: 'pl_ccd_kudasan', name: 'Cafe Coffee Day Kudasan', category: 'cafe', latitude: 23.1785, longitude: 72.6250 },
  { id: 'pl_tea_post', name: 'Tea Post Sargasan', category: 'cafe', latitude: 23.1952, longitude: 72.6105 },
  { id: 'pl_csb_sec11', name: 'Chai Sutta Bar Sector 11', category: 'cafe', latitude: 23.2230, longitude: 72.6520 },
  { id: 'pl_toritos', name: 'Toritos Multi Cuisine Restaurant', category: 'restaurant', latitude: 23.1884, longitude: 72.6297 },
  { id: 'pl_neem_tree', name: 'Under The Neem Tree', category: 'restaurant', latitude: 23.2241, longitude: 72.6412 },
  { id: 'pl_sasumaa', name: 'Sasumaa Gujarati Thali', category: 'restaurant', latitude: 23.2190, longitude: 72.6515 },
  { id: 'pl_sankalp_sec16', name: 'Sankalp Restaurant Sector 16', category: 'restaurant', latitude: 23.2350, longitude: 72.6490 },
  { id: 'pl_honest_sec11', name: 'Honest Restaurant Sector 11', category: 'restaurant', latitude: 23.2225, longitude: 72.6531 },
  { id: 'pl_mirch_masala', name: 'Mirch Masala Infocity', category: 'restaurant', latitude: 23.1895, longitude: 72.6289 },
  { id: 'pl_secret_kitchen', name: 'The Secret Kitchen', category: 'restaurant', latitude: 23.1802, longitude: 72.6265 },
  { id: 'pl_bbq_nation', name: 'Barbeque Nation Kudasan', category: 'restaurant', latitude: 23.1795, longitude: 72.6248 },
  { id: 'pl_indroda_park', name: 'Indroda Nature Park', category: 'park', latitude: 23.1989, longitude: 72.6664 },
  { id: 'pl_sarita_udyan', name: 'Sarita Udyan Sector 9', category: 'park', latitude: 23.2140, longitude: 72.6710 },
  { id: 'pl_punit_van', name: 'Punit Van Sector 19', category: 'park', latitude: 23.2425, longitude: 72.6580 },
  { id: 'pl_dandi_kutir', name: 'Dandi Kutir Museum & Park', category: 'park', latitude: 23.2312, longitude: 72.6689 },
  { id: 'pl_central_park', name: 'Central Park Sector 10', category: 'park', latitude: 23.2165, longitude: 72.6590 },
  { id: 'pl_children_park', name: "Children's Park Sector 28", category: 'park', latitude: 23.2650, longitude: 72.6401 },
  { id: 'pl_capital_cinema', name: 'Capital Cinema Sector 11', category: 'cinema', latitude: 23.2235, longitude: 72.6535 },
  { id: 'pl_movieplex', name: 'Movieplex Cinema Sargasan', category: 'cinema', latitude: 23.1945, longitude: 72.6120 },
  { id: 'pl_pvr_infocity', name: 'PVR Infocity Gandhinagar', category: 'cinema', latitude: 23.1905, longitude: 72.6280 },
  { id: 'pl_cinemax_rworld', name: 'Cinemax R World Sector 21', category: 'cinema', latitude: 23.2380, longitude: 72.6390 },
  { id: 'pl_city_pulse', name: 'City Pulse Multiplex', category: 'cinema', latitude: 23.1750, longitude: 72.6180 },
  { id: 'pl_infocity_mall', name: 'Infocity Super Mall', category: 'mall', latitude: 23.1898, longitude: 72.6287 },
  { id: 'pl_radhe_arcade', name: 'Radhe Arcade Kudasan', category: 'mall', latitude: 23.1770, longitude: 72.6235 },
  { id: 'pl_swagat_mall', name: 'Swagat Rainforest Mall', category: 'mall', latitude: 23.1820, longitude: 72.6255 },
  { id: 'pl_fortune_arcade', name: 'Fortune Arcade Sector 11', category: 'mall', latitude: 23.2210, longitude: 72.6510 },
  { id: 'pl_akshardham', name: 'Akshardham Cultural Complex', category: 'other', latitude: 23.2300, longitude: 72.6730 },
  { id: 'pl_mahatma_mandir', name: 'Mahatma Mandir Convention Center', category: 'other', latitude: 23.2330, longitude: 72.6650 },
];

export const seedGandhinagarVenues = async () => {
  try {
    const count = await Place.countDocuments();
    if (count < 30) {
      for (const venue of GANDHINAGAR_VENUES) {
        await Place.findOneAndUpdate({ id: venue.id }, venue, { upsert: true });
      }
      console.log(`✅ Seeded ${GANDHINAGAR_VENUES.length} curated Gandhinagar venues into database.`);
    }
  } catch (err) {
    console.error('Failed to seed venues:', err.message);
  }
};
