'use strict';

require('dotenv').config();
const { connectDatabase, disconnectDatabase } = require('../config/db');
const config = require('../config');
const { City, Theatre, Hall, Movie, Show, Coupon, User } = require('../models');

const cities = [
  { name: 'Mumbai', state: 'Maharashtra' },
  { name: 'Bengaluru', state: 'Karnataka' },
  { name: 'Delhi', state: 'Delhi' },
];

const movieData = [
  { title: 'Neon Monsoon', tagline: 'Every city has a secret rhythm.', overview: 'A sound engineer follows an impossible signal through a rain-soaked metropolis.', genres: ['Drama', 'Thriller'], rating: 8.4, runtimeMinutes: 128, certificate: 'UA', languages: ['Hindi', 'English'], formats: ['2D', 'IMAX'], posterUrl: 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=600&q=80', backdropUrl: 'https://images.unsplash.com/photo-1517604931442-7e0c8ed2963c?w=1600&q=80' },
  { title: 'Orbit House', tagline: 'Home is the last frontier.', overview: 'Three strangers share a satellite and discover a message meant for Earth.', genres: ['Sci-Fi', 'Adventure'], rating: 9.1, runtimeMinutes: 142, certificate: 'UA', languages: ['English'], formats: ['2D', '3D'], posterUrl: 'https://images.unsplash.com/photo-1440404653325-ab127d49abc1?w=600&q=80', backdropUrl: 'https://images.unsplash.com/photo-1518709268805-4e9042af9f23?w=1600&q=80' },
];

const upsert = (model, filter, update) => model.findOneAndUpdate(filter, update, { upsert: true, new: true, setDefaultsOnInsert: true });

async function seed() {
  await connectDatabase();
  if (process.argv.includes('--reset')) await Promise.all([City.deleteMany({}), Movie.deleteMany({}), User.deleteMany({})]);

  const cityDocs = [];
  for (const city of cities) cityDocs.push(await upsert(City, { name: city.name }, city));
  const movies = [];
  for (const movie of movieData) movies.push(await upsert(Movie, { title: movie.title }, movie));

  for (let index = 0; index < cityDocs.length; index += 1) {
    const city = cityDocs[index];
    const theatre = await upsert(Theatre, { city: city._id, name: `${city.name} Central` }, {
      city: city._id, name: `${city.name} Central`, locality: index === 0 ? 'Lower Parel' : 'City Centre', address: `VIBE Avenue, ${city.name}`, facilities: ['Parking', 'Food Court', 'Dolby Atmos', 'Wheelchair Access'],
      imageUrl: 'https://images.unsplash.com/photo-1595769816263-9b910be24d5f?w=1200&q=80',
    });
    const hall = await upsert(Hall, { theatre: theatre._id, name: 'Auditorium 1' }, {
      theatre: theatre._id, city: city._id, name: 'Auditorium 1', screenType: index === 0 ? 'IMAX' : 'DOLBY_CINEMA', soundSystem: 'Dolby Atmos', projection: '4K Laser', layout: [
        { label: 'A', seats: 10, category: 'SILVER', aisleAfter: [5] }, { label: 'B', seats: 10, category: 'SILVER', aisleAfter: [5] },
        { label: 'C', seats: 12, category: 'GOLD', aisleAfter: [6] }, { label: 'D', seats: 12, category: 'GOLD', aisleAfter: [6] },
        { label: 'E', seats: 8, category: 'PLATINUM', aisleAfter: [4] }, { label: 'F', seats: 6, category: 'RECLINER', aisleAfter: [3] },
      ], pricing: { SILVER: 220, GOLD: 280, PLATINUM: 320, RECLINER: 450 },
    });
    for (let movieIndex = 0; movieIndex < movies.length; movieIndex += 1) {
      const startsAt = new Date(Date.now() + (index + movieIndex + 1) * 24 * 60 * 60 * 1000);
      startsAt.setHours(14 + movieIndex * 4, 0, 0, 0);
      const endsAt = new Date(startsAt.getTime() + movies[movieIndex].runtimeMinutes * 60000);
      await upsert(Show, { hall: hall._id, startsAt }, { movie: movies[movieIndex]._id, hall: hall._id, theatre: theatre._id, city: city._id, startsAt, endsAt, language: movies[movieIndex].languages[0], format: movies[movieIndex].formats[0], pricing: hall.pricing, totalSeats: hall.totalSeats, status: 'scheduled' });
    }
  }

  await upsert(Coupon, { code: 'FIRSTSHOW' }, { code: 'FIRSTSHOW', label: 'First show treat', description: 'Save 15% on your first booking.', type: 'percent', value: 15, maxDiscount: 200, minSeats: 1, validTo: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) });
  const superAdmin = await upsert(User, { email: config.seed.superAdminEmail }, { name: 'VIBE4U HQ', email: config.seed.superAdminEmail, role: 'super_admin' });
  await superAdmin.setPassword(config.seed.superAdminPassword); await superAdmin.save();
  const branch = await upsert(User, { email: 'manager@mumbai.vibe4u.in' }, { name: 'Mumbai Manager', email: 'manager@mumbai.vibe4u.in', role: 'branch_admin', city: cityDocs[0]._id });
  await branch.setPassword(config.seed.branchAdminPassword); await branch.save();
  const demo = await upsert(User, { email: config.seed.demoUserEmail }, { name: 'Demo Guest', email: config.seed.demoUserEmail, role: 'user', city: cityDocs[0]._id });
  await demo.setPassword(config.seed.demoUserPassword); await demo.save();
  console.log(`[seed] ready: ${cityDocs.length} cities, ${movies.length} movies, demo ${config.seed.demoUserEmail}`);
}

seed().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => disconnectDatabase());
