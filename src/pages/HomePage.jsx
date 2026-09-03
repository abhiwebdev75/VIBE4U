import { useEffect, useState } from 'react';
import { CalendarDays, Check, ChevronRight, Film, MapPin, Ticket, WalletCards } from 'lucide-react';
import axios from 'axios';

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN')}`;

export default function HomePage() {
  const [cities, setCities] = useState([]);
  const [city, setCity] = useState('');
  const [movies, setMovies] = useState([]);
  const [shows, setShows] = useState([]);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [selectedShow, setSelectedShow] = useState(null);
  const [seats, setSeats] = useState([]);
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [coupon, setCoupon] = useState('');
  const [booking, setBooking] = useState(null);
  const [message, setMessage] = useState('');

  useEffect(() => { axios.get(`${API}/api/catalog/cities`).then(({ data }) => { setCities(data.cities); if (data.cities[0]) setCity(data.cities[0].id); }).catch(() => setMessage('Start the API and seed the catalogue to begin.')); }, []);
  useEffect(() => { if (!city) return; Promise.all([axios.get(`${API}/api/catalog/movies?city=${city}`), axios.get(`${API}/api/catalog/shows?city=${city}`)]).then(([movieResponse, showResponse]) => { setMovies(movieResponse.data.movies); setShows(showResponse.data.shows); setSelectedMovie(null); setSelectedShow(null); }); }, [city]);
  useEffect(() => { if (!selectedShow) return; axios.get(`${API}/api/catalog/shows/${selectedShow.id}/seats`).then(({ data }) => setSeats(data.seats || [])).catch(() => setMessage('Seat map unavailable.')); }, [selectedShow]);

  const movieShows = selectedMovie ? shows.filter((show) => show.movie?.id === selectedMovie.id) : [];
  const total = selectedSeats.reduce((sum, id) => sum + Number(seats.find((seat) => seat.id === id)?.price || 0), 0);
  const holdSeats = async () => {
    try {
      const { data } = await axios.post(`${API}/api/bookings/hold`, { showId: selectedShow.id, seats: selectedSeats, couponCode: coupon || undefined });
      setBooking(data.booking);
      const order = await axios.post(`${API}/api/payments/order`, { reference: data.booking.reference });
      const payment = await axios.post(`${API}/api/payments/sandbox/pay`, { reference: data.booking.reference });
      const verified = await axios.post(`${API}/api/payments/verify`, payment.data);
      setBooking(verified.data.booking); setMessage('Your ticket is confirmed.');
      void order;
    } catch (error) { setMessage(error.response?.data?.error?.message || 'Booking could not be completed.'); }
  };

  return <main className="cinema-shell">
    <section className="hero-band"><div><p className="eyebrow">VIBE4U / CINEMA, CURATED</p><h1>Tonight has a<br /><em>different</em> ending.</h1><p className="hero-copy">Find the right screen, the right seat, and let the city disappear for a couple of hours.</p></div><div className="hero-mark"><Film size={34} /><span>01<br />SCREEN</span></div></section>
    <section className="city-strip"><MapPin size={18} /><label htmlFor="city">Screening in</label><select id="city" value={city} onChange={(event) => setCity(event.target.value)}>{cities.map((item) => <option key={item.id} value={item.id}>{item.name}, {item.state}</option>)}</select><span className="city-note">{movies.length} films playing near you</span></section>
    <section className="content-grid"><div><div className="section-heading"><span>01</span><h2>Now showing</h2></div><div className="movie-grid">{movies.map((movie) => <button className={`movie-card ${selectedMovie?.id === movie.id ? 'active' : ''}`} key={movie.id} onClick={() => setSelectedMovie(movie)}><img src={movie.posterUrl} alt={movie.title} /><span className="movie-meta">{movie.certificate} / {movie.runtimeLabel}</span><strong>{movie.title}</strong><small>{movie.genres?.join(' · ')}</small></button>)}</div></div>
      <aside className="booking-panel"><div className="section-heading"><span>02</span><h2>{selectedMovie ? 'Choose a show' : 'Your night'}</h2></div>{!selectedMovie ? <div className="empty-state"><Ticket size={28} /><p>Select a film to see theatres and showtimes.</p></div> : <div className="show-list">{movieShows.map((show) => <button className={`show-row ${selectedShow?.id === show.id ? 'active' : ''}`} key={show.id} onClick={() => { setSelectedShow(show); setSelectedSeats([]); }}><span><b>{new Date(show.startsAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</b><small>{show.theatre?.name} · {show.hall?.name}</small></span><ChevronRight size={18} /></button>)}</div>}
        {selectedShow && <div className="seat-picker"><div className="screen-label">SCREEN</div><div className="seat-grid">{seats.map((seat) => <button key={seat.id} title={`${seat.id} · ${money(seat.price)}`} className={`seat ${selectedSeats.includes(seat.id) ? 'selected' : ''}`} onClick={() => setSelectedSeats((current) => current.includes(seat.id) ? current.filter((id) => id !== seat.id) : [...current, seat.id])}>{seat.id}</button>)}</div><div className="checkout-line"><input placeholder="Coupon code" value={coupon} onChange={(event) => setCoupon(event.target.value.toUpperCase())} /><strong>{money(total)}</strong></div><button className="primary-action" disabled={!selectedSeats.length} onClick={holdSeats}><WalletCards size={17} /> Hold & pay {selectedSeats.length ? `· ${selectedSeats.length} seat${selectedSeats.length > 1 ? 's' : ''}` : ''}</button></div>}
        {booking && <div className="ticket-confirmed"><Check size={18} /><span><b>{booking.reference}</b><small>Ticket confirmed for {booking.snapshot?.movieTitle || selectedMovie?.title}</small></span></div>}{message && <p className="feedback">{message}</p>}</aside></section>
  </main>;
}
