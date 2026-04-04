import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Search, Check, AlertTriangle, BedDouble, Calendar, Users, DollarSign, ChevronRight } from 'lucide-react';

const API_BASE = process.env.REACT_APP_BACKEND_URL + '/api';

const STATUS_COLORS = {
  confirmed:   { bg: '#ede9fe', text: '#5b21b6', label: 'Confirmada' },
  checked_in:  { bg: '#d1fae5', text: '#065f46', label: 'En Hotel' },
  checked_out: { bg: '#e0e7ff', text: '#3730a3', label: 'Finalizada' },
  cancelled:   { bg: '#fee2e2', text: '#991b1b', label: 'Cancelada' },
};

export default function BookingLookup() {
  const [ref, setRef] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!ref.trim() || !email.trim()) { setError('Ingresa tu número de referencia y email.'); return; }
    setLoading(true); setError(''); setResult(null);
    try {
      const res = await fetch(`${API_BASE}/public/booking/lookup?booking_ref=${encodeURIComponent(ref.trim())}&email=${encodeURIComponent(email.trim())}`);
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'No encontrada'); }
      setResult(await res.json());
    } catch (e) { setError(e.message || 'No se encontró ninguna reserva con esos datos.'); }
    finally { setLoading(false); }
  };

  const statusCfg = result ? (STATUS_COLORS[result.status] || STATUS_COLORS.confirmed) : null;

  return (
    <div className="min-h-screen" style={{ background: '#faf8f3', fontFamily: 'Montserrat, sans-serif' }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm" style={{ background: 'white', borderBottom: '1px solid #e8dfd5' }}>
        <Link to="/catalogo" className="flex items-center gap-3" style={{ textDecoration: 'none' }}>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ border: '1px solid rgba(98,87,70,0.25)', background: 'rgba(98,87,70,0.06)' }}>
            <span style={{ fontFamily: 'Manrope, sans-serif', color: '#625746', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em' }}>S</span>
          </div>
          <div>
            <span style={{ fontFamily: 'Manrope, sans-serif', color: '#625746', fontSize: '16px', fontWeight: 700, letterSpacing: '0.04em' }}>STAYLO</span>
            <span style={{ color: '#917a6a', fontSize: '10px', letterSpacing: '0.06em', fontFamily: 'Montserrat, sans-serif', fontWeight: 500, marginLeft: '8px' }}>Mi reserva</span>
          </div>
        </Link>
        <Link to="/reservar" style={{ color: '#917a6a', fontSize: '13px', fontWeight: 500, textDecoration: 'none' }}>
          Nueva reserva <ChevronRight size={13} className="inline" />
        </Link>
      </div>

      <div className="max-w-lg mx-auto px-4 py-12">
        {/* Hero */}
        <div className="text-center mb-10">
          <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(98,87,70,0.08)', border: '1px solid #e8dfd5' }}>
            <Search size={24} style={{ color: '#917a6a' }} strokeWidth={1.5} />
          </div>
          <h1 style={{ fontFamily: 'Georgia, serif', color: '#625746', fontSize: '34px', fontWeight: 300, marginBottom: 8, lineHeight: 1.2 }}>
            Consulta tu reserva
          </h1>
          <p style={{ color: '#917a6a', fontSize: '14px', lineHeight: 1.6 }}>
            Ingresa el número de referencia que recibiste por email<br />y tu correo electrónico para ver los detalles.
          </p>
        </div>

        {/* Lookup Form */}
        <form onSubmit={handleSearch} className="bg-white rounded-2xl p-8 shadow-sm mb-5" style={{ border: '1px solid #e8dfd5' }}>
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-2 tracking-wider" style={{ color: '#917a6a' }}>
                NÚMERO DE REFERENCIA
              </label>
              <input
                value={ref}
                onChange={e => setRef(e.target.value.toUpperCase())}
                placeholder="Ej: A1B2C3D4"
                maxLength={8}
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none uppercase tracking-widest font-mono"
                style={{ border: '1px solid #d2c7b6', color: '#625746', fontFamily: 'monospace', letterSpacing: '0.15em', fontSize: '16px' }}
                data-testid="lookup-ref-input"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold mb-2 tracking-wider" style={{ color: '#917a6a' }}>
                CORREO ELECTRÓNICO
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
                className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                style={{ border: '1px solid #d2c7b6', color: '#625746', fontFamily: 'Montserrat, sans-serif' }}
                data-testid="lookup-email-input"
              />
            </div>
            {error && (
              <div className="flex items-start gap-2 p-3 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                <AlertTriangle size={15} style={{ color: '#ef4444', marginTop: 1, flexShrink: 0 }} />
                <p style={{ color: '#dc2626', fontSize: '13px' }}>{error}</p>
              </div>
            )}
            <button type="submit" disabled={loading} data-testid="lookup-submit-btn"
              className="w-full py-3.5 rounded-xl font-semibold text-sm transition-all disabled:opacity-60 flex items-center justify-center gap-2"
              style={{ background: '#625746', color: '#fcf5e0', letterSpacing: '0.04em' }}>
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Buscando...
                </>
              ) : (
                <><Search size={15} /> Consultar reserva</>
              )}
            </button>
          </div>
        </form>

        {/* Result */}
        {result && (
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: '1px solid #e8dfd5' }} data-testid="booking-result">
            {/* Header */}
            <div className="px-7 py-5" style={{ background: 'linear-gradient(135deg, #625746, #917a6a)' }}>
              <div className="flex items-center justify-between">
                <div>
                  <p style={{ color: '#d2c7b6', fontSize: '10px', letterSpacing: '0.25em', marginBottom: 4 }}>REFERENCIA</p>
                  <p style={{ color: '#fcf5e0', fontFamily: 'monospace', fontSize: '22px', fontWeight: 700, letterSpacing: '0.12em' }}>
                    #{result.booking_ref}
                  </p>
                </div>
                <span className="px-3 py-1.5 rounded-full text-xs font-semibold"
                  style={{ background: statusCfg.bg, color: statusCfg.text }}>
                  {result.status_label}
                </span>
              </div>
              <p style={{ color: 'rgba(210,199,182,0.85)', fontSize: '14px', marginTop: 6 }}>
                {result.guest_name}
              </p>
            </div>

            {/* Details */}
            <div className="p-7 space-y-5">
              {/* Room */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f5ede2' }}>
                  <BedDouble size={17} style={{ color: '#917a6a' }} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wider mb-0.5" style={{ color: '#c8b8a8' }}>HABITACIÓN</p>
                  <p className="font-semibold text-sm" style={{ color: '#625746' }}>
                    {result.room_type_label} — Hab. {result.room_number}
                  </p>
                </div>
              </div>

              {/* Dates */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f5ede2' }}>
                  <Calendar size={17} style={{ color: '#917a6a' }} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wider mb-0.5" style={{ color: '#c8b8a8' }}>FECHAS</p>
                  <p className="font-semibold text-sm" style={{ color: '#625746' }}>
                    {result.check_in_date} → {result.check_out_date}
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: '#917a6a' }}>
                    {Math.round((new Date(result.check_out_date) - new Date(result.check_in_date)) / 86400000)} noches
                  </p>
                </div>
              </div>

              {/* Guests */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f5ede2' }}>
                  <Users size={17} style={{ color: '#917a6a' }} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wider mb-0.5" style={{ color: '#c8b8a8' }}>HUÉSPEDES</p>
                  <p className="font-semibold text-sm" style={{ color: '#625746' }}>
                    {result.adults} adulto{result.adults !== 1 ? 's' : ''}
                    {result.children ? ` · ${result.children} niño${result.children !== 1 ? 's' : ''}` : ''}
                  </p>
                </div>
              </div>

              {/* Payment */}
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#f5ede2' }}>
                  <DollarSign size={17} style={{ color: '#917a6a' }} strokeWidth={1.5} />
                </div>
                <div>
                  <p className="text-xs font-semibold tracking-wider mb-0.5" style={{ color: '#c8b8a8' }}>PAGO</p>
                  <p className="font-bold text-lg" style={{ color: '#625746' }}>
                    ${result.total_amount.toLocaleString('es-MX')} MXN
                  </p>
                  <p className="text-xs mt-0.5" style={{ color: result.payment_status === 'pending' ? '#d97706' : '#059669', fontWeight: 500 }}>
                    {result.payment_label}
                  </p>
                </div>
              </div>

              {/* Notes */}
              {result.notes && (
                <div className="p-4 rounded-xl" style={{ background: '#faf8f3', border: '1px solid #e8dfd5' }}>
                  <p className="text-xs font-semibold tracking-wider mb-1" style={{ color: '#c8b8a8' }}>NOTAS</p>
                  <p className="text-sm" style={{ color: '#917a6a' }}>{result.notes}</p>
                </div>
              )}

              {/* Divider */}
              <div className="pt-2 border-t" style={{ borderColor: '#f0e8dc' }} />

              {/* Actions */}
              <div className="text-center">
                <p className="text-xs mb-4" style={{ color: '#917a6a', lineHeight: 1.6 }}>
                  ¿Tienes alguna solicitud especial o necesitas modificar tu estancia?<br />
                  Contáctanos directamente.
                </p>
                <Link to="/reservar"
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-xl text-sm font-semibold transition-all"
                  style={{ background: '#625746', color: '#fcf5e0', textDecoration: 'none' }}>
                  Hacer otra reserva <ChevronRight size={15} />
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
