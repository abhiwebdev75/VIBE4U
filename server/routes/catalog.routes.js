'use strict';

const express = require('express');

const City = require('../models/City');
const Movie = require('../models/Movie');
const Theatre = require('../models/Theatre');
const Hall = require('../models/Hall');
const Show = require('../models/Show');
const { ApiError, asyncHandler } = require('../utils/errors');
const { assertObjectId, optionalObjectId, str } = require('../utils/validate');
const bookingService = require('../services/booking');
const pricing = require('../services/pricing');

const router = express.Router();

const SHOW_POPULATE = [
  { path: 'movie', select: 'title posterUrl certificate runtimeMinutes genres' },
  { path: 'hall', select: 'name screenType soundSystem' },
  { path: 'theatre', select: 'name locality address' },
  { path: 'city', select: 'name slug' },
];

/** Escape a user string before it reaches a regex. */
const safeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Midnight-to-midnight window for a `?date=YYYY-MM-DD` filter. */
const dayRange = (value) => {
  const start = value ? new Date(`${value}T00:00:00`) : new Date();
  if (Number.isNaN(start.getTime())) throw ApiError.badRequest('Invalid date (use YYYY-MM-DD)');
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
};

const isoDay = (date) => new Date(date).toISOString().slice(0, 10);

/** Only shows that are still open for sale. */
const sellable = () => ({ status: 'scheduled', startsAt: { $gte: new Date() } });

/** Group a flat show list into theatre → showtimes, the shape the UI renders. */
const groupByTheatre = (shows) => {
  const byTheatre = new Map();
  shows.forEach((show) => {
    const theatre = show.theatre;
    const key = theatre && theatre._id ? theatre._id.toString() : String(theatre);
    if (!byTheatre.has(key)) {
      byTheatre.set(key, {
        id: key,
        name: (theatre && theatre.name) || 'Theatre',
        locality: (theatre && theatre.locality) || '',
        address: (theatre && theatre.address) || '',
        shows: [],
      });
    }
    byTheatre.get(key).shows.push(show.toPublic());
  });
  return [...byTheatre.values()].sort((a, b) => a.name.localeCompare(b.name));
};
/* -------------------------------------------------------------------------- */
/* Cities                                                                     */
/* -------------------------------------------------------------------------- */
router.get(
  '/cities',
  asyncHandler(async (_req, res) => {
    const cities = await City.find({ isActive: true }).sort({ name: 1 });
    res.json({ cities: cities.map((city) => city.toPublic()) });
  })
);

/* -------------------------------------------------------------------------- */
/* Movies                                                                     */
/* -------------------------------------------------------------------------- */
/**
 * Now showing. With `?city=` only movies that actually have an upcoming show in
 * that city are returned, so the listing never links to an empty page.
 */
router.get(
  '/movies',
  asyncHandler(async (req, res) => {
    const cityId = optionalObjectId(req.query.city, 'city');
    const q = str(req.query.q);
    const genre = str(req.query.genre);

    const filter = { isActive: true };
    if (q) filter.title = { $regex: safeRegex(q), $options: 'i' };
    if (genre) filter.genres = genre;

    if (cityId) {
      const playing = await Show.distinct('movie', { ...sellable(), city: cityId });
      filter._id = { $in: playing };
    }

    const movies = await Movie.find(filter).sort({ releaseDate: -1, title: 1 }).limit(60);
    res.json({ movies: movies.map((movie) => movie.toPublic()) });
  })
);
/**
 * Movie detail plus, when `?city=` is given, showtimes grouped by theatre for a
 * single day. Without `?date=` we fall back to the first day that has shows so
 * the page is never blank just because today's screenings have finished.
 */
router.get(
  '/movies/:id',
  asyncHandler(async (req, res) => {
    const movie = await Movie.findById(assertObjectId(req.params.id, 'movie id'));
    if (!movie) throw ApiError.notFound('Movie not found');

    const cityId = optionalObjectId(req.query.city, 'city');
    let theatres = [];
    let dates = [];
    let selectedDate = null;

    if (cityId) {
      const all = await Show.find({ movie: movie._id, city: cityId, ...sellable() })
        .sort({ startsAt: 1 })
        .populate(SHOW_POPULATE);

      dates = [...new Set(all.map((show) => isoDay(show.startsAt)))];

      let { start, end } = dayRange(req.query.date);
      const hasShowsInWindow = all.some((show) => show.startsAt >= start && show.startsAt < end);
      if (!req.query.date && !hasShowsInWindow && dates.length) {
        ({ start, end } = dayRange(dates[0]));
      }

      selectedDate = isoDay(start);
      theatres = groupByTheatre(all.filter((show) => show.startsAt >= start && show.startsAt < end));
    }

    res.json({ movie: movie.toPublic(), theatres, dates, selectedDate });
  })
);
/* -------------------------------------------------------------------------- */
/* Theatres and halls                                                         */
/* -------------------------------------------------------------------------- */
router.get(
  '/theatres',
  asyncHandler(async (req, res) => {
    const cityId = optionalObjectId(req.query.city, 'city');
    const filter = { isActive: true };
    if (cityId) filter.city = cityId;

    const theatres = await Theatre.find(filter).sort({ name: 1 }).populate('city', 'name slug state');
    const halls = await Hall.find({
      theatre: { $in: theatres.map((theatre) => theatre._id) },
      isActive: true,
    }).select('theatre name screenType layout');

    const hallsByTheatre = halls.reduce((acc, hall) => {
      const key = hall.theatre.toString();
      acc[key] = acc[key] || [];
      acc[key].push({
        id: hall._id.toString(),
        name: hall.name,
        screenType: hall.screenType,
        totalSeats: hall.totalSeats,
      });
      return acc;
    }, {});

    res.json({
      theatres: theatres.map((theatre) => ({
        ...theatre.toPublic(),
        halls: hallsByTheatre[theatre._id.toString()] || [],
      })),
    });
  })
);
/** Theatre page: hall specs plus everything currently playing here. */
router.get(
  '/theatres/:id',
  asyncHandler(async (req, res) => {
    const theatre = await Theatre.findById(assertObjectId(req.params.id, 'theatre id')).populate(
      'city',
      'name slug state'
    );
    if (!theatre) throw ApiError.notFound('Theatre not found');

    const halls = await Hall.find({ theatre: theatre._id }).sort({ name: 1 });
    const shows = await Show.find({ theatre: theatre._id, ...sellable() })
      .sort({ startsAt: 1 })
      .limit(300)
      .populate(SHOW_POPULATE);

    const byMovie = new Map();
    shows.forEach((show) => {
      const movie = show.movie;
      const key = movie && movie._id ? movie._id.toString() : String(movie);
      if (!byMovie.has(key)) {
        byMovie.set(key, {
          id: key,
          title: (movie && movie.title) || 'Movie',
          posterUrl: (movie && movie.posterUrl) || '',
          certificate: (movie && movie.certificate) || '',
          runtimeMinutes: (movie && movie.runtimeMinutes) || null,
          shows: [],
        });
      }
      byMovie.get(key).shows.push(show.toPublic());
    });

    res.json({
      theatre: theatre.toPublic(),
      halls: halls.map((hall) => hall.toPublic()),
      movies: [...byMovie.values()],
      dates: [...new Set(shows.map((show) => isoDay(show.startsAt)))],
    });
  })
);
/** Hall detail: layout, per-category seat counts, base pricing, next shows. */
router.get(
  '/halls/:id',
  asyncHandler(async (req, res) => {
    const hall = await Hall.findById(assertObjectId(req.params.id, 'hall id')).populate(
      'theatre',
      'name locality address city'
    );
    if (!hall) throw ApiError.notFound('Hall not found');

    const shows = await Show.find({ hall: hall._id, ...sellable() })
      .sort({ startsAt: 1 })
      .limit(60)
      .populate(SHOW_POPULATE);

    res.json({
      hall: hall.toPublic(),
      seatPreview: hall.buildSeatMap(),
      shows: shows.map((show) => show.toPublic()),
    });
  })
);

/* -------------------------------------------------------------------------- */
/* Shows                                                                      */
/* -------------------------------------------------------------------------- */
router.get(
  '/shows',
  asyncHandler(async (req, res) => {
    const filter = { ...sellable() };
    const cityId = optionalObjectId(req.query.city, 'city');
    const movieId = optionalObjectId(req.query.movie, 'movie');
    const theatreId = optionalObjectId(req.query.theatre, 'theatre');
    if (cityId) filter.city = cityId;
    if (movieId) filter.movie = movieId;
    if (theatreId) filter.theatre = theatreId;

    if (req.query.date) {
      const { start, end } = dayRange(req.query.date);
      filter.startsAt = { $gte: new Date(Math.max(start.getTime(), Date.now())), $lt: end };
    }

    const shows = await Show.find(filter).sort({ startsAt: 1 }).limit(200).populate(SHOW_POPULATE);
    res.json({ shows: shows.map((show) => show.toPublic()), theatres: groupByTheatre(shows) });
  })
);
/**
 * Seat map for the booking screen. Public so visitors can gauge availability
 * before signing in; actually holding a seat requires auth.
 */
router.get(
  '/shows/:id/seats',
  asyncHandler(async (req, res) => {
    const show = await bookingService.loadShow(assertObjectId(req.params.id, 'show id'));
    const map = await bookingService.buildSeatMap(show);

    res.json({
      ...map,
      policy: {
        cancellationCutoffHours: pricing.feeConfig.cancellationCutoffHours,
        cancellationFeePercent: pricing.feeConfig.cancellationFeePercent,
      },
    });
  })
);

module.exports = router;
