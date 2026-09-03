'use strict';

const express = require('express');
const mongoose = require('mongoose');

const config = require('../config');
const City = require('../models/City');
const Theatre = require('../models/Theatre');
const Hall = require('../models/Hall');
const Movie = require('../models/Movie');
const Show = require('../models/Show');
const Booking = require('../models/Booking');
const Coupon = require('../models/Coupon');
const User = require('../models/User');
const { ApiError, asyncHandler } = require('../utils/errors');
const {
  requireFields,
  assertObjectId,
  optionalObjectId,
  assertEmail,
  assertPassword,
  assertPhone,
  assertDate,
  assertNumber,
  assertEnum,
  parsePagination,
  str,
} = require('../utils/validate');
const { requireAuth, requireRole, resolveCityScope } = require('../middleware/auth');
const { writeLimiter } = require('../middleware/rateLimit');
const pricing = require('../services/pricing');
const razorpay = require('../services/razorpay');
const bookingService = require('../services/booking');

const { SEAT_CATEGORIES, SCREEN_TYPES } = Hall;
const { DISCOUNT_TYPES } = Coupon;

const router = express.Router();

// Management is staff-only, and every request carries a city scope.
router.use(requireAuth, requireRole('branch_admin', 'super_admin'), resolveCityScope);

const superOnly = requireRole('super_admin');

/** Narrow a filter to the caller's city when they are a branch admin. */
const scoped = (req, filter = {}, field = 'city') =>
  (req.scopeCityId ? { ...filter, [field]: req.scopeCityId } : filter);

/** City filter usable inside an aggregation pipeline (needs a real ObjectId). */
const aggCity = (req) =>
  (req.scopeCityId ? { city: new mongoose.Types.ObjectId(req.scopeCityId) } : {});

/**
 * Aggregation pipelines bypass Mongoose casting, so ids that arrived as query
 * strings must be converted by hand before they reach $match.
 */
const castIds = (filter, fields = ['city', 'theatre', 'show', 'hall', 'movie', 'user']) => {
  const out = { ...filter };
  fields.forEach((field) => {
    if (typeof out[field] === 'string' && mongoose.Types.ObjectId.isValid(out[field])) {
      out[field] = new mongoose.Types.ObjectId(out[field]);
    }
  });
  return out;
};

/** Reject an attempt to act on a city outside the caller's scope. */
const assertCityAllowed = (req, cityId) => {
  if (!cityId) throw ApiError.badRequest('A city is required');
  if (req.isCityScoped && String(cityId) !== req.scopeCityId) {
    throw ApiError.forbidden('Branch admins can only manage their own city');
  }
  return String(cityId);
};
/** Validate and normalise a hall layout coming from the admin form. */
const normaliseLayout = (rows) => {
  if (!Array.isArray(rows) || rows.length === 0) {
    throw ApiError.badRequest('A hall needs at least one row of seats');
  }
  if (rows.length > 40) throw ApiError.badRequest('A hall can have at most 40 rows');

  const seen = new Set();
  return rows.map((row, index) => {
    const label = str(row.label).toUpperCase();
    if (!/^[A-Z]{1,2}$/.test(label)) {
      throw ApiError.badRequest(`Row ${index + 1}: label must be 1-2 letters (e.g. "A" or "AA")`);
    }
    if (seen.has(label)) throw ApiError.badRequest(`Row label "${label}" is used twice`);
    seen.add(label);

    return {
      label,
      seats: assertNumber(row.seats, `Row ${label} seat count`, { min: 1, max: 40, integer: true }),
      category: assertEnum(str(row.category).toUpperCase(), SEAT_CATEGORIES, `Row ${label} category`),
      aisleAfter: Array.isArray(row.aisleAfter)
        ? row.aisleAfter.map((n) => assertNumber(n, `Row ${label} aisle`, { min: 1, max: 40, integer: true }))
        : [],
    };
  });
};

/** Fallback per-category prices for a brand-new hall. */
const DEFAULT_PRICING = { SILVER: 220, GOLD: 280, PLATINUM: 320, RECLINER: 450 };

/** Per-category prices, falling back to the existing values. */
const normalisePricing = (input, fallback) =>
  SEAT_CATEGORIES.reduce((acc, category) => {
    const raw = input && input[category] !== undefined ? input[category] : fallback[category];
    acc[category] = assertNumber(raw, `${category} price`, { min: 0, max: 100000 });
    return acc;
  }, {});

/** Booking reference lookup limited to the caller's scope. */
const loadScopedBooking = async (req) => {
  const reference = str(req.params.reference).toUpperCase();
  const booking = await Booking.findOne(scoped(req, { reference })).populate('user', 'name email phone');
  if (!booking) throw ApiError.notFound('Booking not found in your scope');
  return booking;
};
/* -------------------------------------------------------------------------- */
/* Dashboard overview                                                         */
/* -------------------------------------------------------------------------- */
router.get(
  '/overview',
  asyncHandler(async (req, res) => {
    const now = new Date();
    const cityMatch = aggCity(req);
    const confirmed = { ...cityMatch, status: 'confirmed' };

    const since = new Date(now);
    since.setHours(0, 0, 0, 0);
    since.setDate(since.getDate() - 13);

    const [totals] = await Booking.aggregate([
      { $match: confirmed },
      {
        $group: {
          _id: null,
          revenue: { $sum: '$amount.total' },
          discount: { $sum: '$amount.discount' },
          fees: { $sum: '$amount.convenienceFee' },
          bookings: { $sum: 1 },
          tickets: { $sum: { $size: '$seats' } },
        },
      },
    ]);

    const byDay = await Booking.aggregate([
      { $match: { ...confirmed, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$amount.total' },
          bookings: { $sum: 1 },
          tickets: { $sum: { $size: '$seats' } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const statusRows = await Booking.aggregate([
      { $match: cityMatch },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const topMovies = await Booking.aggregate([
      { $match: confirmed },
      {
        $group: {
          _id: '$movie',
          title: { $first: '$snapshot.movieTitle' },
          posterUrl: { $first: '$snapshot.posterUrl' },
          revenue: { $sum: '$amount.total' },
          tickets: { $sum: { $size: '$seats' } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 6 },
    ]);

    const topTheatres = await Booking.aggregate([
      { $match: confirmed },
      {
        $group: {
          _id: '$theatre',
          name: { $first: '$snapshot.theatreName' },
          city: { $first: '$snapshot.cityName' },
          revenue: { $sum: '$amount.total' },
          tickets: { $sum: { $size: '$seats' } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 6 },
    ]);

    const [occupancy] = await Show.aggregate([
      { $match: { ...cityMatch, status: 'scheduled', startsAt: { $lt: now } } },
      { $group: { _id: null, sold: { $sum: '$seatsSold' }, capacity: { $sum: '$totalSeats' } } },
    ]);

    const [theatres, halls, upcomingShows, activeCoupons, recent] = await Promise.all([
      Theatre.countDocuments(scoped(req, { isActive: true })),
      Hall.countDocuments(scoped(req, { isActive: true })),
      Show.countDocuments(scoped(req, { status: 'scheduled', startsAt: { $gte: now } })),
      Coupon.countDocuments({ isActive: true, validTo: { $gte: now } }),
      Booking.find({ ...scoped(req, {}), status: { $ne: 'expired' } })
        .sort({ createdAt: -1 })
        .limit(8)
        .populate('user', 'name email'),
    ]);
    const statusCounts = statusRows.reduce((acc, row) => {
      acc[row._id] = row.count;
      return acc;
    }, {});

    res.json({
      scope: {
        cityId: req.scopeCityId || null,
        cityName: req.isCityScoped && req.user.city ? req.user.city.name : null,
        isCityScoped: req.isCityScoped,
        role: req.user.role,
      },
      totals: {
        revenue: Math.round(((totals && totals.revenue) || 0) * 100) / 100,
        discountGiven: (totals && totals.discount) || 0,
        convenienceFees: Math.round(((totals && totals.fees) || 0) * 100) / 100,
        bookings: (totals && totals.bookings) || 0,
        ticketsSold: (totals && totals.tickets) || 0,
        theatres,
        halls,
        upcomingShows,
        activeCoupons,
        averageTicket:
          totals && totals.tickets
            ? Math.round((totals.revenue / totals.tickets) * 100) / 100
            : 0,
        occupancyPercent:
          occupancy && occupancy.capacity
            ? Math.round((occupancy.sold / occupancy.capacity) * 100)
            : 0,
      },
      statusCounts,
      revenueByDay: byDay.map((row) => ({
        date: row._id,
        revenue: Math.round(row.revenue * 100) / 100,
        bookings: row.bookings,
        tickets: row.tickets,
      })),
      topMovies: topMovies.map((row) => ({
        id: row._id ? row._id.toString() : null,
        title: row.title,
        posterUrl: row.posterUrl,
        revenue: Math.round(row.revenue * 100) / 100,
        tickets: row.tickets,
      })),
      topTheatres: topTheatres.map((row) => ({
        id: row._id ? row._id.toString() : null,
        name: row.name,
        city: row.city,
        revenue: Math.round(row.revenue * 100) / 100,
        tickets: row.tickets,
      })),
      recentBookings: recent.map((booking) => ({
        ...booking.toPublic({ includePayment: false }),
        customer: booking.user ? { name: booking.user.name, email: booking.user.email } : null,
      })),
    });
  })
);
/* -------------------------------------------------------------------------- */
/* Cities                                                                     */
/* -------------------------------------------------------------------------- */
router.get(
  '/cities',
  asyncHandler(async (req, res) => {
    // A branch admin only ever needs their own city in a dropdown.
    const filter = req.isCityScoped ? { _id: req.scopeCityId } : {};
    const cities = await City.find(filter).sort({ name: 1 });

    const counts = await Theatre.aggregate([
      { $match: { isActive: true } },
      { $group: { _id: '$city', theatres: { $sum: 1 } } },
    ]);
    const theatresByCity = counts.reduce((acc, row) => {
      acc[row._id.toString()] = row.theatres;
      return acc;
    }, {});

    res.json({
      cities: cities.map((city) => ({
        ...city.toPublic(),
        theatres: theatresByCity[city._id.toString()] || 0,
      })),
    });
  })
);

router.post(
  '/cities',
  superOnly,
  writeLimiter,
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['name']);
    const city = await City.create({
      name: str(req.body.name),
      state: str(req.body.state),
    });
    res.status(201).json({ city: city.toPublic() });
  })
);

router.patch(
  '/cities/:id',
  superOnly,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const city = await City.findById(assertObjectId(req.params.id, 'city id'));
    if (!city) throw ApiError.notFound('City not found');

    if (req.body.name !== undefined) city.name = str(req.body.name);
    if (req.body.state !== undefined) city.state = str(req.body.state);
    if (req.body.isActive !== undefined) city.isActive = Boolean(req.body.isActive);

    await city.save();
    res.json({ city: city.toPublic() });
  })
);
/* -------------------------------------------------------------------------- */
/* Theatres                                                                   */
/* -------------------------------------------------------------------------- */
router.get(
  '/theatres',
  asyncHandler(async (req, res) => {
    const theatres = await Theatre.find(scoped(req, {}))
      .sort({ name: 1 })
      .populate('city', 'name slug state');

    const ids = theatres.map((theatre) => theatre._id);
    const [halls, revenue] = await Promise.all([
      Hall.find({ theatre: { $in: ids } }).select('theatre name screenType layout isActive'),
      Booking.aggregate([
        { $match: { theatre: { $in: ids }, status: 'confirmed' } },
        {
          $group: {
            _id: '$theatre',
            revenue: { $sum: '$amount.total' },
            tickets: { $sum: { $size: '$seats' } },
          },
        },
      ]),
    ]);

    const revenueByTheatre = revenue.reduce((acc, row) => {
      acc[row._id.toString()] = row;
      return acc;
    }, {});

    res.json({
      theatres: theatres.map((theatre) => {
        const key = theatre._id.toString();
        const own = halls.filter((hall) => hall.theatre.toString() === key);
        const money = revenueByTheatre[key];
        return {
          ...theatre.toPublic(),
          halls: own.map((hall) => ({
            id: hall._id.toString(),
            name: hall.name,
            screenType: hall.screenType,
            totalSeats: hall.totalSeats,
            isActive: hall.isActive,
          })),
          totalSeats: own.reduce((sum, hall) => sum + hall.totalSeats, 0),
          revenue: money ? Math.round(money.revenue * 100) / 100 : 0,
          ticketsSold: money ? money.tickets : 0,
        };
      }),
    });
  })
);
router.post(
  '/theatres',
  writeLimiter,
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['name', 'city']);
    const cityId = assertCityAllowed(req, assertObjectId(req.body.city, 'city'));

    const city = await City.findById(cityId);
    if (!city) throw ApiError.notFound('City not found');

    const theatre = await Theatre.create({
      name: str(req.body.name),
      city: city._id,
      address: str(req.body.address),
      locality: str(req.body.locality),
      phone: assertPhone(req.body.phone),
      imageUrl: str(req.body.imageUrl),
      ...(Array.isArray(req.body.facilities)
        ? { facilities: req.body.facilities.map((item) => str(item)).filter(Boolean) }
        : {}),
    });

    await theatre.populate('city', 'name slug state');
    res.status(201).json({ theatre: theatre.toPublic() });
  })
);

router.patch(
  '/theatres/:id',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const theatre = await Theatre.findById(assertObjectId(req.params.id, 'theatre id'));
    if (!theatre) throw ApiError.notFound('Theatre not found');
    assertCityAllowed(req, theatre.city.toString());

    if (req.body.name !== undefined) theatre.name = str(req.body.name);
    if (req.body.address !== undefined) theatre.address = str(req.body.address);
    if (req.body.locality !== undefined) theatre.locality = str(req.body.locality);
    if (req.body.phone !== undefined) theatre.phone = assertPhone(req.body.phone);
    if (req.body.imageUrl !== undefined) theatre.imageUrl = str(req.body.imageUrl);
    if (req.body.isActive !== undefined) theatre.isActive = Boolean(req.body.isActive);
    if (Array.isArray(req.body.facilities)) {
      theatre.facilities = req.body.facilities.map((item) => str(item)).filter(Boolean);
    }

    await theatre.save();
    await theatre.populate('city', 'name slug state');
    res.json({ theatre: theatre.toPublic() });
  })
);
/* -------------------------------------------------------------------------- */
/* Halls                                                                      */
/* -------------------------------------------------------------------------- */
router.get(
  '/halls',
  asyncHandler(async (req, res) => {
    const filter = scoped(req, {});
    const theatreId = optionalObjectId(req.query.theatre, 'theatre');
    if (theatreId) filter.theatre = theatreId;

    const halls = await Hall.find(filter).sort({ name: 1 }).populate('theatre', 'name locality');
    res.json({
      halls: halls.map((hall) => ({
        ...hall.toPublic(),
        theatre: hall.theatre && hall.theatre.name
          ? { id: hall.theatre._id.toString(), name: hall.theatre.name, locality: hall.theatre.locality }
          : null,
      })),
      seatCategories: SEAT_CATEGORIES,
      screenTypes: SCREEN_TYPES,
    });
  })
);

router.post(
  '/halls',
  writeLimiter,
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['name', 'theatre', 'layout']);

    const theatre = await Theatre.findById(assertObjectId(req.body.theatre, 'theatre'));
    if (!theatre) throw ApiError.notFound('Theatre not found');
    assertCityAllowed(req, theatre.city.toString());

    const hall = await Hall.create({
      name: str(req.body.name),
      theatre: theatre._id,
      city: theatre.city,
      screenType: assertEnum(str(req.body.screenType) || '2D', SCREEN_TYPES, 'screen type'),
      soundSystem: str(req.body.soundSystem) || 'Dolby Digital 7.1',
      projection: str(req.body.projection) || '4K Laser',
      screenSizeFt: req.body.screenSizeFt !== undefined
        ? assertNumber(req.body.screenSizeFt, 'screen size', { min: 10, max: 200 })
        : 40,
      notes: str(req.body.notes),
      layout: normaliseLayout(req.body.layout),
      pricing: normalisePricing(req.body.pricing, DEFAULT_PRICING),
    });

    res.status(201).json({ hall: hall.toPublic() });
  })
);
/**
 * Editing a layout would invalidate seat ids on tickets already sold, so it is
 * refused once the hall has confirmed bookings. Prices and specs stay editable.
 */
router.patch(
  '/halls/:id',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const hall = await Hall.findById(assertObjectId(req.params.id, 'hall id'));
    if (!hall) throw ApiError.notFound('Hall not found');
    assertCityAllowed(req, hall.city.toString());

    if (req.body.layout !== undefined) {
      const sold = await Booking.countDocuments({ hall: hall._id, status: 'confirmed' });
      if (sold > 0) {
        throw ApiError.conflict(
          `${hall.name} already has ${sold} confirmed booking(s), so its seat layout is locked. Create a new hall instead.`
        );
      }
      hall.layout = normaliseLayout(req.body.layout);
    }

    if (req.body.name !== undefined) hall.name = str(req.body.name);
    if (req.body.screenType !== undefined) {
      hall.screenType = assertEnum(str(req.body.screenType), SCREEN_TYPES, 'screen type');
    }
    if (req.body.soundSystem !== undefined) hall.soundSystem = str(req.body.soundSystem);
    if (req.body.projection !== undefined) hall.projection = str(req.body.projection);
    if (req.body.screenSizeFt !== undefined) {
      hall.screenSizeFt = assertNumber(req.body.screenSizeFt, 'screen size', { min: 10, max: 200 });
    }
    if (req.body.notes !== undefined) hall.notes = str(req.body.notes);
    if (req.body.isActive !== undefined) hall.isActive = Boolean(req.body.isActive);
    if (req.body.pricing !== undefined) {
      hall.pricing = normalisePricing(req.body.pricing, hall.pricing);
    }

    await hall.save();
    res.json({ hall: hall.toPublic() });
  })
);
/* -------------------------------------------------------------------------- */
/* Movies (shared catalog, super admin owns it)                               */
/* -------------------------------------------------------------------------- */
router.get(
  '/movies',
  asyncHandler(async (req, res) => {
    const q = str(req.query.q);
    const filter = {};
    if (q) filter.title = { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

    const movies = await Movie.find(filter).sort({ createdAt: -1 }).limit(200);
    res.json({ movies: movies.map((movie) => movie.toPublic()) });
  })
);

const MOVIE_FIELDS = [
  'tagline', 'overview', 'posterUrl', 'backdropUrl', 'trailerUrl', 'director', 'tmdbId',
];

const applyMovieBody = (movie, body) => {
  if (body.title !== undefined) movie.title = str(body.title);
  MOVIE_FIELDS.forEach((field) => {
    if (body[field] !== undefined) movie[field] = str(body[field]);
  });
  if (body.rating !== undefined) movie.rating = assertNumber(body.rating, 'rating', { min: 0, max: 10 });
  if (body.runtimeMinutes !== undefined) {
    movie.runtimeMinutes = assertNumber(body.runtimeMinutes, 'runtime', { min: 1, max: 400, integer: true });
  }
  if (body.certificate !== undefined) {
    movie.certificate = assertEnum(str(body.certificate).toUpperCase(), Movie.CERTIFICATES, 'certificate');
  }
  ['genres', 'languages', 'formats', 'cast'].forEach((field) => {
    if (Array.isArray(body[field])) movie[field] = body[field].map((item) => str(item)).filter(Boolean);
  });
  if (body.releaseDate !== undefined) {
    movie.releaseDate = body.releaseDate ? assertDate(body.releaseDate, 'release date') : null;
  }
  if (body.isActive !== undefined) movie.isActive = Boolean(body.isActive);
  return movie;
};

router.post(
  '/movies',
  superOnly,
  writeLimiter,
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['title']);
    const movie = applyMovieBody(new Movie(), req.body);
    await movie.save();
    res.status(201).json({ movie: movie.toPublic() });
  })
);

router.patch(
  '/movies/:id',
  superOnly,
  writeLimiter,
  asyncHandler(async (req, res) => {
    const movie = await Movie.findById(assertObjectId(req.params.id, 'movie id'));
    if (!movie) throw ApiError.notFound('Movie not found');
    applyMovieBody(movie, req.body);
    await movie.save();
    res.json({ movie: movie.toPublic() });
  })
);
/* -------------------------------------------------------------------------- */
/* Shows                                                                      */
/* -------------------------------------------------------------------------- */
router.get(
  '/shows',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 50, maxLimit: 200 });
    const filter = scoped(req, {});

    const theatreId = optionalObjectId(req.query.theatre, 'theatre');
    const hallId = optionalObjectId(req.query.hall, 'hall');
    const movieId = optionalObjectId(req.query.movie, 'movie');
    if (theatreId) filter.theatre = theatreId;
    if (hallId) filter.hall = hallId;
    if (movieId) filter.movie = movieId;

    if (req.query.date) {
      const start = assertDate(`${req.query.date}T00:00:00`, 'date');
      const end = new Date(start);
      end.setDate(end.getDate() + 1);
      filter.startsAt = { $gte: start, $lt: end };
    } else if (str(req.query.range) !== 'all') {
      // Default to what staff actually need: today onwards.
      const from = new Date();
      from.setHours(0, 0, 0, 0);
      filter.startsAt = { $gte: from };
    }

    const [shows, total] = await Promise.all([
      Show.find(filter)
        .sort({ startsAt: 1 })
        .skip(skip)
        .limit(limit)
        .populate('movie', 'title posterUrl certificate runtimeMinutes')
        .populate('hall', 'name screenType')
        .populate('theatre', 'name locality')
        .populate('city', 'name'),
      Show.countDocuments(filter),
    ]);

    res.json({
      shows: shows.map((show) => show.toPublic()),
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  })
);
/** Refuse a show that would overlap another one in the same hall. */
const assertNoClash = async (hall, startsAt, endsAt, excludeId) => {
  const clash = await Show.findOne({
    hall: hall._id,
    status: 'scheduled',
    startsAt: { $lt: endsAt },
    endsAt: { $gt: startsAt },
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).populate('movie', 'title');

  if (clash) {
    const when = clash.startsAt.toLocaleString('en-IN');
    const what = clash.movie && clash.movie.title ? clash.movie.title : 'another show';
    throw ApiError.conflict(`${hall.name} is already showing ${what} at ${when}`);
  }
};

router.post(
  '/shows',
  writeLimiter,
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['movie', 'hall', 'startsAt']);

    const [movie, hall] = await Promise.all([
      Movie.findById(assertObjectId(req.body.movie, 'movie')),
      Hall.findById(assertObjectId(req.body.hall, 'hall')).populate('theatre', 'name city'),
    ]);
    if (!movie) throw ApiError.notFound('Movie not found');
    if (!hall) throw ApiError.notFound('Hall not found');
    assertCityAllowed(req, hall.city.toString());
    if (!hall.isActive) throw ApiError.badRequest(`${hall.name} is marked inactive`);

    const startsAt = assertDate(req.body.startsAt, 'start time');
    if (startsAt.getTime() < Date.now()) throw ApiError.badRequest('A show cannot start in the past');

    // 20 minutes of cleaning and adverts between screenings.
    const endsAt = req.body.endsAt
      ? assertDate(req.body.endsAt, 'end time')
      : new Date(startsAt.getTime() + (movie.runtimeMinutes + 20) * 60 * 1000);
    if (endsAt <= startsAt) throw ApiError.badRequest('The end time must be after the start time');

    await assertNoClash(hall, startsAt, endsAt, null);

    const show = await Show.create({
      movie: movie._id,
      hall: hall._id,
      theatre: hall.theatre._id,
      city: hall.city,
      startsAt,
      endsAt,
      language: str(req.body.language) || (movie.languages[0] || 'Hindi'),
      format: str(req.body.format) || (movie.formats[0] || '2D'),
      pricing: normalisePricing(req.body.pricing, hall.pricing),
      totalSeats: hall.totalSeats,
    });

    await show.populate([
      { path: 'movie', select: 'title posterUrl certificate runtimeMinutes' },
      { path: 'hall', select: 'name screenType' },
      { path: 'theatre', select: 'name locality' },
      { path: 'city', select: 'name' },
    ]);

    res.status(201).json({ show: show.toPublic() });
  })
);
/**
 * Times cannot move once tickets are sold, because each ticket carries a frozen
 * snapshot of its showtime. Prices and metadata may change and apply to future
 * sales only.
 */
router.patch(
  '/shows/:id',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const show = await Show.findById(assertObjectId(req.params.id, 'show id')).populate('hall');
    if (!show) throw ApiError.notFound('Show not found');
    assertCityAllowed(req, show.city.toString());

    const retiming = req.body.startsAt !== undefined || req.body.endsAt !== undefined;
    if (retiming) {
      const sold = await Booking.countDocuments({ show: show._id, status: 'confirmed' });
      if (sold > 0) {
        throw ApiError.conflict(
          `${sold} ticket(s) are already sold for this show, so it cannot be rescheduled. Cancel it instead — that refunds the customers.`
        );
      }

      const startsAt = req.body.startsAt ? assertDate(req.body.startsAt, 'start time') : show.startsAt;
      const endsAt = req.body.endsAt ? assertDate(req.body.endsAt, 'end time') : show.endsAt;
      if (endsAt <= startsAt) throw ApiError.badRequest('The end time must be after the start time');

      await assertNoClash(show.hall, startsAt, endsAt, show._id);
      show.startsAt = startsAt;
      show.endsAt = endsAt;
    }

    if (req.body.language !== undefined) show.language = str(req.body.language);
    if (req.body.format !== undefined) show.format = str(req.body.format);
    if (req.body.pricing !== undefined) show.pricing = normalisePricing(req.body.pricing, show.pricing);

    await show.save();
    await show.populate([
      { path: 'movie', select: 'title posterUrl certificate runtimeMinutes' },
      { path: 'theatre', select: 'name locality' },
      { path: 'city', select: 'name' },
    ]);

    res.json({ show: show.toPublic() });
  })
);
/**
 * Cancelling a show is destructive for customers, so it refuses by default when
 * tickets exist. With `{ refundTickets: true }` every confirmed booking is
 * refunded in full — no cancellation fee, because this is the operator's doing.
 */
router.post(
  '/shows/:id/cancel',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const show = await Show.findById(assertObjectId(req.params.id, 'show id'));
    if (!show) throw ApiError.notFound('Show not found');
    assertCityAllowed(req, show.city.toString());
    if (show.status === 'cancelled') throw ApiError.badRequest('This show is already cancelled');

    const sold = await Booking.find({ show: show._id, status: 'confirmed' });

    if (sold.length && !req.body.refundTickets) {
      throw ApiError.conflict(
        `${sold.length} ticket(s) are sold for this show. Re-send with refundTickets: true to cancel and refund them all.`,
        { ticketsSold: sold.length, refundTotal: sold.reduce((sum, b) => sum + b.amount.total, 0) }
      );
    }

    const reason = str(req.body.reason) || 'Show cancelled by the cinema';
    const refunded = [];
    const failed = [];

    for (const booking of sold) {
      try {
        let refundId = null;
        if (booking.payment.paymentId && booking.amount.total > 0) {
          /* eslint-disable no-await-in-loop */
          const result = await razorpay.refund({
            paymentId: booking.payment.paymentId,
            amountInPaise: pricing.toPaise(booking.amount.total),
            notes: { reference: booking.reference, reason },
          });
          refundId = result.id;
        }
        await bookingService.releaseBooking(booking, 'cancelled', {
          reason,
          refundEligible: true,
          refundAmount: booking.amount.total,
          cancellationFee: 0,
          refundId,
        });
        /* eslint-enable no-await-in-loop */
        refunded.push({ reference: booking.reference, amount: booking.amount.total, refundId });
      } catch (error) {
        failed.push({ reference: booking.reference, message: error.message });
      }
    }

    // Release any in-flight holds too, then close the show.
    const pending = await Booking.find({ show: show._id, status: 'pending' });
    for (const booking of pending) {
      /* eslint-disable-next-line no-await-in-loop */
      await bookingService.releaseBooking(booking, 'cancelled', { reason });
    }

    show.status = 'cancelled';
    show.seatsSold = 0;
    await show.save();

    res.json({ show: show.toPublic(), refunded, failed, holdsReleased: pending.length });
  })
);
/* -------------------------------------------------------------------------- */
/* Bookings                                                                   */
/* -------------------------------------------------------------------------- */
router.get(
  '/bookings',
  asyncHandler(async (req, res) => {
    const { page, limit, skip } = parsePagination(req.query, { defaultLimit: 20, maxLimit: 100 });
    const filter = scoped(req, {});

    const status = str(req.query.status);
    if (status) filter.status = assertEnum(status, Booking.BOOKING_STATUSES, 'status');

    const theatreId = optionalObjectId(req.query.theatre, 'theatre');
    const showId = optionalObjectId(req.query.show, 'show');
    if (theatreId) filter.theatre = theatreId;
    if (showId) filter.show = showId;

    const q = str(req.query.q);
    if (q) {
      const safe = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { reference: { $regex: safe, $options: 'i' } },
        { 'ticket.code': { $regex: safe, $options: 'i' } },
        { 'snapshot.movieTitle': { $regex: safe, $options: 'i' } },
      ];
    }

    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = assertDate(req.query.from, 'from date');
      if (req.query.to) filter.createdAt.$lte = assertDate(req.query.to, 'to date');
    }

    const [bookings, total, sum] = await Promise.all([
      Booking.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate('user', 'name email phone'),
      Booking.countDocuments(filter),
      Booking.aggregate([
        { $match: { ...castIds(filter), status: 'confirmed' } },
        { $group: { _id: null, revenue: { $sum: '$amount.total' } } },
      ]),
    ]);

    res.json({
      bookings: bookings.map((booking) => ({
        ...booking.toPublic(),
        customer: booking.user
          ? { id: booking.user._id.toString(), name: booking.user.name, email: booking.user.email, phone: booking.user.phone }
          : null,
      })),
      revenue: sum.length ? Math.round(sum[0].revenue * 100) / 100 : 0,
      page,
      limit,
      total,
      pages: Math.max(1, Math.ceil(total / limit)),
    });
  })
);
router.get(
  '/bookings/:reference',
  asyncHandler(async (req, res) => {
    const booking = await loadScopedBooking(req);
    res.json({
      booking: {
        ...booking.toPublic(),
        customer: booking.user
          ? { id: booking.user._id.toString(), name: booking.user.name, email: booking.user.email, phone: booking.user.phone }
          : null,
      },
    });
  })
);

/** Gate scan. Idempotent per ticket: a second scan is reported, not accepted. */
router.post(
  '/bookings/:reference/check-in',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const booking = await loadScopedBooking(req);

    if (booking.status !== 'confirmed') {
      throw ApiError.badRequest(`This ticket is ${booking.status} and cannot be admitted`);
    }
    if (booking.ticket.checkedInAt) {
      throw ApiError.conflict(
        `Already checked in at ${booking.ticket.checkedInAt.toLocaleString('en-IN')}`,
        { checkedInAt: booking.ticket.checkedInAt }
      );
    }

    // Optional second factor from the QR payload.
    const code = str(req.body.ticketCode);
    if (code && booking.ticket.code && code.toUpperCase() !== booking.ticket.code) {
      throw ApiError.badRequest('The ticket code does not match this booking');
    }

    const startsAt = new Date(booking.snapshot.startsAt).getTime();
    const graceMs = 30 * 60 * 1000;
    if (Date.now() > startsAt + graceMs && !req.body.force) {
      throw ApiError.badRequest(
        'This show started more than 30 minutes ago. Send force: true to admit anyway.'
      );
    }

    booking.ticket.checkedInAt = new Date();
    booking.ticket.checkedInBy = req.user._id;
    await booking.save();

    res.json({ booking: booking.toPublic(), admitted: booking.seats.length });
  })
);
/**
 * Staff-initiated refund. Unlike a customer cancellation this ignores the
 * cutoff window and can waive the fee, for goodwill cases and no-shows caused
 * by the cinema.
 */
router.post(
  '/bookings/:reference/refund',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const booking = await loadScopedBooking(req);
    if (booking.status !== 'confirmed') {
      throw ApiError.badRequest(`A ${booking.status} booking cannot be refunded`);
    }

    const waiveFee = req.body.waiveFee !== false;
    const fee = waiveFee
      ? 0
      : Math.round(((booking.amount.total * config.pricing.cancellationFeePercent) / 100) * 100) / 100;
    const amount = Math.round(Math.max(0, booking.amount.total - fee) * 100) / 100;
    const reason = str(req.body.reason) || `Refunded by ${req.user.name}`;

    let refundId = null;
    if (booking.payment.paymentId && amount > 0) {
      const result = await razorpay.refund({
        paymentId: booking.payment.paymentId,
        amountInPaise: pricing.toPaise(amount),
        notes: { reference: booking.reference, reason, staff: req.user.email },
      });
      refundId = result.id;
    }

    await bookingService.releaseBooking(booking, 'cancelled', {
      reason,
      refundEligible: true,
      refundAmount: amount,
      cancellationFee: fee,
      refundId,
    });

    res.json({ booking: booking.toPublic(), refund: { refundAmount: amount, cancellationFee: fee, refundId } });
  })
);
/* -------------------------------------------------------------------------- */
/* Coupons                                                                    */
/* -------------------------------------------------------------------------- */
/** A branch admin sees global coupons plus the ones scoped to their own city. */
const couponScope = (req) =>
  (req.isCityScoped ? { $or: [{ cities: { $size: 0 } }, { cities: req.scopeCityId }] } : {});

/** Only city-scoped coupons are editable by a branch admin. */
const assertCouponEditable = (req, coupon) => {
  if (!req.isCityScoped) return;
  const cities = (coupon.cities || []).map((city) => city.toString());
  if (cities.length !== 1 || cities[0] !== req.scopeCityId) {
    throw ApiError.forbidden('This is a network-wide coupon. Only a super admin can change it.');
  }
};

router.get(
  '/coupons',
  asyncHandler(async (req, res) => {
    const coupons = await Coupon.find(couponScope(req))
      .sort({ createdAt: -1 })
      .limit(200)
      .populate('cities', 'name')
      .populate('theatres', 'name');

    res.json({
      coupons: coupons.map((coupon) => ({
        ...coupon.toPublic({ admin: true }),
        editable: !req.isCityScoped
          || ((coupon.cities || []).length === 1 && coupon.cities[0]._id.toString() === req.scopeCityId),
        expired: coupon.validTo < new Date(),
        remaining: coupon.usageLimit === 0 ? null : Math.max(0, coupon.usageLimit - coupon.usedCount),
      })),
      discountTypes: DISCOUNT_TYPES,
    });
  })
);
/** Shared field handling for coupon create and update. */
const applyCouponBody = async (req, coupon, body, { creating }) => {
  if (creating || body.code !== undefined) {
    const code = str(body.code).toUpperCase();
    if (!/^[A-Z0-9]{3,24}$/.test(code)) {
      throw ApiError.badRequest('A coupon code must be 3-24 letters or digits, no spaces');
    }
    coupon.code = code;
  }
  if (creating || body.label !== undefined) coupon.label = str(body.label);
  if (body.description !== undefined) coupon.description = str(body.description);

  if (creating || body.type !== undefined) {
    coupon.type = assertEnum(str(body.type).toLowerCase(), DISCOUNT_TYPES, 'discount type');
  }
  if (creating || body.value !== undefined) {
    const max = coupon.type === 'percent' ? 100 : 100000;
    coupon.value = assertNumber(body.value, 'discount value', { min: 1, max });
  }

  if (body.maxDiscount !== undefined) {
    coupon.maxDiscount = assertNumber(body.maxDiscount, 'maximum discount', { min: 0, max: 100000 });
  }
  if (body.minAmount !== undefined) {
    coupon.minAmount = assertNumber(body.minAmount, 'minimum ticket subtotal', { min: 0, max: 100000 });
  }
  if (body.minSeats !== undefined) {
    coupon.minSeats = assertNumber(body.minSeats, 'minimum seats', { min: 1, max: config.pricing.maxSeatsPerBooking, integer: true });
  }
  if (body.usageLimit !== undefined) {
    coupon.usageLimit = assertNumber(body.usageLimit, 'total usage limit', { min: 0, max: 1000000, integer: true });
  }
  if (body.perUserLimit !== undefined) {
    coupon.perUserLimit = assertNumber(body.perUserLimit, 'per-user limit', { min: 0, max: 100, integer: true });
  }

  if (body.validFrom !== undefined) coupon.validFrom = assertDate(body.validFrom, 'valid-from date');
  if (creating || body.validTo !== undefined) coupon.validTo = assertDate(body.validTo, 'valid-to date');
  if (coupon.validTo <= coupon.validFrom) {
    throw ApiError.badRequest('The valid-to date must be after the valid-from date');
  }

  if (body.firstBookingOnly !== undefined) coupon.firstBookingOnly = Boolean(body.firstBookingOnly);
  if (body.isPublic !== undefined) coupon.isPublic = Boolean(body.isPublic);
  if (body.isActive !== undefined) coupon.isActive = Boolean(body.isActive);
  // A branch admin's coupons are always pinned to their own city.
  if (req.isCityScoped) {
    coupon.cities = [new mongoose.Types.ObjectId(req.scopeCityId)];
  } else if (Array.isArray(body.cities)) {
    coupon.cities = body.cities.map((id) => new mongoose.Types.ObjectId(assertObjectId(id, 'city')));
  }

  if (Array.isArray(body.theatres)) {
    const ids = body.theatres.map((id) => assertObjectId(id, 'theatre'));
    if (ids.length) {
      const theatres = await Theatre.find({ _id: { $in: ids } }).select('city');
      if (theatres.length !== ids.length) throw ApiError.badRequest('One or more theatres do not exist');
      theatres.forEach((theatre) => assertCityAllowed(req, theatre.city.toString()));
    }
    coupon.theatres = ids.map((id) => new mongoose.Types.ObjectId(id));
  }

  return coupon;
};

router.post(
  '/coupons',
  writeLimiter,
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['code', 'label', 'type', 'value', 'validTo']);

    const coupon = new Coupon({ createdBy: req.user._id });
    await applyCouponBody(req, coupon, req.body, { creating: true });
    await coupon.save();

    res.status(201).json({ coupon: coupon.toPublic({ admin: true }) });
  })
);

router.patch(
  '/coupons/:id',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const coupon = await Coupon.findById(assertObjectId(req.params.id, 'coupon id'));
    if (!coupon) throw ApiError.notFound('Coupon not found');
    assertCouponEditable(req, coupon);

    await applyCouponBody(req, coupon, req.body, { creating: false });
    await coupon.save();

    res.json({ coupon: coupon.toPublic({ admin: true }) });
  })
);

/** Deactivates rather than deletes once a coupon has been redeemed. */
router.delete(
  '/coupons/:id',
  writeLimiter,
  asyncHandler(async (req, res) => {
    const coupon = await Coupon.findById(assertObjectId(req.params.id, 'coupon id'));
    if (!coupon) throw ApiError.notFound('Coupon not found');
    assertCouponEditable(req, coupon);

    if (coupon.usedCount > 0) {
      coupon.isActive = false;
      await coupon.save();
      res.json({ deactivated: true, coupon: coupon.toPublic({ admin: true }) });
      return;
    }

    await coupon.deleteOne();
    res.json({ deleted: true });
  })
);
/* -------------------------------------------------------------------------- */
/* Staff accounts (super admin only)                                          */
/* -------------------------------------------------------------------------- */
router.get(
  '/staff',
  superOnly,
  asyncHandler(async (_req, res) => {
    const staff = await User.find({ role: { $in: ['branch_admin', 'super_admin'] } })
      .sort({ role: 1, name: 1 })
      .populate('city', 'name slug state');

    res.json({ staff: staff.map((member) => member.toPublic()) });
  })
);

/**
 * Creates a branch admin locked to exactly one city. The password is set here
 * and should be changed by the admin on first sign-in.
 */
router.post(
  '/staff',
  superOnly,
  writeLimiter,
  asyncHandler(async (req, res) => {
    requireFields(req.body, ['name', 'email', 'password', 'city']);

    const email = assertEmail(req.body.email);
    const password = assertPassword(req.body.password);
    const role = assertEnum(str(req.body.role) || 'branch_admin', ['branch_admin', 'super_admin'], 'role');

    if (await User.findOne({ email })) {
      throw ApiError.conflict('An account already exists for this email');
    }

    let cityId = null;
    if (role === 'branch_admin') {
      const city = await City.findById(assertObjectId(req.body.city, 'city'));
      if (!city) throw ApiError.notFound('City not found');
      cityId = city._id;
    }

    const user = new User({
      name: str(req.body.name),
      email,
      phone: assertPhone(req.body.phone),
      role,
      city: cityId,
      authProvider: 'email',
    });
    await user.setPassword(password);
    await user.save();
    await user.populate('city', 'name slug state');

    res.status(201).json({ staff: user.toPublic() });
  })
);
/* APPEND_MARKER */
