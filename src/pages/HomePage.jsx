import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Search, Star, ChevronLeft, User, Clock, Drama, Ticket, ChevronRight, Film, Menu, X, Users, Calendar, MapPin, Film as FilmIcon, LogOut, UserCircle, MessageSquare } from 'lucide-react';
import BookingPage from './BookingPage';
// --- Configuration: TMDB API ---
const API_KEY = 'd54630c008cb56d4edc29ec2c25f4e70';
const BASE_URL = 'https://api.themoviedb.org/3';
const IMAGE_BASE_URL = 'https://image.tmdb.org/t/p/w500';
const BACKDROP_BASE_URL = 'https://image.tmdb.org/t/p/w1280';
const GENRE_MAP = { 28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 18: 'Drama', 10751: 'Family', 14: 'Fantasy', 36: 'History', 27: 'Horror', 10402: 'Music', 9648: 'Mystery', 10749: 'Romance', 878: 'Sci-Fi', 10770: 'TV Movie', 53: 'Thriller', 10752: 'War', 37: 'Western' };

const MOVIE_PRICE_PER_SEAT = 250;
const MOVIE_IMAGE_FALLBACK = 'https://placehold.co/200x300/6b7280/ffffff?text=Poster+Unavailable';
const BACKDROP_IMAGE_FALLBACK = 'https://placehold.co/1280x720/1e293b/ffffff?text=Backdrop+Unavailable';

// --- Mock Data for Network Failure ---
const MOCK_MOVIE_DETAILS = { 
    runtime: '150 min',
    star_cast: 'A. Star, B. Starlet, C. Director',
    showtimes: ['10:00 AM', '02:30 PM', '07:00 PM', '10:30 PM']
}; 

const FALLBACK_MOCK_MOVIES = [
    { id: 'm100', title: 'Cosmic Drift (Mock)', posterUrl: 'https://placehold.co/200x300/a855f7/ffffff?text=Mock+Sci-Fi', backdropUrl: 'https://placehold.co/1280x720/a855f7/370e7e?text=MOCK+CAROUSEL', rating: 9.1, genreIds: [878], tagline: 'Fallback data activated for instant loading.', releaseDate: '2024-01-01', ...MOCK_MOVIE_DETAILS },
    { id: 'm101', title: 'Shadow Heist (Mock)', posterUrl: 'https://placehold.co/200x300/ef4444/ffffff?text=Mock+Action', backdropUrl: 'https://placehold.co/1280x720/ef4444/7f2222?text=MOCK+CAROUSEL+2', rating: 8.5, genreIds: [28], tagline: 'Network failed, showing local data.', releaseDate: '2024-02-15', ...MOCK_MOVIE_DETAILS },
    { id: 'm102', title: 'The Silent Code (Mock)', posterUrl: 'https://placehold.co/200x300/3b82f6/ffffff?text=Mock+Thriller', backdropUrl: 'https://placehold.co/1280x720/3b82f6/1e40af?text=MOCK+CAROUSEL+3', rating: 7.8, genreIds: [53], tagline: 'Check console for network error.', releaseDate: '2024-03-01', ...MOCK_MOVIE_DETAILS },
    { id: 'm103', title: 'Royal Intrigue (Mock)', posterUrl: 'https://placehold.co/200x300/3b82f6/ffffff?text=Mock+Drama', backdropUrl: 'https://placehold.co/1280x720/3b82f6/1e40af?text=MOCK+CAROUSEL+4', rating: 9.2, genreIds: [18], tagline: 'Power is not given, it is taken.', releaseDate: '2024-04-10', ...MOCK_MOVIE_DETAILS },
    { id: 'm104', title: 'Laugh Riot (Mock)', posterUrl: 'https://placehold.co/200x300/ec4899/ffffff?text=Mock+Comedy', backdropUrl: 'https://placehold.co/1280x720/ec4899/7f2222?text=MOCK+CAROUSEL+5', rating: 7.5, genreIds: [35], tagline: 'Expect the unexpected.', releaseDate: '2024-05-20', ...MOCK_MOVIE_DETAILS },
    { id: 'm105', title: 'The Deep Sea (Mock)', posterUrl: 'https://placehold.co/200x300/14b8a6/ffffff?text=Mock+Action', backdropUrl: 'https://placehold.co/1280x720/14b8a6/1e40af?text=MOCK+CAROUSEL+6', rating: 7.0, genreIds: [28, 12], tagline: 'The pressure is on.', releaseDate: '2024-06-01', ...MOCK_MOVIE_DETAILS },
];

// --- Mock Feedback Data (New) ---
// Updated structure to match TMDB Review API fields
const FALLBACK_MOCK_FEEDBACK = [
    { id: 1, author: 'CinemaLover88', author_details: { rating: 9 }, movieTitle: 'Cosmic Drift (Mock)', content: "Absolutely stunning visuals! The sound design blew me away. Worth the ticket price just for the experience.", created_at: "2024-09-01" },
    { id: 2, author: 'ThrillerFan', author_details: { rating: 8 }, movieTitle: 'Shadow Heist (Mock)', content: "Great pacing and intense action sequences. The plot twist was a little predictable, but overall highly enjoyable.", created_at: "2024-09-05" },
    { id: 3, author: 'DateNightReview', author_details: { rating: 10 }, movieTitle: 'Royal Intrigue (Mock)', content: "My favorite movie this year. Brilliant performances and incredible dialogue. A true cinematic masterpiece.", created_at: "2024-09-10" },
];


// --- Utility Functions ---
const cn = (...classes) => classes.filter(Boolean).join(' ');

const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);
        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);
    return debouncedValue;
};

// Updated getGenreName to use TMDB's numerical ID mapping again
const getGenreName = (genreId) => GENRE_MAP[genreId] || 'Unknown';


// --- TMDB API Fetching ---
const fetchMovies = async () => {
    const fetchPage = async (page, language, region) => {
        const url = `${BASE_URL}/movie/now_playing?api_key=${API_KEY}&language=${language}&region=${region}&page=${page}`;
        try {
            const response = await fetch(url);
            if (!response.ok) {
                return []; 
            }
            const data = await response.json();
            
            return data.results
                .filter(movie => movie.poster_path && movie.backdrop_path)
                .map(movie => ({
                    id: movie.id.toString(),
                    title: movie.title,
                    posterUrl: `${IMAGE_BASE_URL}${movie.poster_path}`,
                    backdropUrl: `${BACKDROP_BASE_URL}${movie.backdrop_path}`,
                    rating: movie.vote_average, 
                    genreIds: movie.genre_ids,
                    tagline: movie.overview.substring(0, 100) + (movie.overview.length > 100 ? '...' : ''),
                    releaseDate: movie.release_date,
                    ...MOCK_MOVIE_DETAILS 
                }));
        } catch (error) {
            console.error("Failed to fetch page:", error);
            return [];
        }
    };

    let allMovies = [];
    const movieIds = new Set();
    const maxPages = 2;
    
    // Attempt to fetch real data
    for (let page = 1; page <= maxPages; page++) {
        const globalMovies = await fetchPage(page, 'en-US', 'US');
        const indianMovies = await fetchPage(page, 'hi-IN', 'IN');

        [...globalMovies, ...indianMovies].forEach(movie => {
            if (!movieIds.has(movie.id)) { 
                allMovies.push(movie);
                movieIds.add(movie.id);
            }
        });
    }
    
    // If no movies were successfully fetched, return mock data
    if (allMovies.length === 0) {
        console.warn("API fetching failed. Loading fallback mock data.");
        return FALLBACK_MOCK_MOVIES;
    }

    return allMovies;
};

// LIVE TMDB API Call for Feedback (Updated base URL reference)
const fetchFeedback = async (movieId) => {
    // If using mock data, return mock feedback
    if (movieId && movieId.startsWith('m10')) {
        // Return a mock review specifically for the mock movie
        const mockMovie = FALLBACK_MOCK_MOVIES.find(m => m.id === movieId);
        const mockReview = FALLBACK_MOCK_FEEDBACK.find(f => f.movieTitle === mockMovie?.title);

        if (mockReview) {
            return [{ ...mockReview, movieTitle: mockMovie.title }];
        }
        return FALLBACK_MOCK_FEEDBACK.slice(0, 1);
    }
    
    // FIX: Corrected BASE_BASE_URL to BASE_URL
    const url = `${BASE_URL}/movie/${movieId}/reviews?api_key=${API_KEY}&language=en-US&page=1`;
    
    try {
        const response = await fetch(url);
        const data = await response.json();
        
        console.log(`Total Reviews for Movie ${movieId}: ${data.total_results}`);
        
        if (data.results && data.results.length > 0) {
            return data.results;
        }
        
        // Fallback to general mock data if no reviews are found for the specific movie
        return FALLBACK_MOCK_FEEDBACK.slice(0, 1);
    } catch (error) {
        console.error('Error fetching reviews:', error);
        return FALLBACK_MOCK_FEEDBACK.slice(0, 1); // Return one mock item on fetch error
    }
};


const fetchTrailerKey = async (movieId) => {
    // If using mock data, return a mock URL
    if (movieId.startsWith('m10')) {
        return 'https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&rel=0&modestbranding=1'; 
    }

    // FIX: Corrected BASE_BASE_URL to BASE_URL
    const url = `${BASE_URL}/movie/${movieId}/videos?api_key=${API_KEY}&language=en-US`;
    try {
        const response = await fetch(url);
        const data = await response.json();
        const trailer = data.results.find(video => video.site === "YouTube" && video.type === "Trailer");
        return trailer ? `https://www.youtube.com/embed/${trailer.key}?autoplay=1&rel=0&modestbranding=1` : null;
    } catch (error) {
        return null;
    }
};

// --- SHADCN/UI Imports Simulation ---
const Card = ({ className, children, onClick }) => (<div onClick={onClick} className={"rounded-xl border shadow-lg transition-colors bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 " + className}>{children}</div>);
const CardHeader = ({ className, children }) => (<div className={"flex flex-col space-y-1.5 p-6 " + className}>{children}</div>);
const CardTitle = ({ className, children }) => (<h3 className={"text-xl font-semibold leading-none tracking-tight text-gray-900 dark:text-white " + className}>{children}</h3>);
const CardContent = ({ className, children }) => (<div className={"p-6 pt-0 " + className}>{children}</div>);
const CardFooter = ({ className, children }) => (<div className={"flex items-center p-6 pt-0 " + className}>{children}</div>);
const Button = ({ variant = 'default', className, onClick, disabled, children, type = 'button' }) => {
    let baseStyles = 'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none h-10 px-4 py-2';
    let variantStyles = variant === 'default' ? 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 focus-visible:ring-red-500' : 'border border-gray-300 bg-transparent text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-700 focus-visible:ring-gray-500';
    return (<button type={type} className={baseStyles + ' ' + variantStyles + ' ' + className} onClick={onClick} disabled={disabled}>{children}</button>);
};
const Input = (props) => (<input {...props} className={"flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 " + props.className} />);
const Badge = ({ variant = 'default', className, children, onClick }) => {
    let variantStyles = variant === 'default' ? 'bg-red-600 text-white hover:bg-red-700' : 'border border-gray-500 text-gray-400 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-700';
    return (<div onClick={onClick} className={'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ' + variantStyles + ' ' + className}>{children}</div>);
};
const Pagination = ({ children }) => <nav className="flex justify-center">{children}</nav>;
const PaginationContent = ({ children }) => <ul className="flex items-center space-x-2">{children}</ul>;
const PaginationItem = ({ children }) => <li>{children}</li>;
const PaginationPrevious = ({ onClick, className }) => (<Button variant="secondary" onClick={onClick} className={'h-10 px-3 ' + className}><ChevronLeft className='h-4 w-4 mr-1' /> Previous</Button>);
const PaginationNext = ({ onClick, className }) => (<Button variant="secondary" onClick={onClick} className={'h-10 px-3 ' + className}>Next <ChevronLeft className='h-4 w-4 ml-1 rotate-180' /></Button>);
// --- END SHADCN/UI Simulation ---


// --- DYNAMIC VIEW COMPONENTS ---

/**
 * Trailer Modal Component
 */
const TrailerModal = ({ movie, trailerUrl, onClose }) => {
    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/90 backdrop-blur-sm transition-opacity duration-300" onClick={onClose}>
            <Card className="max-w-5xl w-full mx-4 shadow-2xl animate-in fade-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
                <CardHeader className="flex flex-row items-center justify-between p-4 bg-gray-900 rounded-t-xl">
                    <CardTitle className="text-xl text-white truncate">
                        {movie.title} Trailer
                    </CardTitle>
                    <Button variant="secondary" onClick={onClose} className="h-8 w-8 p-0 rounded-full bg-red-600 hover:bg-red-700 text-white">
                        <X className="h-5 w-5" />
                    </Button>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="relative w-full aspect-video">
                        {trailerUrl ? (
                            <iframe
                                className="w-full h-full"
                                src={trailerUrl}
                                title={`${movie.title} Trailer`}
                                frameBorder="0"
                                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                                allowFullScreen
                            ></iframe>
                        ) : (
                            <div className="flex items-center justify-center h-[500px] bg-gray-800 text-white">Trailer Not Found</div>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    );
};

/**
 * Movie Detail View
 */
const MovieDetailView = ({ movie, onBack, onBook, onTrailerView }) => {
    // Uses TMDB ID for lookup
    const primaryGenre = getGenreName(movie.genreIds[0]);

    return (
        <main className="container mx-auto p-4 flex-grow min-h-screen pt-24">
            <Button variant="secondary" onClick={() => onBack()} className="mb-6">
                <ChevronLeft className="h-4 w-4 mr-1" /> Back to List
            </Button>
            
            <Card className="grid grid-cols-1 md:grid-cols-3 gap-6 p-8 shadow-2xl">
                <div className="md:col-span-1 flex justify-center">
                    <img src={movie.posterUrl || MOVIE_IMAGE_FALLBACK} alt={movie.title} className="w-full max-w-xs rounded-lg shadow-xl" />
                </div>

                <div className="md:col-span-2 space-y-4">
                    <CardTitle className="text-4xl text-red-600 dark:text-red-500">{movie.title}</CardTitle>
                    <p className="text-lg italic text-gray-600 dark:text-gray-400">{movie.tagline}</p>

                    <div className="space-y-2 pt-2 border-t border-gray-200 dark:border-gray-700">
                        <div className='flex items-center text-xl text-yellow-500 font-semibold'>
                            <Star className='h-6 w-6 mr-2 fill-yellow-500' /> {movie.rating.toFixed(1)} / 10
                        </div>
                        <div className='flex space-x-6 flex-wrap'>
                            <span className='flex items-center text-gray-700 dark:text-gray-300'><Drama className='h-5 w-5 mr-2 text-red-500' /> {primaryGenre}</span>
                            <span className='flex items-center text-gray-700 dark:text-gray-300'><Clock className='h-5 w-5 mr-2 text-red-500' /> {movie.runtime}</span>
                        </div>
                    </div>

                    <p className='flex items-center text-gray-700 dark:text-gray-300 font-medium'>
                        <Users className='h-5 w-5 mr-2 text-red-500' /> **Star Cast:** {movie.star_cast}
                    </p>

                    <div className="pt-2">
                        <p className='flex items-center text-gray-700 dark:text-gray-300 font-medium mb-2'>
                            <Calendar className='h-5 w-5 mr-2 text-red-500' /> **Today's Showtimes:**
                        </p>
                        <div className="flex flex-wrap gap-2">
                            {movie.showtimes.map(time => (
                                <Badge key={time} variant="outline" className="px-3 py-1 text-sm cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
                                    {time}
                                </Badge>
                            ))}
                        </div>
                    </div>

                    <div className='flex space-x-4 pt-6'>
                        <Button className="h-12 px-8 text-lg" onClick={() => onBook(movie.id)}>
                            <Ticket className='h-5 w-5 mr-2' /> Purchase Tickets (₹{MOVIE_PRICE_PER_SEAT})
                        </Button>
                        <Button variant="secondary" className="h-12 px-8 text-lg" onClick={() => onTrailerView(movie.id)}>
                            <FilmIcon className='h-5 w-5 mr-2' /> Watch Trailer
                        </Button>
                    </div>
                </div>
            </Card>
        </main>
    );
};


/**
 * Booking Page Placeholder
 */
const MockBookingPage = ({ movie, onBack }) => {
    return (
        <main className="container mx-auto p-8 flex-grow min-h-screen pt-24">
            <div className="p-10 bg-red-100 dark:bg-red-900 border border-red-500 rounded-lg">
                <h2 className="text-3xl font-bold text-red-600 dark:text-red-300 mb-4">
                    Booking Page Placeholder
                </h2>
                <p className='text-gray-700 dark:text-gray-200 mb-6'>
                    The separate <code className="bg-red-200 dark:bg-red-800 p-1 rounded">BookingPage.jsx</code> file will handle the booking for **{movie.title}**.
                </p>
                <Button onClick={() => onBack()}>
                    <ChevronLeft className="h-4 w-4 mr-1" /> Return to Movie List
                </Button>
            </div>
        </main>
    );
};


// --- FEEDBACK COMPONENTS (NEW) ---

const FeedbackCard = ({ review, movieTitle }) => {
    const rating = review.author_details?.rating || 0; // Use TMDB rating (0-10)
    const normalizedRating = Math.round(rating / 2); // Normalize to 0-5 stars

    return (
        <Card className="p-4 flex flex-col space-y-3 shadow-lg bg-gray-50 dark:bg-gray-800 transition-colors border-t-4 border-red-500">
            <div className="flex items-center justify-between">
                <div className="font-semibold text-sm text-gray-800 dark:text-white flex items-center">
                    <UserCircle className='h-5 w-5 mr-2 text-red-500' /> {review.author}
                </div>
                <div className='flex items-center text-yellow-500'>
                    {Array(normalizedRating).fill(0).map((_, i) => (
                        <Star key={i} className='h-4 w-4 fill-yellow-500' />
                    ))}
                    {Array(5 - normalizedRating).fill(0).map((_, i) => (
                        <Star key={`empty-${i}`} className='h-4 w-4 text-gray-500 dark:text-gray-600' />
                    ))}
                </div>
            </div>
            <p className="text-sm italic text-gray-600 dark:text-gray-300 flex-grow max-h-20 overflow-hidden line-clamp-3">
                "{review.content.substring(0, 200)}..."
            </p>
            <p className="text-xs font-medium text-red-600 dark:text-red-400 border-t border-gray-200 dark:border-gray-700 pt-2">
                Film: {movieTitle || 'N/A'}
            </p>
        </Card>
    );
};

const FeedbackSection = ({ topMovies }) => {
    const [reviews, setReviews] = useState([]);
    const [loadingReviews, setLoadingReviews] = useState(true);

    useEffect(() => {
        const loadReviews = async () => {
            setLoadingReviews(true);
            const reviewPromises = topMovies.slice(0, 3).map(async (movie) => {
                // Fetch feedback and pass movie ID
                const results = await fetchFeedback(movie.id);
                if (results && results.length > 0) {
                    // Attach movie title for display
                    return { ...results[0], movieTitle: movie.title }; 
                }
                return null;
            });

            // Wait for all fetches/mock resolutions to complete
            const loadedReviews = (await Promise.all(reviewPromises))
                .filter(r => r !== null)
                .slice(0, 3);
                
            setReviews(loadedReviews);
            setLoadingReviews(false);
        };

        if (topMovies.length > 0) {
            loadReviews();
        } else {
            setLoadingReviews(false);
        }
    }, [topMovies]); 

    if (loadingReviews) {
        return (
            <section className="container mx-auto py-12 px-4 text-center">
                <p className='text-gray-500 dark:text-gray-400'>Loading reviews...</p>
            </section>
        );
    }
    
    if (reviews.length === 0) return null;
    
    return (
        <section className="container mx-auto py-12 px-4">
            <h2 className="text-3xl font-bold text-center text-gray-800 dark:text-white mb-8 flex items-center justify-center">
                <MessageSquare className='h-7 w-7 mr-3 text-red-500' /> What Our Viewers Are Saying
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                {reviews.map(review => (
                    <FeedbackCard key={review.id} review={review} movieTitle={review.movieTitle} />
                ))}
            </div>
        </section>
    );
};


// --- FOOTER COMPONENT ---
const AppFooter = () => (
    <footer className="w-full bg-gray-900 dark:bg-black text-gray-400 py-8 mt-12 border-t border-red-600/50">
        <div className="container mx-auto px-4 grid grid-cols-2 md:grid-cols-4 gap-8">
            {/* Column 1: Logo & Mission */}
            <div>
                <div className="text-xl font-bold text-red-500 mb-3">🎬 VIBE 4 U</div>
                <p className="text-sm">Your ultimate hub for the latest showtimes and easy ticket booking in India.</p>
            </div>
            
            {/* Column 2: Navigation */}
            <div>
                <h4 className="font-semibold text-white mb-3 uppercase text-sm">Quick Links</h4>
                <ul className="space-y-1 text-sm">
                    <li><a href="#home" className="hover:text-red-500 transition-colors">Home</a></li>
                    <li><a href="#showtimes" className="hover:text-red-500 transition-colors">Showtimes</a></li>
                    <li><a href="#contact" className="hover:text-red-500 transition-colors">Contact Us</a></li>
                </ul>
            </div>

            {/* Column 3: Legal */}
            <div>
                <h4 className="font-semibold text-white mb-3 uppercase text-sm">Legal</h4>
                <ul className="space-y-1 text-sm">
                    <li><a href="#" className="hover:text-red-500 transition-colors">Privacy Policy</a></li>
                    <li><a href="#" className="hover:text-red-500 transition-colors">Terms of Use</a></li>
                    <li><a href="#" className="hover:text-red-500 transition-colors">Disclaimer</a></li>
                </ul>
            </div>

            {/* Column 4: Contact */}
            <div>
                <h4 className="font-semibold text-white mb-3 uppercase text-sm">Get In Touch</h4>
                <p className="text-sm">Email: support@vibe4u.in</p>
                <p className="text-sm mt-1">Territory: India (IN)</p>
            </div>
        </div>
        <div className="container mx-auto px-4 mt-8 pt-4 border-t border-gray-700 text-center text-xs">
            &copy; {new Date().getFullYear()} VIBE 4 U. All rights reserved. Data provided by TMDB.
        </div>
    </footer>
);


// --- CORE APPLICATION COMPONENTS ---

const NavBar = ({ toggleTheme, theme, isLoggedIn, onLogin, onLogout }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [selectedCity, setSelectedCity] = useState('New Delhi');
    const CITIES = ['New Delhi', 'Mumbai', 'Bangalore', 'Chennai', 'Kolkata'];

    const navItems = [
        { name: 'Home', href: '#home' },
        { name: 'Showtimes', href: '#showtimes' },
        { name: 'Contact', href: '#contact' },
    ];

    const handleCityChange = (e) => {
        setSelectedCity(e.target.value);
        console.log(`City selection changed to: ${e.target.value}`);
    };

    return (
        <nav className="fixed w-screen z-50 bg-black/40 backdrop-blur-sm transition-colors duration-500">
            <div className="container mx-auto flex items-center justify-between px-4 py-3">
                {/* 1. Logo */}
                <div className="text-2xl font-bold text-red-500">🎬 VIBE 4 U</div>
                
                {/* Desktop Nav Links and Controls */}
                <div className="hidden md:flex items-center space-x-6">
                    {/* City Selector */}
                    <div className="relative flex items-center text-sm">
                        <MapPin className="h-4 w-4 text-white mr-2" />
                        <select 
                            value={selectedCity} 
                            onChange={handleCityChange}
                            className="bg-transparent text-white border-none focus:ring-0 focus:outline-none cursor-pointer p-0 text-sm font-medium pr-6"
                        >
                            {CITIES.map(city => (
                                <option key={city} value={city} className="text-gray-900 dark:text-white bg-gray-900 dark:bg-gray-800">
                                    {city}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Navigation Items */}
                    {navItems.map(item => (<a key={item.name} href={item.href} className="text-white hover:text-red-500 transition-colors font-medium text-sm uppercase">{item.name}</a>))}
                    
                    {/* Auth Buttons: Conditional Display */}
                    {!isLoggedIn ? (
                        <>
                            <Button onClick={onLogin} variant="secondary" className="h-8 px-3 py-1 bg-white/10 hover:bg-white/20 text-white">
                                <User className="h-4 w-4 mr-1" /> Login
                            </Button>
                            <Button onClick={onLogin} variant="default" className="h-8 px-3 py-1 text-sm">
                                Sign Up
                            </Button>
                        </>
                    ) : (
                        <>
                            <Button variant="secondary" className="h-8 px-3 py-1 bg-white/10 hover:bg-white/20 text-white">
                                <UserCircle className="h-4 w-4 mr-1" /> Profile
                            </Button>
                            <Button onClick={onLogout} variant="outline" className="h-8 px-3 py-1 text-sm text-red-400 border-red-500 hover:bg-red-900/50">
                                <LogOut className="h-4 w-4 mr-1" /> Logout
                            </Button>
                        </>
                    )}

                    {/* Theme Toggle */}
                    <Button variant="outline" onClick={toggleTheme} className="h-8 w-8 p-0 border-gray-400 dark:border-gray-600 dark:text-white dark:hover:bg-gray-700 bg-transparent hover:bg-white/10">
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </Button>
                </div>

                {/* Mobile Menu Button */}
                <div className="flex md:hidden items-center space-x-2">
                    <Button variant="outline" onClick={toggleTheme} className="h-8 w-8 p-0 border-gray-400 dark:border-gray-600 dark:text-white dark:hover:bg-gray-700 bg-transparent hover:bg-white/10">
                        {theme === 'dark' ? '☀️' : '🌙'}
                    </Button>
                    <Button variant="secondary" onClick={() => setIsOpen(!isOpen)} className="h-8 w-8 p-0 bg-transparent hover:bg-white/10">
                        {isOpen ? <X className="h-5 w-5 text-white" /> : <Menu className="h-5 w-5 text-white" />}
                    </Button>
                </div>
            </div>

            {/* Mobile Menu Panel */}
            {isOpen && (
                <div className="md:hidden bg-black/80 pb-4 transition-all duration-300">
                    {/* City Selector for mobile */}
                    <div className="flex items-center p-4">
                        <MapPin className="h-5 w-5 text-red-500 mr-2" />
                        <select 
                            value={selectedCity} 
                            onChange={handleCityChange}
                            className="w-full bg-gray-800 text-white rounded-lg p-2 focus:ring-red-500"
                        >
                            {CITIES.map(city => (
                                <option key={city} value={city}>
                                    {city}
                                </option>
                            ))}
                        </select>
                    </div>
                    {/* Navigation Items */}
                    {navItems.map(item => (<a key={item.name} href={item.href} onClick={() => setIsOpen(false)} className="block px-4 py-2 text-white hover:bg-red-600/50 transition-colors font-medium">{item.name}</a>))}
                    
                    {/* Auth Buttons for mobile */}
                    <div className="flex flex-col space-y-2 p-4 pt-2 border-t border-gray-700 mt-2">
                        {!isLoggedIn ? (
                            <>
                                <Button onClick={onLogin} variant="secondary" className="w-full bg-white/10 hover:bg-white/20 text-white">
                                    <User className="h-4 w-4 mr-2" /> Login
                                </Button>
                                <Button onClick={onLogin} variant="default" className="w-full text-sm">
                                    Sign Up
                                </Button>
                            </>
                        ) : (
                            <>
                                <Button variant="secondary" className="w-full bg-white/10 hover:bg-white/20 text-white">
                                    <UserCircle className="h-4 w-4 mr-2" /> Profile
                                </Button>
                                <Button onClick={onLogout} variant="outline" className="w-full text-sm text-red-400 border-red-500 hover:bg-red-900/50">
                                    <LogOut className="h-4 w-4 mr-2" /> Logout
                                </Button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </nav>
    );
};

const HeroCarousel = ({ slides, onBook, onTrailerView, onDetailView }) => {
    const [currentIndex, setCurrentIndex] = useState(0);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentIndex((prevIndex) => (prevIndex + 1) % slides.length);
        }, 5000); 
        return () => clearInterval(interval);
    }, [slides.length]);

    const currentMovie = slides[currentIndex];
    const goToSlide = useCallback((index) => setCurrentIndex(index), []);

    if (!currentMovie) return null;

    const primaryGenre = getGenreName(currentMovie.genreIds[0]);

    return (
        <div className="relative h-screen w-full bg-gray-900 dark:bg-black overflow-hidden cursor-pointer" onClick={() => onDetailView(currentMovie.id)}>
            <div 
                className="absolute inset-0 bg-cover bg-center transition-opacity duration-1000" 
                style={{ 
                    backgroundImage: `url(${currentMovie.backdropUrl || BACKDROP_IMAGE_FALLBACK})`, 
                    opacity: 0.7, 
                    filter: 'brightness(0.5)'
                }} 
            />

            <div className="container mx-auto relative z-10 h-full flex flex-col justify-center text-left px-8 md:px-16 pt-24 pb-8">
                <Badge variant="default" className="w-fit mb-3 bg-yellow-500 text-gray-900 border-yellow-500">TMDB Top Rated</Badge>
                <h1 className="text-4xl md:text-7xl font-extrabold text-white mb-3 leading-tight tracking-tight drop-shadow-lg transition-transform duration-700 ease-out translate-y-0 opacity-100">{currentMovie.title}</h1>
                <p className="text-xl text-gray-200 mb-6 max-w-2xl italic drop-shadow-md">{currentMovie.tagline}</p>
                <div className="flex items-center space-x-6 mb-8 text-white">
                    <span className='flex items-center text-lg text-yellow-400 font-semibold'><Star className='h-5 w-5 mr-2 fill-yellow-400' /> {currentMovie.rating.toFixed(1)} Rating</span>
                    <span className='flex items-center text-lg text-red-500 font-semibold'><Drama className='h-5 w-5 mr-2' /> {primaryGenre}</span>
                </div>
                
                <div className='flex space-x-4'>
                    <Button 
                        className="w-fit h-12 px-8 text-lg font-bold shadow-xl hover:shadow-red-500/50 transition-shadow"
                        onClick={(e) => {e.stopPropagation(); onBook(currentMovie.id);}}
                    >
                        <Ticket className='h-5 w-5 mr-2' /> Book Now
                    </Button>
                    <Button 
                        variant="secondary"
                        className="w-fit h-12 px-8 text-lg font-bold shadow-xl bg-black/50 hover:bg-black/80 transition-shadow text-white border-white/20"
                        onClick={(e) => {e.stopPropagation(); onTrailerView(currentMovie.id);}}
                    >
                        <FilmIcon className='h-5 w-5 mr-2' /> View Trailer
                    </Button>
                </div>
            </div>

            <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex space-x-2 z-20">
                {slides.map((_, index) => (
                    <button
                        key={index}
                        onClick={(e) => {e.stopPropagation(); goToSlide(index);}}
                        className={cn('w-3 h-3 rounded-full transition-all duration-300', index === currentIndex ? 'bg-red-600 w-8' : 'bg-white opacity-50 hover:opacity-80')}
                        aria-label={`Go to slide ${index + 1}`}
                    />
                ))}
            </div>
        </div>
    );
};

const MovieCard = ({ movie, onBook, onTrailerView, onDetailView }) => {
    const primaryGenre = getGenreName(movie.genreIds[0]);
    
    return (
        <Card onClick={() => onDetailView(movie.id)} className="overflow-hidden transition-all duration-300 hover:scale-[1.03] hover:shadow-2xl hover:shadow-red-500/30 dark:hover:shadow-red-700/30 animate-in fade-in-0 slide-in-from-bottom-2 cursor-pointer">
            <div className="h-64 bg-cover bg-center">
                <img src={movie.posterUrl || MOVIE_IMAGE_FALLBACK} alt={movie.title} className="w-full h-full object-cover" loading="lazy" />
            </div>

            <CardHeader className="p-3 pb-1">
                <CardTitle className="text-lg font-semibold truncate">{movie.title}</CardTitle>
                <div className="flex items-center space-x-1 text-yellow-500 text-sm">
                    <Star className="h-4 w-4 fill-yellow-500" />
                    <span className="font-bold">{movie.rating.toFixed(1)}</span>
                </div>
            </CardHeader>

            <CardContent className="p-3 pt-0 flex flex-wrap gap-2">
                <Badge variant="outline" className="px-2 py-0.5 text-xs text-red-500 dark:text-red-400 border-red-500 dark:border-red-400">{primaryGenre}</Badge>
                <Badge variant="outline" className="px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">{movie.releaseDate.split('-')[0]}</Badge>
            </CardContent>

            <CardFooter className='p-3 pt-0 flex flex-col space-y-2'>
                <Button className="w-full h-8 text-sm" onClick={(e) => {e.stopPropagation(); onBook(movie.id);}}>
                    <Ticket className='h-4 w-4 mr-2' /> Book Now
                </Button>
                <Button variant="secondary" className="w-full h-8 text-sm" onClick={(e) => {e.stopPropagation(); onTrailerView(movie.id);}}>
                    <FilmIcon className='h-4 w-4 mr-2' /> Trailer
                </Button>
            </CardFooter>
        </Card>
    );
};

const SearchBar = ({ searchTerm, setSearchTerm }) => {
    return (
        <div className="relative w-full max-w-lg mx-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-500 dark:text-gray-400" />
            <Input
                type="search"
                placeholder="Search movies by title..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 bg-gray-100 dark:bg-gray-800 border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white"
            />
        </div>
    );
};

const NowStreamingSection = ({ allMovies, onBook, onTrailerView, onDetailView }) => {
    const allGenres = useMemo(() => {
        const genres = new Set(['All']);
        allMovies.forEach(m => m.genreIds.forEach(id => genres.add(getGenreName(id))));
        return Array.from(genres);
    }, [allMovies]);

    const [searchTerm, setSearchTerm] = useState('');
    const [selectedGenre, setSelectedGenre] = useState('All');
    const [currentPage, setCurrentPage] = useState(1);
    const moviesPerPage = 12;

    const debouncedSearchTerm = useDebounce(searchTerm, 300);

    const filteredMovies = useMemo(() => {
        let filtered = allMovies;
        if (selectedGenre !== 'All') {
            const genreId = Object.keys(GENRE_MAP).find(key => GENRE_MAP[key] === selectedGenre);
            filtered = filtered.filter(m => m.genreIds.includes(parseInt(genreId)));
        }
        if (debouncedSearchTerm) {
            filtered = filtered.filter(m => m.title.toLowerCase().includes(debouncedSearchTerm.toLowerCase()));
        }
        return filtered;
    }, [allMovies, debouncedSearchTerm, selectedGenre]);

    const totalPages = Math.ceil(filteredMovies.length / moviesPerPage);
    const startIndex = (currentPage - 1) * moviesPerPage;
    const paginatedMovies = filteredMovies.slice(startIndex, startIndex + moviesPerPage);

    useEffect(() => { setCurrentPage(1); }, [debouncedSearchTerm, selectedGenre]);

    return (
        <main className="container mx-auto p-4 flex-grow" id="showtimes">
            <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-6 pt-4 border-t border-gray-700/30">Now Streaming (All Movies)</h2>
            <div className="flex flex-col md:flex-row md:justify-between items-center space-y-4 md:space-y-0 mb-8 px-2 animate-in fade-in-0 duration-500">
                <SearchBar searchTerm={searchTerm} setSearchTerm={setSearchTerm} />
                <div className="flex space-x-2 overflow-x-auto py-1">
                    {allGenres.map(genre => (
                        <Badge key={genre} variant={selectedGenre === genre ? "default" : "outline"} onClick={() => setSelectedGenre(genre)}
                            className={cn("cursor-pointer px-4 py-1 text-sm whitespace-nowrap", selectedGenre === genre ? 'bg-red-600 dark:bg-red-500 text-white' : 'border-gray-500 dark:border-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800')}
                        >
                            {genre}
                        </Badge>
                    ))}
                </div>
            </div>
            {paginatedMovies.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-6">
                    {paginatedMovies.map(movie => (
                        <MovieCard key={movie.id} movie={movie} onBook={onBook} onTrailerView={onTrailerView} onDetailView={onDetailView} />
                    ))}
                </div>
            ) : (
                <div className="text-center py-20 text-gray-500 dark:text-gray-400"><h3 className='text-xl font-semibold'>No movies found.</h3><p>Try adjusting your search or genre filter.</p></div>
            )}
            {totalPages > 1 && (
                <div className="mt-10 flex justify-center">
                    <Pagination><PaginationContent><PaginationItem><PaginationPrevious onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))} className={currentPage === 1 ? 'pointer-events-none opacity-50' : ''} /></PaginationItem>
                    <PaginationItem><span className="px-4 text-gray-700 dark:text-gray-300">Page {currentPage} of {totalPages}</span></PaginationItem>
                    <PaginationItem><PaginationNext onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))} className={currentPage === totalPages ? 'pointer-events-none opacity-50' : ''} /></PaginationItem></PaginationContent></Pagination>
                </div>
            )}
        </main>
    );
};


// --- MAIN APP ENTRY POINT ---
export default function HomePage() {
    const [theme, setTheme] = useState('dark');
    // view state: { name: 'list' | 'book' | 'detail', id: movieId, url: null }
    const [view, setView] = useState({ name: 'list', id: null, url: null }); 
    const [movies, setMovies] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isTrailerModalOpen, setIsTrailerModalOpen] = useState(false);
    const [trailerInfo, setTrailerInfo] = useState({ id: null, url: null }); 
    // NEW AUTH STATE: Simulate login status
    const [isLoggedIn, setIsLoggedIn] = useState(false); 

    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
    
    // Auth Handlers (MOCK)
    const handleLogin = () => {
        setIsLoggedIn(true);
        console.log("Logged In (Mock)");
    };
    const handleLogout = () => {
        setIsLoggedIn(false);
        console.log("Logged Out (Mock)");
    };

    // **FIX 1: Global Scrollbar/Margin Reset**
    useEffect(() => {
        document.body.style.margin = '0';
        document.body.style.padding = '0';
        document.documentElement.style.margin = '0';
        document.documentElement.style.padding = '0';
        document.body.style.overflowX = 'hidden'; // Prevents horizontal scrollbars
    }, []);

    // Fetch Movies on load
    useEffect(() => {
        const loadMovies = async () => {
            const fetchedMovies = await fetchMovies();
            setMovies(fetchedMovies);
            setLoading(false);
        };
        loadMovies();
    }, []);

    // Apply theme class and control vertical scrolling
    useEffect(() => {
        const root = document.documentElement;
        root.classList.remove('light', 'dark');
        root.classList.add(theme);
        
        // Lock background scroll when modal/detail/booking is open
        const isScrollingLocked = isTrailerModalOpen || view.name === 'detail' || view.name === 'book';
        document.body.style.overflowY = isScrollingLocked ? 'hidden' : 'auto';
        
        if (view.name === 'list' && !isScrollingLocked) {
             window.scrollTo(0, 0); 
        }
    }, [theme, view.name, isTrailerModalOpen]);
    
    // Split movies for Carousel and List
    const { carouselMovies, listMovies, currentMovie } = useMemo(() => {
        const sortedMovies = [...movies].sort((a, b) => b.rating - a.rating);
        
        // Filter out movies without a valid backdrop URL for the carousel
        const filterCarousels = sortedMovies.filter(m => m.backdropUrl && !m.backdropUrl.includes('Placeholder'));
        
        const carousel = filterCarousels.slice(0, 8);
        const list = sortedMovies.slice(carousel.length);
        
        // Find the movie object based on the current active ID (either view.id or trailerInfo.id)
        const movieId = isTrailerModalOpen ? trailerInfo.id : view.id;
        const currentMv = movies.find(m => m.id === movieId);
        
        return { carouselMovies: carousel, listMovies: list, currentMovie: currentMv };
    }, [movies, view.id, isTrailerModalOpen, trailerInfo.id]);


    // --- Navigation Handlers ---
    const handleBookClick = (movieId) => {
        setView({ name: 'book', id: movieId, url: null });
    };

    const handleDetailView = (movieId) => {
        setView({ name: 'detail', id: movieId, url: null });
    };
    
    const handleBack = () => {
        setView({ name: 'list', id: null, url: null });
    };
    
    // **Trailer Modal Logic**
    const handleTrailerView = async (movieId) => {
        setLoading(true);
        const url = await fetchTrailerKey(movieId);
        setLoading(false);
        
        if (url) {
            setTrailerInfo({ id: movieId, url: url });
            setIsTrailerModalOpen(true);
        } else {
            alert("Trailer not found for this movie.");
        }
    };
    
    const closeTrailerModal = () => {
        setIsTrailerModalOpen(false);
        setTrailerInfo({ id: null, url: null }); // Clear trailer info on close
    };
    // ---------------------------


    const renderMainContent = () => {
        if (loading) {
            return (
                <div className="flex-grow flex items-center justify-center min-h-screen text-xl text-gray-500 dark:text-gray-300">
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    Loading movies...
                </div>
            );
        }

        switch (view.name) {
            case 'book':
            // 🚨 CHANGE THIS LINE: Replace MockBookingPage with the imported BookingPage
            return currentMovie ? (
                <BookingPage movie={currentMovie} onBack={handleBack} />
            ) : (
                <div className="p-10 text-center">Movie data not available for booking.</div>
            );
            
        case 'detail':
                return currentMovie ? <MovieDetailView movie={currentMovie} onBack={handleBack} onBook={handleBookClick} onTrailerView={handleTrailerView} /> : 
                    <div className="p-10 text-center">Movie data not available for details.</div>;
            case 'list':
            default:
                return (
                    <div className="flex flex-col w-full">
                        <HeroCarousel 
                            slides={carouselMovies} 
                            onBook={handleBookClick} 
                            onTrailerView={handleTrailerView} 
                            onDetailView={handleDetailView} 
                        />
                        <NowStreamingSection 
                            allMovies={listMovies} 
                            onBook={handleBookClick} 
                            onTrailerView={handleTrailerView} 
                            onDetailView={handleDetailView} 
                        />
                        <FeedbackSection topMovies={carouselMovies} />
                        <AppFooter />
                    </div>
                );
        }
    };

    return (
        <div className="min-h-screen flex flex-col w-full bg-white dark:bg-gray-950 transition-colors duration-500 overflow-x-hidden" id="home">
            <NavBar 
                toggleTheme={toggleTheme} 
                theme={theme} 
                isLoggedIn={isLoggedIn}
                onLogin={handleLogin}
                onLogout={handleLogout}
            />
            
            {renderMainContent()}
            
            {/* Trailer Modal renders only when explicitly told, using trailerInfo state */}
            {isTrailerModalOpen && trailerInfo.url && currentMovie && (
                <TrailerModal 
                    movie={currentMovie} 
                    trailerUrl={trailerInfo.url} 
                    onClose={closeTrailerModal} 
                />
            )}
        </div>
    );
}
