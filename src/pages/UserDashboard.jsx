import { useEffect, useState } from 'react';
import { ArrowLeft, CalendarDays, Ticket } from 'lucide-react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
export default function UserDashboard() {
  const [bookings, setBookings] = useState([]);
  useEffect(() => { axios.get(`${API}/api/bookings/mine`).then(({ data }) => setBookings(data.bookings)); }, []);
  return <main className="dashboard"><Link to="/" className="back-link"><ArrowLeft size={16} /> Back to cinema</Link><p className="eyebrow">ACCOUNT / ARCHIVE</p><h1>Your tickets</h1><div className="ticket-list">{bookings.length ? bookings.map((booking) => <article className="ticket-card" key={booking.id}><div><span className={`status ${booking.status}`}>{booking.status}</span><h2>{booking.snapshot?.movieTitle || 'Cinema ticket'}</h2><p><CalendarDays size={15} /> {booking.snapshot?.startsAt ? new Date(booking.snapshot.startsAt).toLocaleString() : 'Pending show'}</p><p><Ticket size={15} /> {booking.reference} · {booking.seats?.join(', ')}</p></div><strong>₹{booking.amount?.total}</strong></article>) : <div className="empty-state"><Ticket size={30} /><p>Your next great night is still waiting to be booked.</p></div>}</div></main>;
}
