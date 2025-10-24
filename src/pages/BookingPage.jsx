import React, { useState, useCallback, useMemo } from 'react';
import { ChevronLeft, Ticket, User, Mail, Star, Drama, Clock, X } from 'lucide-react';

// --- Configuration & Mock Data ---
const MOVIE_PRICE_PER_SEAT = 250;
const SEATS_PER_ROW = 10;
const ROWS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

// Initial seat matrix generator
const generateInitialSeats = () => {
    const seatArray = ROWS.flatMap(row =>
        Array.from({ length: SEATS_PER_ROW }, (_, i) => {
            const id = `${row}${i + 1}`;
            let status = 'available';
            // Simulate occupied and locked seats randomly
            if (Math.random() < 0.15) status = 'occupied';
            else if (Math.random() < 0.05) status = 'locked';
            
            return { id, row, number: i + 1, status };
        })
    );
    return seatArray;
};

// --- Component Shim Definitions (Same as HomePage) ---
const cn = (...classes) => classes.filter(Boolean).join(' ');
const Card = ({ className, children, onClick }) => (<div onClick={onClick} className={"rounded-xl border shadow-lg transition-colors bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 " + className}>{children}</div>);
const CardHeader = ({ className, children }) => (<div className={"flex flex-col space-y-1.5 p-6 " + className}>{children}</div>);
const CardTitle = ({ className, children }) => (<h3 className={"text-xl font-semibold leading-none tracking-tight text-gray-900 dark:text-white " + className}>{children}</h3>);
const CardContent = ({ className, children }) => (<div className={"p-6 pt-0 " + className}>{children}</div>);
const CardFooter = ({ className, children }) => (<div className={"flex items-center p-6 pt-0 " + className}>{children}</div>);
const Button = ({ variant = 'default', className, onClick, disabled, children, type = 'button' }) => {
    let baseStyles = 'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none h-10 px-4 py-2';
    let variantStyles = variant === 'default' ? 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 focus-visible:ring-red-500' : (variant === 'secondary' ? 'bg-gray-700 text-white hover:bg-gray-600 dark:bg-gray-600 dark:hover:bg-gray-700 focus-visible:ring-gray-500' : 'border border-gray-300 bg-transparent text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-700 focus-visible:ring-gray-500');
    return (<button type={type} className={cn(baseStyles, variantStyles, className)} onClick={onClick} disabled={disabled}>{children}</button>);
};
const Input = (props) => (<input {...props} className={"flex h-10 w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 " + props.className} />);
const Label = ({ className, children, ...props }) => (<label className={cn("text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 text-gray-900 dark:text-gray-100", className)} {...props}>{children}</label>);


// --- Seat Component ---
const Seat = ({ id, status, onClick }) => {
    const handleClick = () => {
        if (status !== 'occupied' && status !== 'locked') {
            onClick(id);
        }
    };

    const baseClasses = 'w-8 h-8 md:w-10 md:h-10 rounded-t-lg flex items-center justify-center text-xs font-bold text-white transition-all duration-150 m-1 shadow-md';
    let statusClasses = '';

    switch (status) {
        case 'available':
            statusClasses = 'bg-green-600 hover:bg-green-700 cursor-pointer';
            break;
        case 'occupied':
            statusClasses = 'bg-gray-600 cursor-not-allowed opacity-50';
            break;
        case 'locked': 
            statusClasses = 'bg-yellow-600 cursor-not-allowed opacity-70';
            break;
        case 'selected':
            statusClasses = 'bg-red-600 hover:bg-red-700 cursor-pointer border-2 border-yellow-400 scale-105';
            break;
    }

    return (
        <div
            className={cn(baseClasses, statusClasses)}
            onClick={handleClick}
            title={`Seat ${id} - ${status}`}
        >
            {id.slice(1)} 
        </div>
    );
};

// --- Booking Form Component ---
const BookingForm = ({ selectedSeats, totalPrice, onBookingSubmit, movie }) => {
    const [name, setName] = useState('');
    const [email, setEmail] = useState('');
    const [error, setError] = useState('');

    const handleSubmit = (e) => {
        e.preventDefault();
        setError('');

        if (selectedSeats.length === 0) {
            setError("Please select at least one seat.");
            return;
        }

        if (!name.trim() || !email.includes('@') || email.trim().length < 5) {
            setError("Please provide a valid name and email address.");
            return;
        }

        onBookingSubmit({ name, email, selectedSeats, totalPrice, movieTitle: movie.title });
    };

    return (
        <Card className="animate-in fade-in-0 slide-in-from-right-4 duration-700 sticky top-4">
            <CardHeader>
                <CardTitle className="text-2xl text-red-600 dark:text-red-500">Confirm Booking</CardTitle>
            </CardHeader>
            <form onSubmit={handleSubmit}>
                <CardContent className="space-y-4">
                    {error && (
                        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative text-sm dark:bg-red-900 dark:text-red-300">
                            {error}
                        </div>
                    )}
                    <div className="space-y-2">
                        <Label htmlFor="name"><User className='h-4 w-4 inline mr-1 text-gray-500' /> Full Name</Label>
                        <Input id="name" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="email"><Mail className='h-4 w-4 inline mr-1 text-gray-500' /> Email Address</Label>
                        <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
                    </div>
                    
                    {/* Summary */}
                    <div className="mt-6 p-4 bg-gray-100 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600 space-y-2">
                        <p className="font-semibold text-lg text-gray-900 dark:text-white">Movie: <span className="text-red-600 dark:text-red-500">{movie.title}</span></p>
                        <p className="font-semibold text-gray-800 dark:text-gray-200">Seats ({selectedSeats.length}): <span className="text-yellow-600 dark:text-yellow-400">{selectedSeats.join(', ') || 'None Selected'}</span></p>
                        <p className="font-extrabold text-2xl text-gray-900 dark:text-white pt-2 border-t border-gray-300 dark:border-gray-600">Total: <span className="text-red-600 dark:text-red-500">₹{totalPrice.toFixed(2)}</span></p>
                    </div>

                </CardContent>
                <CardFooter>
                    <Button type="submit" className="w-full h-12 text-lg" disabled={selectedSeats.length === 0}>
                        Complete Purchase
                    </Button>
                </CardFooter>
            </form>
        </Card>
    );
};


// --- Main Booking Page Component ---
export default function BookingPage({ movie, onBack }) {
    const [seatMap, setSeatMap] = useState(generateInitialSeats);
    const [selectedSeats, setSelectedSeats] = useState([]);
    const [loading, setLoading] = useState(false); 
    const [isLockingEnabled, setIsLockingEnabled] = useState(true);

    const handleSeatClick = useCallback((seatId) => {
        setSelectedSeats(prev => {
            const seatIndex = prev.indexOf(seatId);
            if (seatIndex > -1) {
                return prev.filter(id => id !== seatId); 
            } else {
                return [...prev, seatId]; 
            }
        });
    }, []);

    const getSeatStatus = useCallback((seat) => {
        if (selectedSeats.includes(seat.id)) {
            return 'selected';
        }
        // Simulate seat locking for demo (users often see seats locked by others temporarily)
        if (isLockingEnabled && seat.id.includes('E') && seat.number % 3 === 0 && seat.status === 'available') {
             return 'locked';
        }
        return seat.status;
    }, [selectedSeats, isLockingEnabled]);

    const handleBookingSubmit = (formData) => {
        setLoading(true);
        console.log('Final Booking Payload (Mocked Submission):', formData);

        setTimeout(() => {
            setLoading(false);
            alert(`✅ Booking Successful for ${formData.movieTitle}! Seats: ${formData.selectedSeats.join(', ')}`);
            onBack(); 
        }, 1500);
    };

    const totalPrice = selectedSeats.length * MOVIE_PRICE_PER_SEAT;
    const primaryGenre = movie.genreIds && movie.genreIds.length > 0 ? movie.genreIds.map(id => movie.genreMap[id] || 'Unknown').join(', ') : 'Unknown';


    const seatsByRow = useMemo(() => {
        return seatMap.reduce((acc, seat) => {
            const row = seat.id[0];
            if (!acc[row]) acc[row] = [];
            acc[row].push(seat);
            return acc;
        }, {});
    }, [seatMap]);

    if (!movie) {
        // Render fallback if movie data is missing
        return (
            <div className="flex flex-col items-center justify-center min-h-screen pt-24 bg-gray-50 dark:bg-gray-900">
                <p className="text-xl text-red-500">Error: Movie details not found.</p>
                <Button onClick={onBack} className="mt-4">Return Home</Button>
            </div>
        );
    }


    return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-950 pt-20">
            <main className="container mx-auto p-4 flex-grow grid grid-cols-1 lg:grid-cols-3 gap-8">
                
                {/* Left Column: Movie Info and Seat Selection */}
                <div className="lg:col-span-2 space-y-6 animate-in fade-in-0 slide-in-from-left-4 duration-700">
                    
                    {/* Movie Info Header */}
                    <Card>
                        <CardContent className='flex items-center space-x-6 pt-6'>
                            <img src={movie.posterUrl} alt={movie.title} className='w-20 h-30 rounded-lg object-cover shadow-md' />
                            <div>
                                <h1 className="text-3xl font-bold text-red-600 dark:text-red-500 mb-1">{movie.title}</h1>
                                <p className='text-gray-500 dark:text-gray-400 font-medium italic'>{movie.tagline}</p>
                                <div className='flex space-x-4 text-sm mt-2 text-gray-700 dark:text-gray-300'>
                                    <span className='flex items-center'><Clock className='h-4 w-4 mr-1 text-red-500' /> {movie.runtime}</span>
                                    <span className='flex items-center'><Drama className='h-4 w-4 mr-1 text-red-500' /> {primaryGenre}</span>
                                    <span className='flex items-center text-yellow-500'><Star className='h-4 w-4 mr-1 fill-yellow-500' /> {movie.rating.toFixed(1)}</span>
                                </div>
                            </div>
                            <Button variant="secondary" onClick={onBack} className="self-start ml-auto">
                                <ChevronLeft className="h-4 w-4 mr-1" /> Change Movie
                            </Button>
                        </CardContent>
                    </Card>

                    {/* Seat Grid Area */}
                    <Card className="p-6">
                        <CardHeader className='p-0 mb-4'>
                            <CardTitle className='text-center text-2xl text-yellow-600 dark:text-yellow-400'>Screen This Way</CardTitle>
                        </CardHeader>
                        <CardContent className='p-0'>
                            {/* Screen Visual */}
                            <div className="w-full h-3 bg-red-600 dark:bg-red-700 rounded-lg mb-8 shadow-inner" /> 
                            
                            {/* Seat Map */}
                            <div className="space-y-1 overflow-x-auto p-2">
                                <div className="flex flex-col items-center min-w-[500px]">
                                    {Object.entries(seatsByRow).map(([row, seats]) => (
                                        <div key={row} className="flex justify-center items-center">
                                            <div className="w-8 text-center font-bold mr-2 text-gray-500 dark:text-gray-400">{row}</div>
                                            <div className="flex justify-center">
                                                {seats.map(seat => (
                                                    <Seat 
                                                        key={seat.id} 
                                                        id={seat.id} 
                                                        status={getSeatStatus(seat)} 
                                                        onClick={handleSeatClick} 
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                    
                    {/* Seat Legend and Availability Toggle */}
                    <Card className='p-4'>
                        <div className="flex flex-wrap justify-around items-center space-y-2 md:space-y-0 text-sm text-gray-800 dark:text-gray-200">
                            <div className="flex items-center space-x-2"><div className="w-4 h-4 rounded bg-green-600"></div><span>Available</span></div>
                            <div className="flex items-center space-x-2"><div className="w-4 h-4 rounded bg-red-600 border-2 border-yellow-400"></div><span>Selected</span></div>
                            <div className="flex items-center space-x-2"><div className="w-4 h-4 rounded bg-yellow-600"></div><span>Locked</span></div>
                            <div className="flex items-center space-x-2"><div className="w-4 h-4 rounded bg-gray-600"></div><span>Occupied</span></div>
                            
                            {/* Bonus Feature: Seat Availability Toggle */}
                            <div className="flex items-center space-x-2 bg-gray-100 dark:bg-gray-700 p-2 rounded-lg">
                                <Label htmlFor="lock-toggle" className='text-xs sm:text-sm font-medium'>
                                    Simulate Seat Locking
                                </Label>
                                <input
                                    id="lock-toggle"
                                    type="checkbox"
                                    checked={isLockingEnabled}
                                    onChange={() => setIsLockingEnabled(prev => !prev)}
                                    className="h-4 w-4 text-red-600 border-gray-300 rounded focus:ring-red-500 dark:bg-gray-600 dark:border-gray-500"
                                />
                            </div>
                        </div>
                    </Card>

                </div>

                {/* Right Column: Booking Form */}
                <div className="lg:col-span-1">
                    <BookingForm 
                        selectedSeats={selectedSeats}
                        totalPrice={totalPrice}
                        onBookingSubmit={handleBookingSubmit}
                        movie={movie}
                    />
                </div>
                
                {/* Loading Overlay */}
                {loading && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="text-white text-xl flex items-center">
                            <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                            </svg>
                            Processing Booking...
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
}
