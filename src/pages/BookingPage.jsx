import React, { useState, useMemo, useEffect } from 'react';
import { ChevronLeft, Calendar, Clock, Ticket, MapPin, X, Film, CheckCircle, Info, Star, LogOut } from 'lucide-react';

// --- Local Constants (to resolve dependency errors) ---
const SEAT_PRICES = {
    PLATINUM: 320, // Rows A-C (Best View)
    GOLD: 280,     // Rows D-H (Mid-range)
    SILVER: 220    // Rows I-J (Standard/Front)
};
const BOOKING_FEE = 50; 

const GENRE_MAP = { 28: 'Action', 12: 'Adventure', 16: 'Animation', 35: 'Comedy', 80: 'Crime', 99: 'Documentary', 10749: 'Romance', 878: 'Sci-Fi', 53: 'Thriller', 18: 'Drama' };
const getGenreName = (genreId) => GENRE_MAP[genreId] || 'Unknown';
const cn = (...classes) => classes.filter(Boolean).join(' ');

// --- SHADCN/UI Imports Simulation (Re-defined for self-containment) ---
const Card = ({ className, children, onClick }) => (<div onClick={onClick} className={"rounded-xl border shadow-lg transition-colors bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 " + className}>{children}</div>);
const CardHeader = ({ className, children }) => (<div className={"flex flex-col space-y-1.5 p-6 " + className}>{children}</div>);
const CardTitle = ({ className, children }) => (<h3 className={"text-2xl font-semibold leading-none tracking-tight text-gray-900 dark:text-white " + className}>{children}</h3>);
const CardContent = ({ className, children }) => (<div className={"p-6 pt-0 " + className}>{children}</div>);
const Button = ({ variant = 'default', className, onClick, disabled, children, type = 'button' }) => {
    let baseStyles = 'inline-flex items-center justify-center rounded-lg text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none h-10 px-4 py-2';
    let variantStyles = variant === 'default' ? 'bg-red-600 text-white hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-600 focus-visible:ring-red-500' : 'border border-gray-300 bg-transparent text-gray-900 hover:bg-gray-100 dark:text-gray-100 dark:border-gray-600 dark:hover:bg-gray-700 focus-visible:ring-gray-500';
    return (<button type={type} className={baseStyles + ' ' + variantStyles + ' ' + className} onClick={onClick} disabled={disabled}>{children}</button>);
};
const Badge = ({ variant = 'default', className, children, onClick }) => {
    let variantStyles = variant === 'default' ? 'bg-red-600 text-white hover:bg-red-700' : 'border border-gray-500 text-gray-400 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-700';
    return (<div onClick={onClick} className={'inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 ' + variantStyles + ' ' + className}>{children}</div>);
};
// --- END SHADCN/UI Simulation ---

// --- Core Seat Map Structure Generator (No occupied logic) ---
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
                isOccupied: false, // Initial state: assume empty, will be overridden by DB
                category: category, 
                price: SEAT_PRICES[category] 
            });
        }
    }
    return seatMap;
};

// --- Helper for Date Formatting ---
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

// --- Confirmation Modal Component ---
const ConfirmationModal = ({ movie, bookingDetails, onClose, onBackToMain }) => {
    
    // Deconstruct booking details for display
    const { date, time, seats, totalAmount, platinumSeats, goldSeats, silverSeats, platinumTotal, goldTotal, silverTotal } = bookingDetails;
    
    // Helper to format the date string
    const formattedDate = new Date(date).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm transition-opacity duration-300" onClick={onClose}>
            <Card className="max-w-md w-full mx-4 shadow-2xl animate-in fade-in zoom-in-95 duration-300" onClick={(e) => e.stopPropagation()}>
                <CardHeader className="flex flex-row items-center justify-between p-4 bg-green-600 rounded-t-xl">
                    <CardTitle className="text-xl text-white truncate flex items-center">
                        <CheckCircle className='h-6 w-6 mr-2' /> Booking Confirmed
                    </CardTitle>
                    <Button variant="secondary" onClick={onClose} className="h-8 w-8 p-0 rounded-full bg-white/20 hover:bg-white/30 text-white">
                        <X className="h-5 w-5" />
                    </Button>
                </CardHeader>
                
                <CardContent className="p-6">
                    <p className='text-lg text-gray-700 dark:text-gray-200 mb-6 text-center'>
                        Your E-Ticket for **{movie.title}** is ready!
                    </p>
                    
                    <div className='bg-gray-100 dark:bg-gray-900 p-4 rounded-lg space-y-3 border border-green-200 dark:border-green-700'>
                        <h3 className='text-xl font-bold text-green-700 dark:text-green-400 border-b border-green-200 dark:border-green-700 pb-2 mb-2'>BILL SUMMARY</h3>
                        
                        {/* Breakdown */}
                        {platinumSeats.length > 0 && <div className='flex justify-between'><span>Platinum (x{platinumSeats.length}):</span> <span>₹{platinumTotal}</span></div>}
                        {goldSeats.length > 0 && <div className='flex justify-between'><span>Gold (x{goldSeats.length}):</span> <span>₹{goldTotal}</span></div>}
                        {silverSeats.length > 0 && <div className='flex justify-between'><span>Silver (x{silverSeats.length}):</span> <span>₹{silverTotal}</span></div>}
                        
                        <div className='flex justify-between border-t border-gray-300 dark:border-gray-700 pt-2'><span>Booking Fee:</span> <span>₹{BOOKING_FEE}</span></div>
                        
                        {/* Total */}
                        <div className='flex justify-between font-extrabold text-xl text-red-700 dark:text-red-400 pt-2 border-t border-gray-300 dark:border-gray-700'>
                            <span>TOTAL PAID:</span> 
                            <span>₹{totalAmount}</span>
                        </div>
                    </div>

                    <div className='mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 space-y-2'>
                        <p className='flex justify-between font-medium'><span>Showtime:</span> <span className='font-bold text-red-600 dark:text-red-400'>{time} on {formattedDate}</span></p>
                        <p className='flex justify-between font-medium'><span>Seats:</span> <span className='font-bold'>{seats}</span></p>
                    </div>

                    <Button onClick={onBackToMain} className="w-full text-lg h-12 bg-green-600 hover:bg-green-700 mt-6">
                        <LogOut className="h-5 w-5 mr-2" /> Finish & Return Home
                    </Button>
                </CardContent>
            </Card>
        </div>
    );
};


// --- Seat Map Component ---
const SeatMap = ({ seats, selectedSeats, onToggleSeat, isLoading }) => {
    const rows = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J'];
    const seatsPerRow = 15;
    const AISLE_COLUMNS = [5, 10]; // Gaps after seat 5 and seat 10

    const getSeatClass = (seat) => {
        const isSelected = selectedSeats.includes(seat.id);
        if (seat.isOccupied) return 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed';
        if (isSelected) return 'bg-red-600 hover:bg-red-700 text-white ring-2 ring-red-300';
        
        switch (seat.category) {
            case 'PLATINUM':
                return 'bg-yellow-400 hover:bg-yellow-500 text-gray-900';
            case 'GOLD':
                return 'bg-amber-500 hover:bg-amber-600 text-white';
            case 'SILVER':
                return 'bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-gray-200';
            default:
                return 'bg-gray-200 dark:bg-gray-700';
        }
    };
    
    // Render loading state if data is not ready
    if (isLoading || seats.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center h-96">
                <svg className="animate-spin h-8 w-8 text-red-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                <p className='mt-4 text-gray-500 dark:text-gray-400'>Fetching live seating chart...</p>
            </div>
        );
    }


    return (
        <div className="space-y-6">
            {/* Screen indicator */}
            <div className="w-full h-1 bg-red-600 rounded-full shadow-lg shadow-red-500/50" />
            <p className="text-center text-sm font-semibold text-red-600 dark:text-red-400 mb-6">SCREEN THIS WAY</p>
            
            {/* Seating Layout */}
            <div className="flex flex-col items-center space-y-4"> {/* Increased space-y to 4 for row gaps */}
                {rows.map((row, rowIndex) => (
                    <div 
                        key={`row-${row}`} 
                        className={cn("flex space-x-1", {
                            "pt-3 border-t border-gray-300 dark:border-gray-700": rowIndex === 3 || rowIndex === 8 // Gap after Platinum (row C, index 2) and Gold (row H, index 7). Index 3 and 8 in the map loop.
                        })}
                    >
                        {/* Row Label */}
                        <div className="w-4 flex items-center justify-center text-sm font-bold text-gray-500 dark:text-gray-400">{row}</div>
                        
                        <div className="flex space-x-1">
                            {/* Render Seats */}
                            {Array.from({ length: seatsPerRow }, (_, seatIndex) => {
                                const seatNumber = seatIndex + 1;
                                // Find the specific seat object based on row and number
                                const seat = seats.find(s => s.row === row && s.number === seatNumber);
                                
                                // Generate a unique key for the seat
                                const uniqueKey = `row-${rowIndex}-seat-${seat?.id || seatIndex}`;
                                
                                // Conditional rendering if seat object is not found (shouldn't happen with generateEmptySeatMap)
                                if (!seat) return null;
                                
                                const seatElement = (
                                    <button
                                        key={uniqueKey}
                                        className={cn(
                                            'w-6 h-6 rounded-md text-xs font-medium transition-all duration-150 transform hover:scale-105 shadow-sm',
                                            'flex items-center justify-center', // FIX: Added for seat number alignment
                                            getSeatClass(seat)
                                        )}
                                        disabled={seat.isOccupied}
                                        onClick={() => onToggleSeat(seat.id)}
                                        title={`${row}${seatNumber} - ${seat.category} (₹${seat.price})`}
                                    >
                                        {seat.number}
                                    </button>
                                );
                                
                                // Insert aisle space after specific seats
                                if (AISLE_COLUMNS.includes(seatNumber)) {
                                    return (
                                        <React.Fragment key={`${uniqueKey}-fragment`}>
                                            {seatElement}
                                            <div className="w-4" /> {/* Horizontal gap/aisle (4 units of space) */}
                                        </React.Fragment>
                                    );
                                }

                                return seatElement;
                            })}
                        </div>

                        {/* Row Label (right side) */}
                        <div className="w-4 flex items-center justify-center text-sm font-bold text-gray-500 dark:text-gray-400">{row}</div>
                    </div>
                ))}
            </div>

            {/* Legend */}
            <div className="flex justify-center space-x-4 flex-wrap text-sm pt-4 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center space-x-2"><div className="w-4 h-4 rounded-md bg-red-600" /><span>Selected</span></div>
                <div className="flex items-center space-x-2"><div className="w-4 h-4 rounded-md bg-gray-400 dark:bg-gray-600" /><span>Occupied</span></div>
                <div className="flex items-center space-x-2"><div className="w-4 h-4 rounded-md bg-yellow-400" /><span>Platinum (₹{SEAT_PRICES.PLATINUM})</span></div>
                <div className="flex items-center space-x-2"><div className="w-4 h-4 rounded-md bg-amber-500" /><span>Gold (₹{SEAT_PRICES.GOLD})</span></div>
                <div className="flex items-center space-x-2"><div className="w-4 h-4 rounded-md bg-gray-200 dark:bg-gray-700" /><span>Silver (₹{SEAT_PRICES.SILVER})</span></div>
            </div>
        </div>
    );
};

// --- Main Booking Page Component ---
const BookingPage = ({ movie, onBack }) => {
    // Generates the fixed seating structure only once
    const initialSeatStructure = useMemo(() => generateEmptySeatMap(), []);

    const futureDates = useMemo(() => getFutureDates(7), []);

    // State for live seats (will be populated by Firestore)
    const [seats, setSeats] = useState(initialSeatStructure);
    const [isLoading, setIsLoading] = useState(false); // Set to true when fetching DB data

    // State for booking details
    const [selectedDate, setSelectedDate] = useState(futureDates[0].fullDate);
    const [selectedTime, setSelectedTime] = useState(movie.showtimes[0]);
    const [selectedSeats, setSelectedSeats] = useState([]);
    const [view, setView] = useState('selection'); // 'selection' | 'summary'
    const [isConfirmedModalOpen, setIsConfirmedModalOpen] = useState(false); 

    // **FIX: Ensure page is scrollable when this component is active**
    useEffect(() => {
        // Set overflow to 'auto' to allow scrolling of content if it overflows
        document.body.style.overflowY = 'auto';

        // Cleanup: Reset overflow when the component unmounts (navigating back)
        return () => {
            document.body.style.overflowY = ''; // Clears the inline style
        };
    }, []); 

    // --- FIREBASE/DATABASE INTEGRATION POINT ---
    // useEffect(() => {
    //     if (selectedDate && selectedTime && movie.id) {
    //         // 1. Set isLoading(true)
    //         setIsLoading(true);

    //         // 2. Define the path based on movie, date, and time
    //         // const dbPath = `/artifacts/${__app_id}/public/data/showtimes/${movie.id}-${selectedDate}-${selectedTime.replace(' ', '')}`;

    //         // 3. Attach onSnapshot listener to fetch occupied seats
    //         // const unsubscribe = onSnapshot(doc(db, dbPath), (docSnapshot) => {
    //         //     if (docSnapshot.exists()) {
    //         //         const occupiedSeatIds = docSnapshot.data().occupied || [];
    //         //         
    //         //         // Create the final seat list by merging structure with occupied data
    //         //         const updatedSeats = initialSeatStructure.map(seat => ({
    //         //             ...seat,
    //         //             isOccupied: occupiedSeatIds.includes(seat.id)
    //         //         }));
    //         //         setSeats(updatedSeats);
    //         //     }
    //         //     setIsLoading(false);
    //         // });

    //         // For now, simulate loading delay without DB:
    //         const timer = setTimeout(() => {
    //             // Mock data update to show some seats occupied after 'fetch'
    //             const mockOccupied = ['F5', 'F6', 'G10', 'A1'];
    //             const updatedSeats = initialSeatStructure.map(seat => ({
    //                 ...seat,
    //                 isOccupied: mockOccupied.includes(seat.id)
    //             }));
    //             setSeats(updatedSeats);
    //             setIsLoading(false);
    //         }, 500);
            
    //         return () => clearTimeout(timer); // Cleanup mock timer or real DB listener
    //     }
    // }, [selectedDate, selectedTime, movie.id, initialSeatStructure]);
    
    // Reset selected seats whenever date/time changes
    useEffect(() => {
        setSelectedSeats([]);
    }, [selectedDate, selectedTime]);
    
    // --- END FIREBASE/DATABASE INTEGRATION POINT ---


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
    
    // Detailed booking object for the modal
    const bookingDetails = useMemo(() => ({
        date: futureDates.find(d => d.fullDate === selectedDate)?.fullDate,
        time: selectedTime,
        seats: selectedSeats.join(', '),
        totalAmount,
        platinumSeats: platinumSeats,
        goldSeats: goldSeats,
        silverSeats: silverSeats,
        platinumTotal,
        goldTotal,
        silverTotal,
        subtotal
    }), [selectedDate, selectedTime, selectedSeats, totalAmount, platinumSeats, goldSeats, silverSeats, platinumTotal, goldTotal, silverTotal, subtotal, futureDates]);
    
    // Safety check for movie data
    if (!movie) {
        return (
            <main className="container mx-auto p-8 flex-grow min-h-screen pt-24">
                <div className="p-10 bg-red-100 dark:bg-red-900 border border-red-500 rounded-lg text-center">
                    <h2 className="text-3xl font-bold text-red-600 dark:text-red-300 mb-4">
                        Error: Movie Data Missing
                    </h2>
                    <p className='text-gray-700 dark:text-gray-200 mb-6'>
                        Cannot proceed with booking. Please return to the movie list.
                    </p>
                    <Button onClick={onBack}>
                        <ChevronLeft className="h-4 w-4 mr-1" /> Go Back
                    </Button>
                </div>
            </main>
        );
    }
    
    const onToggleSeat = (seatId) => {
        const seat = getSeatData(seatId);
        if (!seat || seat.isOccupied) return;

        if (selectedSeats.includes(seatId)) {
            setSelectedSeats(selectedSeats.filter(id => id !== seatId));
        } else if (selectedSeats.length < 10) { // Limit to 10 seats
            setSelectedSeats([...selectedSeats, seatId]);
        }
    };

    const handlePayment = () => {
        // Mock payment process succeeded, open the confirmation modal
        setIsConfirmedModalOpen(true);
    };

    const handleModalClose = () => {
        setIsConfirmedModalOpen(false);
        // Navigate back to the main movie list after successful booking
        onBack();
    }

    // --- RENDER FUNCTIONS ---
    
    const renderHeader = () => (
        <div className="mb-8 border-b border-gray-200 dark:border-gray-700 pb-4">
            <Button variant="secondary" onClick={onBack} className="mb-4">
                <ChevronLeft className="h-4 w-4 mr-1" /> Back to Movie Details
            </Button>
            <h1 className="text-4xl font-extrabold text-red-600 dark:text-red-500 flex items-center">
                <Film className='h-8 w-8 mr-3' /> Booking: {movie.title}
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mt-1 italic">
                {getGenreName(movie.genreIds[0])} | {movie.runtime} | {movie.rating.toFixed(1)} <Star className='inline h-4 w-4 fill-yellow-500 text-yellow-500' />
            </p>
        </div>
    );

    const renderSelectionView = () => (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left Column: Date, Time, and Summary */}
            <div className="lg:col-span-1 space-y-6">
                
                {/* 1. Date Selection */}
                <Card>
                    <CardHeader><CardTitle className="text-xl flex items-center"><Calendar className='h-5 w-5 mr-2' /> Select Date</CardTitle></CardHeader>
                    <CardContent className='flex space-x-3 overflow-x-auto pb-6'>
                        {futureDates.map(d => (
                            <div key={d.fullDate} onClick={() => setSelectedDate(d.fullDate)} className={cn(
                                'flex flex-col items-center justify-center p-3 w-16 h-16 rounded-lg cursor-pointer transition-colors flex-shrink-0 border',
                                selectedDate === d.fullDate ? 'bg-red-600 border-red-600 text-white shadow-lg' : 'bg-gray-100 dark:bg-gray-700 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                            )}>
                                <span className='text-sm font-medium'>{d.day}</span>
                                <span className='text-xl font-bold'>{d.date}</span>
                            </div>
                        ))}
                    </CardContent>
                </Card>

                {/* 2. Time/Showtime Selection */}
                <Card>
                    <CardHeader><CardTitle className="text-xl flex items-center"><Clock className='h-5 w-5 mr-2' /> Select Showtime</CardTitle></CardHeader>
                    <CardContent className='flex flex-wrap gap-3'>
                        {movie.showtimes.map((time, index) => (
                            <Badge 
                                key={`showtime-${index}`} 
                                onClick={() => setSelectedTime(time)}
                                className={cn(
                                    'px-4 py-2 text-base cursor-pointer transition-all duration-200 shadow-md',
                                    selectedTime === time ? 'bg-red-600 text-white ring-2 ring-red-400' : 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 border-gray-300 dark:border-gray-600 hover:bg-gray-200 dark:hover:bg-gray-600'
                                )}
                            >
                                {time}
                            </Badge>
                        ))}
                    </CardContent>
                </Card>
                
                {/* 3. Booking Summary */}
                <Card className='bg-red-50 dark:bg-gray-900 border-red-300 dark:border-red-700'>
                    <CardHeader><CardTitle className="text-xl flex items-center text-red-700 dark:text-red-400"><Ticket className='h-5 w-5 mr-2' /> Your Summary</CardTitle></CardHeader>
                    <CardContent className='pt-0 space-y-3'>
                        <div className='flex justify-between font-medium text-gray-700 dark:text-gray-300'>
                            <span>Date:</span>
                            <span className='font-bold text-red-600 dark:text-red-400'>{futureDates.find(d => d.fullDate === selectedDate)?.fullDate}</span>
                        </div>
                        <div className='flex justify-between font-medium text-gray-700 dark:text-gray-300'>
                            <span>Time:</span>
                            <span className='font-bold'>{selectedTime}</span>
                        </div>
                        <div className='flex justify-between font-medium text-gray-700 dark:text-gray-300'>
                            <span>Seats Selected:</span>
                            <span className='font-bold'>{selectedSeats.length}</span>
                        </div>
                        <div className='flex justify-between font-medium text-red-700 dark:text-red-400 pt-3 border-t border-red-200 dark:border-red-700'>
                            <span className='text-lg'>Subtotal (Excl. Fee):</span>
                            <span className='text-lg font-extrabold'>₹{subtotal}</span>
                        </div>
                    </CardContent>
                </Card>

                {selectedSeats.length > 0 && (
                    <Button 
                        onClick={() => setView('summary')} 
                        className="w-full h-12 text-lg font-bold shadow-lg shadow-red-500/50"
                    >
                        Proceed to Checkout ({selectedSeats.length} Tickets)
                    </Button>
                )}
            </div>

            {/* Right Column: Seat Map */}
            <Card className="lg:col-span-2 p-6 overflow-x-auto">
                <CardHeader><CardTitle className="text-xl flex items-center"><MapPin className='h-5 w-5 mr-2' /> Select Seats</CardTitle></CardHeader>
                <CardContent className='pt-2'>
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
        <div className="max-w-3xl mx-auto space-y-6">
            <Card className='p-8'>
                <CardTitle className="text-3xl text-red-600 dark:text-red-400 mb-6">Order Confirmation</CardTitle>
                
                <div className="space-y-4 text-gray-700 dark:text-gray-300">
                    <div className='flex justify-between border-b pb-2'><span className='font-medium'>Movie:</span> <span className='font-bold text-red-600 dark:text-red-400'>{movie.title}</span></div>
                    <div className='flex justify-between border-b pb-2'><span className='font-medium'>Date & Time:</span> <span>{bookingDetails.date} @ {bookingDetails.time}</span></div>
                    <div className='flex justify-between border-b pb-2'><span className='font-medium'>Total Seats:</span> <span>{selectedSeats.length}</span></div>
                    <div className='flex justify-between border-b pb-2'><span className='font-medium'>Seats:</span> <span className='font-bold'>{bookingDetails.seats}</span></div>
                </div>

                <div className="mt-8 pt-4 border-t border-gray-300 dark:border-gray-700 space-y-3">
                    <h3 className='text-xl font-bold text-gray-800 dark:text-white'>Price Breakdown</h3>
                    
                    {platinumSeats.length > 0 && <div className='flex justify-between'><span>Platinum Tickets (x{platinumSeats.length} @ ₹{SEAT_PRICES.PLATINUM}):</span> <span>₹{platinumTotal}</span></div>}
                    {goldSeats.length > 0 && <div className='flex justify-between'><span>Gold Tickets (x{goldSeats.length} @ ₹{SEAT_PRICES.GOLD}):</span> <span>₹{goldTotal}</span></div>}
                    {silverSeats.length > 0 && <div className='flex justify-between'><span>Silver Tickets (x{silverSeats.length} @ ₹{SEAT_PRICES.SILVER}):</span> <span>₹{silverTotal}</span></div>}
                    
                    <div className='flex justify-between border-b pb-2'><span>Booking Fee:</span> <span>₹{BOOKING_FEE}</span></div>
                    <div className='flex justify-between font-extrabold text-2xl text-red-700 dark:text-red-400'>
                        <span>GRAND TOTAL:</span> 
                        <span>₹{totalAmount}</span>
                    </div>
                </div>
            </Card>

            <div className='flex space-x-4'>
                <Button variant="secondary" onClick={() => setView('selection')} className='w-full text-lg h-12'>
                    <ChevronLeft className='h-5 w-5 mr-2' /> Change Selection
                </Button>
                <Button onClick={handlePayment} disabled={totalAmount <= 0} className='w-full text-lg h-12 shadow-xl shadow-red-500/50'>
                    <CheckCircle className='h-5 w-5 mr-2' /> Pay Now (₹{totalAmount})
                </Button>
            </div>
        </div>
    );

    return (
        <main className="container mx-auto p-4 flex-grow min-h-screen pt-24">
            {renderHeader()}
            
            <div className="w-full">
                {view === 'selection' && renderSelectionView()}
                {view === 'summary' && renderSummaryView()}
            </div>
            
            {/* Confirmation Modal renders here */}
            {isConfirmedModalOpen && (
                <ConfirmationModal 
                    movie={movie}
                    bookingDetails={bookingDetails}
                    onClose={() => setIsConfirmedModalOpen(false)}
                    onBackToMain={handleModalClose}
                />
            )}
            
            {/* Simple Info message */}
            {!isConfirmedModalOpen && (
                <div className="fixed bottom-4 right-4 bg-blue-100 dark:bg-blue-900 p-3 rounded-lg flex items-center shadow-lg border border-blue-400 dark:border-blue-700 z-50 animate-in slide-in-from-bottom-2">
                    <Info className='h-5 w-5 mr-2 text-blue-600 dark:text-blue-400' />
                    <span className='text-sm text-blue-800 dark:text-blue-200'>Booking is for {movie.title} - Select Date, Time, and Seats.</span>
                </div>
            )}
        </main>
    );
};

export default BookingPage;
