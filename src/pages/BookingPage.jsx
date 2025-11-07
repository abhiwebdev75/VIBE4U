import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, Calendar, Clock, Ticket, MapPin, X, Film, CheckCircle, Info, Star, LogOut, Sparkles, Users, CreditCard, Lock, User, Shield } from 'lucide-react';

// --- Local Constants ---
const SEAT_PRICES = {
    PLATINUM: 320,
    GOLD: 280,
    SILVER: 220
};
const BOOKING_FEE = 50;

const GENRE_MAP = { 28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller', 18: 'Drama' };
const getGenreName = (genreId) => GENRE_MAP[genreId] || 'Unknown';
const cn = (...classes) => classes.filter(Boolean).join(' ');

// --- Razorpay Configuration ---
const RAZORPAY_CONFIG = {
    key: 'rzp_test_Ra0ombpntMm0Au', // Test key from your Razorpay page
    currency: 'INR',
    name: 'MovieBox Cinemas',
    description: 'Movie Ticket Booking',
    theme: {
        color: '#EF4444'
    }
};
const REDIRECT_URL = 'https://rzp.io/rzp/MpryHgM'; // The requested redirection URL

// --- UI Components (Simplified/Kept) ---
const Card = ({ className, children, onClick, hover = false }) => (
    <div 
        onClick={onClick} 
        className={cn(
            "rounded-2xl border bg-white/80 dark:bg-gray-800/80 backdrop-blur-md border-gray-200/50 dark:border-gray-700/50 shadow-sm transition-all duration-300",
            hover && "hover:shadow-xl hover:scale-[1.01] hover:border-gray-300 dark:hover:border-gray-600",
            className
        )}
    >
        {children}
    </div>
);

const CardHeader = ({ className, children }) => (
    <div className={cn("flex flex-col space-y-1.5 p-6", className)}>{children}</div>
);

const CardTitle = ({ className, children }) => (
    <h3 className={cn("text-2xl font-bold leading-none tracking-tight text-gray-900 dark:text-white", className)}>{children}</h3>
);

const CardContent = ({ className, children }) => (
    <div className={cn("p-6 pt-0", className)}>{children}</div>
);

const Button = ({ variant = 'default', className, onClick, disabled, children, type = 'button', pulse = false }) => {
    let baseStyles = 'inline-flex items-center justify-center rounded-xl text-sm font-bold transition-all duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none h-12 px-6 py-3';
    let variantStyles = variant === 'default' 
        ? 'bg-gradient-to-r from-red-500 to-red-600 text-white hover:from-red-600 hover:to-red-700 shadow-lg hover:shadow-xl focus-visible:ring-red-500 transform hover:scale-105' 
        : 'border border-gray-300/50 bg-white/50 dark:bg-gray-800/50 text-gray-900 hover:bg-gray-100/80 dark:text-gray-100 dark:border-gray-600/50 dark:hover:bg-gray-700/80 focus-visible:ring-gray-500 hover:scale-105';
    
    return (
        <button 
            type={type} 
            className={cn(baseStyles, variantStyles, pulse && "animate-pulse", className)} 
            onClick={onClick} 
            disabled={disabled}
        >
            {children}
        </button>
    );
};

const Badge = ({ variant = 'default', className, children, onClick, active = false }) => {
    let variantStyles = active 
        ? 'bg-gradient-to-r from-red-500 to-red-600 text-white shadow-lg transform scale-105' 
        : 'border border-gray-300/50 bg-white/50 dark:bg-gray-800/50 text-gray-800 dark:text-gray-200 dark:border-gray-600/50 hover:bg-gray-100/80 dark:hover:bg-gray-700/80';
    
    return (
        <div 
            onClick={onClick} 
            className={cn(
                'inline-flex items-center rounded-xl border px-4 py-3 text-sm font-semibold transition-all duration-300 cursor-pointer hover:scale-105',
                variantStyles,
                className
            )}
        >
            {children}
        </div>
    );
};

// --- Razorpay Payment Modal Component (Updated to Redirect) ---
const PaymentModal = ({ bookingDetails, movie, user, onClose, redirectUrl, onMockSuccess }) => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [paymentError, setPaymentError] = useState(null);

    const handleRedirect = () => {
        setIsProcessing(true);
        // Perform the hard redirect as requested
        window.location.href = redirectUrl;
    };
    
    // Function to simulate success for demonstration purposes in this environment
    const handleMockPaymentSuccess = () => {
        setIsProcessing(true);
        setTimeout(() => {
            setIsProcessing(false);
            onMockSuccess({ razorpay_payment_id: `mock_pay_${Math.random().toString(36).substring(2, 12)}` });
        }, 1500);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md transition-all duration-300 animate-in fade-in">
            <Card className="max-w-md w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-500 scale-100" onClick={(e) => e.stopPropagation()}>
                <CardHeader className="flex flex-row items-center justify-between p-6 bg-gradient-to-r from-blue-500 to-blue-600 rounded-t-2xl">
                    <CardTitle className="text-xl text-white flex items-center">
                        <CreditCard className='h-6 w-6 mr-2' />
                        Secure Payment
                    </CardTitle>
                    <Button variant="secondary" onClick={onClose} className="h-8 w-8 p-0 rounded-full bg-white/20 hover:bg-white/30 text-white border-0">
                        <X className="h-4 w-4" />
                    </Button>
                </CardHeader>
                
                <CardContent className="p-6 space-y-6">
                    {paymentError && (
                        <div className="bg-red-100 dark:bg-red-900/50 p-4 rounded-xl border border-red-400 flex items-start text-red-700 dark:text-red-300">
                            <Info className="h-5 w-5 mr-3 flex-shrink-0 mt-0.5" />
                            <p className="text-sm font-medium">{paymentError}</p>
                        </div>
                    )}
                    
                    <div className='bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 p-5 rounded-xl space-y-3 border border-blue-200/50 dark:border-blue-700/50'>
                        <h3 className='text-lg font-bold text-blue-700 dark:text-blue-400 flex items-center'>
                            <Ticket className="h-5 w-5 mr-2" /> PAYMENT SUMMARY
                        </h3>
                        <div className="space-y-2">
                            <div className='flex justify-between font-bold text-lg text-red-600 dark:text-red-400 pt-2 border-t border-gray-300 dark:border-gray-700'>
                                <span>TOTAL AMOUNT</span>
                                <span>₹{bookingDetails.totalAmount}</span>
                            </div>
                        </div>
                    </div>
                    
                    {/* Primary Action: REDIRECT TO RAZORPAY */}
                    <Button 
                        onClick={handleRedirect}
                        disabled={isProcessing}
                        className="w-full text-lg bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800 shadow-lg mt-4"
                    >
                        {isProcessing ? (
                            <div className="flex items-center">
                                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin mr-2"></div>
                                Redirecting to Razorpay...
                            </div>
                        ) : (
                            <>
                                <CreditCard className="h-5 w-5 mr-2" />
                                Pay ₹{bookingDetails.totalAmount} via Razorpay
                            </>
                        )}
                    </Button>
                    
                    {/* Secondary Action: MOCK SUCCESS for testing ConfirmationModal */}
                    <button
                        onClick={handleMockPaymentSuccess}
                        disabled={isProcessing}
                        className='w-full text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 font-medium transition-colors duration-200 p-2'
                    >
                        (Demo: Click here to Mock Successful Payment)
                    </button>

                    <p className="text-xs text-center text-gray-500 dark:text-gray-400">
                        By proceeding, you agree to our Terms of Service and Privacy Policy
                    </p>
                </CardContent>
            </Card>
        </div>
    );
};

// --- Confirmation Modal (remains the same) ---
const ConfirmationModal = ({ movie, bookingDetails, paymentDetails, onClose, onBackToMain }) => {
    const { date, time, seats, totalAmount } = bookingDetails;
    const formattedDate = new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md transition-all duration-300 animate-in fade-in" onClick={onClose}>
            <Card className="max-w-md w-full mx-4 shadow-2xl animate-in zoom-in-95 duration-500 scale-100" onClick={(e) => e.stopPropagation()}>
                <CardHeader className="flex flex-row items-center justify-between p-6 bg-gradient-to-r from-green-500 to-emerald-600 rounded-t-2xl">
                    <CardTitle className="text-xl text-white flex items-center animate-pulse">
                        <Sparkles className='h-6 w-6 mr-2' /> Booking Confirmed!
                    </CardTitle>
                    <Button variant="secondary" onClick={onClose} className="h-8 w-8 p-0 rounded-full bg-white/20 hover:bg-white/30 text-white border-0">
                        <X className="h-4 w-4" />
                    </Button>
                </CardHeader>
                
                <CardContent className="p-6 space-y-6">
                    <div className="text-center space-y-2">
                        <div className="w-16 h-16 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center mx-auto mb-4">
                            <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
                        </div>
                        <p className='text-lg font-semibold text-gray-700 dark:text-gray-200'>
                            Your E-Ticket for <span className="text-green-600 dark:text-green-400 font-bold">{movie.title}</span> is ready!
                        </p>
                    </div>

                    {paymentDetails && (
                        <div className='bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 p-4 rounded-xl border border-blue-200/50 dark:border-blue-700/50'>
                            <p className="text-sm text-blue-700 dark:text-blue-300 font-medium text-center">
                                Payment ID: {paymentDetails.razorpay_payment_id}
                            </p>
                        </div>
                    )}
                    
                    <div className='bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 p-5 rounded-xl space-y-3 border border-green-200/50 dark:border-green-700/50'>
                        <h3 className='text-lg font-bold text-green-700 dark:text-green-400 flex items-center'>
                            <Ticket className="h-5 w-5 mr-2" />
                            BOOKING DETAILS
                        </h3>
                        
                        <div className="space-y-2">
                            <div className='flex justify-between text-sm'>
                                <span className="text-gray-600 dark:text-gray-400">Showtime</span>
                                <span className="font-semibold">{time} on {formattedDate}</span>
                            </div>
                            <div className='flex justify-between text-sm'>
                                <span className="text-gray-600 dark:text-gray-400">Seats</span>
                                <span className="font-semibold">{seats}</span>
                            </div>
                            <div className='flex justify-between font-bold text-lg text-red-600 dark:text-red-400 pt-2 border-t border-gray-300 dark:border-gray-700'>
                                <span>AMOUNT PAID</span>
                                <span>₹{totalAmount}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-700/50 rounded-xl p-4">
                        <p className="text-sm text-yellow-800 dark:text-yellow-200 text-center">
                            📧 E-ticket and invoice sent to your email
                        </p>
                    </div>

                    <Button 
                        onClick={onBackToMain} 
                        className="w-full text-lg bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg mt-4"
                    >
                        <LogOut className="h-5 w-5 mr-2" /> 
                        Finish & Return Home
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};

// --- SeatMap Component (Functional) ---
const SeatMap = ({ seats, selectedSeats, onToggleSeat, isLoading }) => {
    const rows = useMemo(() => {
        return seats.reduce((acc, seat) => {
            acc[seat.row] = acc[seat.row] || [];
            acc[seat.row].push(seat);
            return acc;
        }, {});
    }, [seats]);

    const legend = [
        { label: 'Platinum', color: 'bg-yellow-500', price: SEAT_PRICES.PLATINUM },
        { label: 'Gold', color: 'bg-amber-500', price: SEAT_PRICES.GOLD },
        { label: 'Silver', color: 'bg-gray-500', price: SEAT_PRICES.SILVER },
        { label: 'Selected', color: 'bg-red-500', price: null },
        { label: 'Occupied', color: 'bg-gray-700', price: null },
    ];
    
    const getSeatClass = (seat) => {
        if (seat.isOccupied) return 'bg-gray-700 cursor-not-allowed';
        if (selectedSeats.includes(seat.id)) return 'bg-red-500 border-red-700 scale-110';

        switch (seat.category) {
            case 'PLATINUM': return 'bg-yellow-500 border-yellow-700 hover:bg-yellow-400';
            case 'GOLD': return 'bg-amber-500 border-amber-700 hover:bg-amber-400';
            case 'SILVER': 
            default: return 'bg-gray-500 border-gray-700 hover:bg-gray-400';
        }
    };

    return (
        <div className="space-y-8 flex flex-col items-center">
            {/* Screen Indicator */}
            <div className="w-full max-w-4xl h-4 bg-gray-900 rounded-b-xl shadow-inner text-center text-xs text-white pt-1">
                SCREEN THIS WAY
            </div>
            
            <div className='flex flex-col space-y-1.5'>
                {/* Render Rows */}
                {Object.keys(rows).map(rowId => (
                    <div key={rowId} className="flex items-center space-x-1.5">
                        <div className="w-5 text-center text-sm font-bold text-gray-700 dark:text-gray-300 mr-2">{rowId}</div>
                        {rows[rowId].map(seat => (
                            <div
                                key={seat.id}
                                onClick={() => onToggleSeat(seat.id)}
                                title={`${seat.id} - ${seat.category} (₹${seat.price})`}
                                className={cn(
                                    'w-6 h-6 rounded-t-lg transition-all duration-150 transform cursor-pointer',
                                    'border-b-4',
                                    isLoading && 'opacity-50',
                                    getSeatClass(seat)
                                )}
                            />
                        ))}
                    </div>
                ))}
            </div>

            {/* Seat Map Legend */}
            <div className='w-full max-w-4xl pt-8 border-t border-gray-200/50 dark:border-gray-700/50'>
                <h4 className='text-center text-sm font-semibold text-gray-700 dark:text-gray-300 mb-4'>Seat Price & Status Legend</h4>
                <div className='flex flex-wrap justify-center gap-4 text-xs font-medium'>
                    {legend.map((item, index) => (
                        <div key={index} className='flex items-center space-x-2 text-gray-700 dark:text-gray-300'>
                            <div className={cn('w-4 h-4 rounded-full', item.color)}></div>
                            <span>{item.label}</span>
                            {item.price && <span className='font-bold text-red-500'>(₹{item.price})</span>}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// --- Enhanced Main Booking Page Component ---
const BookingPage = ({ movie, onBack }) => {
    const initialSeatStructure = useMemo(() => generateEmptySeatMap(), []);
    const futureDates = useMemo(() => getFutureDates(7), []);

    const [seats] = useState(initialSeatStructure);
    const [isLoading] = useState(false);
    const [selectedDate, setSelectedDate] = useState(futureDates[0].fullDate);
    const [selectedTime, setSelectedTime] = useState(movie.showtimes[0]);
    const [selectedSeats, setSelectedSeats] = useState([]);
    const [view, setView] = useState('selection');
    
    // AUTHENTICATION ASSUMED: Initialize mock user data
    const [currentUser] = useState({
        name: 'Jane Doe',
        email: 'jane.doe@example.com',
        phone: '+919876543210'
    });
    
    // PAYMENT STATE
    const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
    const [isConfirmedModalOpen, setIsConfirmedModalOpen] = useState(false);
    const [paymentDetails, setPaymentDetails] = useState(null); // Used to show payment ID in confirmation

    useEffect(() => {
        document.body.style.overflowY = 'auto';
        return () => {
            document.body.style.overflowY = '';
        };
    }, []);

    useEffect(() => {
        setSelectedSeats([]);
    }, [selectedDate, selectedTime]);

    // Compute costs
    const getSeatData = (seatId) => seats.find(s => s.id === seatId);
    const getSeatCategory = (seatId) => getSeatData(seatId)?.category;
    
    const platinumSeats = selectedSeats.filter(id => getSeatCategory(id) === 'PLATINUM');
    const goldSeats = selectedSeats.filter(id => getSeatCategory(id) === 'GOLD');
    const silverSeats = selectedSeats.filter(id => getSeatCategory(id) === 'SILVER');

    const platinumTotal = platinumSeats.length * SEAT_PRICES.PLATINUM;
    const goldTotal = goldSeats.length * SEAT_PRICES.GOLD;
    const silverTotal = silverSeats.length * SEAT_PRICES.SILVER;
    
    const subtotal = platinumTotal + goldTotal + silverTotal;
    const bookingFee = selectedSeats.length > 0 ? BOOKING_FEE : 0;
    const totalAmount = subtotal + bookingFee;
    
    const bookingDetails = useMemo(() => ({
        date: futureDates.find(d => d.fullDate === selectedDate)?.fullDate,
        time: selectedTime,
        seats: selectedSeats.join(', '),
        totalAmount,
        platinumSeats,
        goldSeats,
        silverSeats,
        platinumTotal,
        goldTotal,
        silverTotal,
        subtotal
    }), [selectedDate, selectedTime, selectedSeats, totalAmount, platinumSeats, goldSeats, silverSeats, platinumTotal, goldTotal, silverTotal, subtotal, futureDates]);
    
    if (!movie) {
        // ... (Error handling for missing movie)
        return null; 
    }
    
    const onToggleSeat = (seatId) => {
        const seat = getSeatData(seatId);
        if (!seat || seat.isOccupied) return;

        if (selectedSeats.includes(seatId)) {
            setSelectedSeats(selectedSeats.filter(id => id !== seatId));
        } else if (selectedSeats.length < 10) {
            setSelectedSeats([...selectedSeats, seatId]);
        }
    };

    const handlePaymentInitiation = () => {
        // Since login is assumed to be done, we proceed directly to payment modal
        setIsPaymentModalOpen(true);
    };

    const handlePaymentSuccess = (paymentResponse) => {
        setPaymentDetails(paymentResponse);
        setIsPaymentModalOpen(false);
        setIsConfirmedModalOpen(true);
    };

    const handleModalClose = () => {
        setIsConfirmedModalOpen(false);
        onBack();
    };

    const renderHeader = () => (
        <div className="mb-8 border-b border-gray-200/50 dark:border-gray-700/50 pb-6">
            <Button variant="secondary" onClick={onBack} className="mb-4 hover:scale-105">
                <ChevronLeft className="h-4 w-4 mr-2" /> Back to Movie Details
            </Button>
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                    <div className="w-16 h-16 bg-gradient-to-br from-red-500 to-red-600 rounded-2xl flex items-center justify-center shadow-lg">
                        <Film className='h-8 w-8 text-white' />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent">
                            Booking: {movie.title}
                        </h1>
                        <p className="text-gray-600 dark:text-gray-400 mt-2 flex items-center space-x-3">
                            <Badge className="bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300 border-0">
                                {getGenreName(movie.genreIds[0])}
                            </Badge>
                            <span>•</span>
                            <span>{movie.runtime}</span>
                            <span>•</span>
                            <span className="flex items-center">
                                {movie.rating.toFixed(1)} <Star className='h-4 w-4 fill-yellow-500 text-yellow-500 ml-1' />
                            </span>
                        </p>
                    </div>
                </div>
                {/* User is always present */}
                <div className="flex items-center space-x-3 bg-green-50 dark:bg-green-900/30 px-4 py-2 rounded-xl border border-green-200/50 dark:border-green-700/50">
                    <User className="h-4 w-4 text-green-600 dark:text-green-400" />
                    <span className="text-sm font-medium text-green-700 dark:text-green-300">
                        {currentUser.name}
                    </span>
                </div>
            </div>
        </div>
    );

    const renderSelectionView = () => (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column (Selection/Summary) */}
            <div className="lg:col-span-1 space-y-6">
                {/* Date Selection Card, Time Selection Card, Booking Summary Card (JSX removed for brevity) */}
                {/* ... (Date/Time/Summary Cards remain here) */}

                {/* Date Selection Card (Example kept for rendering) */}
                <Card hover={true}>
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center text-gray-800 dark:text-white">
                            <Calendar className='h-5 w-5 mr-2 text-red-500' /> Select Date
                        </CardTitle>
                    </CardHeader>
                    <CardContent className='flex space-x-3 overflow-x-auto pb-6 scrollbar-thin'>
                        {futureDates.map(d => (
                            <div 
                                key={d.fullDate} 
                                onClick={() => setSelectedDate(d.fullDate)}
                                className={cn(
                                    'flex flex-col items-center justify-center p-4 w-20 h-20 rounded-xl cursor-pointer transition-all duration-300 flex-shrink-0 border-2 shadow-sm',
                                    selectedDate === d.fullDate 
                                        ? 'bg-gradient-to-br from-red-500 to-red-600 border-red-600 text-white shadow-lg scale-105' 
                                        : 'bg-white/50 dark:bg-gray-700/50 border-gray-300/50 dark:border-gray-600/50 hover:bg-gray-100/80 dark:hover:bg-gray-600/80 hover:scale-105'
                                )}
                            >
                                <span className='text-sm font-semibold'>{d.day}</span>
                                <span className='text-2xl font-black'>{d.date}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* Time Selection Card */}
                <Card hover={true}>
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center text-gray-800 dark:text-white">
                            <Clock className='h-5 w-5 mr-2 text-red-500' /> Select Showtime
                        </CardTitle>
                    </CardHeader>
                    <CardContent className='grid grid-cols-2 gap-3'>
                        {movie.showtimes.map((time, index) => (
                            <Badge 
                                key={`showtime-${index}`} 
                                onClick={() => setSelectedTime(time)}
                                active={selectedTime === time}
                                className="text-center py-3"
                            >
                                {time}
                            </Badge>
                        ))}
                    </CardContent>
                </Card>

                {/* Booking Summary Card (Abbreviated) */}
                <Card className='bg-gradient-to-br from-red-50 to-orange-50 dark:from-red-900/20 dark:to-orange-900/20 border-red-200/50 dark:border-red-800/50' hover={true}>
                    <CardHeader>
                        <CardTitle className="text-xl flex items-center text-red-700 dark:text-red-400">
                            <Ticket className='h-5 w-5 mr-2' /> Your Summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent className='pt-0 space-y-4'>
                        <div className='flex justify-between items-center bg-white/50 dark:bg-gray-800/50 p-3 rounded-lg'>
                            <span className="font-semibold text-gray-700 dark:text-gray-300">Seats</span>
                            <span className='font-bold text-purple-600 dark:text-purple-400 flex items-center'>
                                <Users className="h-4 w-4 mr-1" />
                                {selectedSeats.length}
                            </span>
                        </div>
                        <div className='flex justify-between items-center bg-gradient-to-r from-red-500/10 to-orange-500/10 p-4 rounded-xl border border-red-200/50 dark:border-red-800/50'>
                            <span className='text-lg font-bold text-red-700 dark:text-red-400'>Subtotal</span>
                            <span className='text-lg font-black text-red-700 dark:text-red-400'>₹{subtotal}</span>
                        </div>
                    </CardContent>
                </Card>


                {selectedSeats.length > 0 && (
                    <Button 
                        onClick={() => setView('summary')} 
                        className="w-full text-lg font-black shadow-2xl shadow-red-500/30 hover:shadow-3xl hover:shadow-red-500/40"
                        pulse={true}
                    >
                        <CreditCard className="h-5 w-5 mr-2" />
                        Proceed to Checkout ({selectedSeats.length} {selectedSeats.length === 1 ? 'Ticket' : 'Tickets'})
                    </Button>
                )}
            </div>

            {/* Right Column: Seat Map */}
            <Card className="lg:col-span-2 p-6 overflow-x-auto" hover={true}>
                <CardHeader>
                    <CardTitle className="text-xl flex items-center text-gray-800 dark:text-white">
                        <MapPin className='h-5 w-5 mr-2 text-red-500' /> Select Your Seats
                    </CardTitle>
                </CardHeader>
                <CardContent className='pt-4'>
                    <SeatMap 
                        seats={seats} 
                        selectedSeats={selectedSeats} 
                        onToggleSeat={onToggleSeat}
                        isLoading={isLoading}
                    />
                </CardContent>
            </Card>
        </div>
    );

    const renderSummaryView = () => (
        <div className="max-w-3xl mx-auto space-y-6 animate-in fade-in duration-500">
            <Card className='p-8 bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900' hover={true}>
                <CardTitle className="text-3xl bg-gradient-to-r from-red-600 to-orange-600 bg-clip-text text-transparent mb-6 text-center">
                    🎟️ Order Confirmation
                </CardTitle>
                
                {/* ... (Order details here, removed for brevity) */}

                <div className="pt-6 border-t border-gray-300/50 dark:border-gray-700/50 space-y-4">
                    <h3 className='text-2xl font-black text-gray-800 dark:text-white flex items-center'>
                        <Ticket className="h-6 w-6 mr-2 text-red-500" />
                        Price Breakdown
                    </h3>
                    
                    {/* ... (Price breakdown details here, removed for brevity) */}
                    
                    <div className='flex justify-between items-center bg-gradient-to-r from-red-500/20 to-orange-500/20 p-4 rounded-xl border border-red-200/50 dark:border-red-800/50 mt-4'>
                        <span className='font-black text-xl text-red-700 dark:text-red-400'>GRAND TOTAL</span>
                        <span className='font-black text-2xl text-red-700 dark:text-red-400'>₹{totalAmount}</span>
                    </div>
                </div>
            </Card>

            <div className='flex space-x-4'>
                <Button variant="secondary" onClick={() => setView('selection')} className='w-full text-lg hover:scale-105'>
                    <ChevronLeft className='h-5 w-5 mr-2' /> Change Selection
                </Button>
                <Button 
                    onClick={handlePaymentInitiation} 
                    disabled={totalAmount <= 0} 
                    className='w-full text-lg shadow-2xl shadow-red-500/30 hover:shadow-3xl hover:shadow-red-500/40'
                    pulse={true}
                >
                    <Lock className='h-5 w-5 mr-2' /> 
                    Pay ₹{totalAmount} Securely
                </Button>
            </div>
        </div>
    );

    return (
        <main className="container mx-auto p-4 flex-grow min-h-screen pt-24 bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-900 dark:to-gray-800">
            {renderHeader()}
            
            <div className="w-full animate-in fade-in duration-700">
                {view === 'selection' && renderSelectionView()}
                {view === 'summary' && renderSummaryView()}
            </div>
            
            {/* Payment Modal (Always opens directly as user is assumed logged in) */}
            {isPaymentModalOpen && (
                <PaymentModal 
                    bookingDetails={bookingDetails}
                    movie={movie}
                    user={currentUser}
                    onClose={() => setIsPaymentModalOpen(false)}
                    redirectUrl={REDIRECT_URL}
                    onMockSuccess={handlePaymentSuccess} // For demonstration purposes
                />
            )}

            {/* Confirmation Modal */}
            {isConfirmedModalOpen && (
                <ConfirmationModal 
                    movie={movie}
                    bookingDetails={bookingDetails}
                    paymentDetails={paymentDetails}
                    onClose={() => setIsConfirmedModalOpen(false)}
                    onBackToMain={handleModalClose}
                />
            )}
            
            {/* Enhanced Info Message */}
            {!isConfirmedModalOpen && (
                <div className="fixed bottom-6 right-6 bg-gradient-to-r from-blue-500 to-blue-600 p-4 rounded-2xl flex items-center shadow-2xl border border-blue-400/50 z-50 animate-in slide-in-from-bottom-2 duration-500 hover:scale-105 transition-transform">
                    <Sparkles className='h-5 w-5 mr-3 text-white animate-pulse' />
                    <span className='text-sm text-white font-medium'>
                        Welcome, {currentUser.name}! Ready to book {movie.title}
                    </span>
                </div>
            )}
        </main>
    );
};

// --- Helper Functions (remain the same) ---
const generateEmptySeatMap = () => {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const seatsPerRow = 15;

    let seatMap = [];
    for (let r = 0; r < rows.length; r++) {
        let category;
        if (r < 3) { 
            category = 'SILVER';
        } else if (r < 8) { 
            category = 'GOLD';
        } else { 
            category = 'PLATINUM';
        }

        for (let s = 1; s <= seatsPerRow; s++) {
            seatMap.push({
                id: `${rows[r]}${s}`,
                row: rows[r],
                number: s,
                isOccupied: s % 5 === 0 && r % 3 === 1, // Mock some occupied seats
                category: category, 
                price: SEAT_PRICES[category] 
            });
        }
    }
    return seatMap;
};

const getFutureDates = (count) => {
    const dates = [];
    for (let i = 0; i < count; i++) {
        const d = new Date();
        d.setDate(d.getDate() + i);
        dates.push({
            dateObj: d,
            day: d.toLocaleDateString('en-US', { weekday: 'short' }),
            date: d.getDate(),
            fullDate: d.toISOString().split('T')[0],
        });
    }
    return dates;
};

export default BookingPage;