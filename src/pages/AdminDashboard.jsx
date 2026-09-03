import { useEffect, useState } from 'react';
import { ArrowLeft, BarChart3, Building2, Clapperboard, Ticket } from 'lucide-react';
import axios from 'axios';
import { Link } from 'react-router-dom';

const API = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3001';
export default function AdminDashboard() {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => { axios.get(`${API}/api/manage/overview`).then(({ data: result }) => setData(result)).catch((reason) => setError(reason.response?.data?.error?.message || 'Staff access required.')); }, []);
  if (error) return <main className="dashboard"><Link to="/" className="back-link"><ArrowLeft size={16} /> Back to cinema</Link><h1>Staff dashboard</h1><p className="feedback">{error}</p></main>;
  return <main className="dashboard"><Link to="/" className="back-link"><ArrowLeft size={16} /> Back to cinema</Link><p className="eyebrow">OPERATIONS / {data?.scope?.cityName || 'ALL CITIES'}</p><h1>Control room</h1><div className="stats-grid">{[['Revenue', data?.totals?.revenue, BarChart3], ['Bookings', data?.totals?.bookings, Ticket], ['Theatres', data?.totals?.theatres, Building2], ['Upcoming shows', data?.totals?.upcomingShows, Clapperboard]].map(([label, value, Icon]) => <div className="stat" key={label}><Icon size={18} /><small>{label}</small><strong>{label === 'Revenue' ? `₹${value || 0}` : value || 0}</strong></div>)}</div><section className="data-band"><h2>Top theatres</h2>{data?.topTheatres?.map((theatre) => <p key={theatre.id}><span>{theatre.name}</span><b>₹{theatre.revenue}</b></p>)}</section></main>;
}
