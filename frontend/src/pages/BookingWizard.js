import { useState, useEffect, useCallback } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronRight, ChevronLeft, Check, BedDouble, Wifi, Wind, Tv, ShowerHead, Lock, Sofa, Shirt, Droplets, SprayCan, Coffee, Clock, LogOut, Phone, Calendar, Users, CreditCard, Building2, X } from 'lucide-react';

const API_BASE = process.env.REACT_APP_BACKEND_URL + '/api';

const STEPS = ['Fechas', 'Habitación', 'Extras', 'Tus Datos', 'Pago', 'Confirmación'];

const ROOM_IMAGES = {
  junior_suite: 'https://customer-assets.emergentagent.com/job_hospitality-hub-100/artifacts/b82q6u05_eac2daf1-5797-489c-98f8-a4bdb16ce8da.jpeg',
  double: 'https://images.unsplash.com/photo-1743410975074-4be327c0ae63?crop=entropy&cs=srgb&fm=jpg&w=800&q=80',
};

const ROOM_AMENITIES = {
  junior_suite: [
    { icon: BedDouble, text: 'Cama King Size' }, { icon: Sofa, text: 'Sofá Cama' },
    { icon: Shirt, text: 'Vestidor' }, { icon: Droplets, text: 'Doble Lavabo' },
    { icon: ShowerHead, text: 'Regadera de Lluvia' }, { icon: Wind, text: 'Aire Acondicionado' },
    { icon: Tv, text: 'TV' }, { icon: Wifi, text: 'WiFi' },
  ],
  double: [
    { icon: BedDouble, text: '2 Camas Queen' }, { icon: Lock, text: 'Caja de Seguridad' },
    { icon: ShowerHead, text: 'Regadera de Lluvia' }, { icon: SprayCan, text: 'Baño Privado' },
    { icon: Wind, text: 'Aire Acondicionado' }, { icon: Tv, text: 'TV' }, { icon: Wifi, text: 'WiFi' },
  ],
};

const EXTRAS = [
  { key: 'desayuno', icon: Coffee, label: 'Desayuno incluido', desc: 'Buffet completo · por persona por noche', priceLabel: '$200 MXN / persona / noche' },
];

function StepIndicator({ step }) {
  return (
    <div className="flex items-center justify-center gap-0 mb-8 overflow-x-auto py-2">
      {STEPS.map((label, i) => {
        const idx = i + 1;
        const done = idx < step;
        const active = idx === step;
        return (
          <div key={idx} className="flex items-center">
            <div className="flex flex-col items-center">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all
                ${done ? 'text-white' : active ? 'text-white' : 'border-2 text-slate-400'}`}
                style={done ? { background: '#625746' } : active ? { background: '#917a6a' } : { borderColor: '#d2c7b6', background: 'white' }}>
                {done ? <Check size={14} /> : idx}
              </div>
              <span className="text-xs mt-1 whitespace-nowrap hidden sm:block"
                style={{ color: active ? '#625746' : done ? '#917a6a' : '#c8b8a8', fontFamily: 'Montserrat, sans-serif', fontWeight: active ? 600 : 400 }}>
                {label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <div className="w-8 sm:w-12 h-px mx-1" style={{ background: done ? '#917a6a' : '#e8dfd5' }} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Counter({ value, onChange, min = 0, max = 10 }) {
  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={() => onChange(Math.max(min, value - 1))}
        className="w-8 h-8 rounded-full border flex items-center justify-center text-lg transition-all hover:bg-slate-50 disabled:opacity-40"
        style={{ borderColor: '#d2c7b6', color: '#625746' }} disabled={value <= min}>−</button>
      <span className="w-8 text-center font-semibold" style={{ color: '#625746', fontFamily: 'Montserrat, sans-serif' }}>{value}</span>
      <button type="button" onClick={() => onChange(Math.min(max, value + 1))}
        className="w-8 h-8 rounded-full border flex items-center justify-center text-lg transition-all hover:bg-slate-50 disabled:opacity-40"
        style={{ borderColor: '#d2c7b6', color: '#625746' }} disabled={value >= max}>+</button>
    </div>
  );
}

export default function BookingWizard() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [dates, setDates] = useState({ checkIn: '', checkOut: '' });
  const [guests, setGuests] = useState({ adults: 2, children: 0 });
  const [availability, setAvailability] = useState([]);
  const [loadingAvail, setLoadingAvail] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState(null);
  const [extras, setExtras] = useState({ desayuno: false, early_checkin: false, late_checkout: false });
  const [guestInfo, setGuestInfo] = useState({ first_name: '', last_name: '', email: '', phone: '', id_number: '', event_name: '' });
  const [paymentMethod, setPaymentMethod] = useState('at_hotel');
  const [loading, setLoading] = useState(false);
  const [confirmation, setConfirmation] = useState(null);
  const [error, setError] = useState('');
  const [pollingSessionId, setPollingSessionId] = useState(null);

  const sessionId = searchParams.get('session_id');
  const cancelled = searchParams.get('cancelled');

  // Handle return from Stripe
  useEffect(() => {
    if (sessionId) {
      setStep(6);
      setPollingSessionId(sessionId);
    }
    if (cancelled) {
      setError('El pago fue cancelado. Puedes intentarlo de nuevo.');
      setStep(5);
    }
  }, [sessionId, cancelled]);

  // Poll payment status
  const pollPaymentStatus = useCallback(async (sid, attempts = 0) => {
    if (attempts >= 8) {
      setError('No se pudo confirmar el pago. Contáctanos si realizaste el cargo.');
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/public/checkout/status/${sid}`);
      const data = await res.json();
      if (data.status === 'paid' || data.payment_status === 'paid') {
        setConfirmation({ booking_ref: data.booking_ref, from_stripe: true });
        setPollingSessionId(null);
      } else if (data.status === 'expired') {
        setError('La sesión de pago expiró. Por favor intenta de nuevo.');
        setPollingSessionId(null);
      } else {
        setTimeout(() => pollPaymentStatus(sid, attempts + 1), 2500);
      }
    } catch {
      setTimeout(() => pollPaymentStatus(sid, attempts + 1), 2500);
    }
  }, []);

  useEffect(() => {
    if (pollingSessionId) pollPaymentStatus(pollingSessionId);
  }, [pollingSessionId, pollPaymentStatus]);

  const nights = dates.checkIn && dates.checkOut
    ? Math.max(0, (new Date(dates.checkOut) - new Date(dates.checkIn)) / 86400000) : 0;

  const calcExtrasTotal = () => {
    let t = 0;
    if (extras.desayuno) t += 200 * guests.adults * nights;
    return t;
  };

  const totalPrice = selectedRoom ? (selectedRoom.price_per_night * nights) + calcExtrasTotal() : 0;

  const fetchAvailability = async () => {
    setLoadingAvail(true); setError('');
    try {
      const res = await fetch(`${API_BASE}/public/availability?check_in=${dates.checkIn}&check_out=${dates.checkOut}&adults=${guests.adults}`);
      const data = await res.json();
      setAvailability(data);
      setStep(2);
    } catch { setError('Error al verificar disponibilidad.'); }
    finally { setLoadingAvail(false); }
  };

  const handleConfirmBooking = async () => {
    setLoading(true); setError('');
    const body = {
      check_in_date: dates.checkIn, check_out_date: dates.checkOut,
      adults: guests.adults, children: guests.children,
      room_type: selectedRoom.type, extras,
      first_name: guestInfo.first_name, last_name: guestInfo.last_name,
      email: guestInfo.email, phone: guestInfo.phone,
      id_number: guestInfo.id_number || null,
      event_name: guestInfo.event_name || null,
      payment_method: paymentMethod,
    };
    try {
      if (paymentMethod === 'at_hotel') {
        const res = await fetch(`${API_BASE}/public/booking/create`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (!res.ok) { const e = await res.json(); throw new Error(e.detail || 'Error'); }
        const data = await res.json();
        setConfirmation(data);
        setStep(6);
      } else {
        const pendingRes = await fetch(`${API_BASE}/public/booking/pending`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
        });
        if (!pendingRes.ok) { const e = await pendingRes.json(); throw new Error(e.detail || 'Error'); }
        const pending = await pendingRes.json();
        const sessionRes = await fetch(`${API_BASE}/public/checkout/session`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ pending_id: pending.pending_id, origin_url: window.location.origin }),
        });
        if (!sessionRes.ok) throw new Error('Error al crear sesión de pago');
        const session = await sessionRes.json();
        window.location.href = session.url;
      }
    } catch (e) { setError(e.message || 'Error al confirmar la reserva'); }
    finally { setLoading(false); }
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="min-h-screen" style={{ background: '#faf8f3', fontFamily: 'Montserrat, sans-serif' }}>
      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between sticky top-0 z-10 shadow-sm" style={{ background: 'white', borderBottom: '1px solid #e8dfd5' }}>
        <Link to="/catalogo" className="flex items-center gap-3" style={{ textDecoration: 'none' }}>
          <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ border: '1px solid rgba(98,87,70,0.3)' }}>
            <span style={{ fontFamily: 'Georgia, serif', color: '#625746', fontSize: '14px', fontStyle: 'italic' }}>ab</span>
          </div>
          <div>
            <span style={{ fontFamily: 'Georgia, serif', color: '#625746', fontSize: '18px', letterSpacing: '0.05em' }}>alma</span>
            <span style={{ color: '#917a6a', fontSize: '10px', letterSpacing: '0.18em', fontFamily: 'Montserrat, sans-serif', fontWeight: 500, marginLeft: '6px' }}>HOTEL BOUTIQUE</span>
          </div>
        </Link>
        <div className="flex items-center gap-4">
          <Link to="/mi-reserva" style={{ color: '#917a6a', fontSize: '13px', fontWeight: 500, textDecoration: 'none' }}>
            Consultar reserva
          </Link>
          <span style={{ color: '#917a6a', fontSize: '13px', fontWeight: 500 }}>Reservaciones en línea</span>
        </div>
      </div>

      {/* Main */}
      <div className="max-w-2xl mx-auto px-4 py-10">
        {step < 6 && <StepIndicator step={step} />}

        {/* Error */}
        {error && (
          <div className="mb-6 p-4 rounded-xl flex items-start gap-3" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
            <X size={16} style={{ color: '#ef4444', marginTop: 2, flexShrink: 0 }} />
            <p style={{ color: '#dc2626', fontSize: '13px' }}>{error}</p>
          </div>
        )}

        {/* STEP 1: Dates & Guests */}
        {step === 1 && (
          <div className="bg-white rounded-2xl shadow-sm p-8" style={{ border: '1px solid #e8dfd5' }}>
            <h2 style={{ fontFamily: 'Georgia, serif', color: '#625746', fontSize: '28px', fontWeight: 400, marginBottom: 6 }}>¿Cuándo nos visitas?</h2>
            <p style={{ color: '#917a6a', fontSize: '13px', marginBottom: 28 }}>Selecciona tus fechas y número de huéspedes</p>
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-2 tracking-wider" style={{ color: '#917a6a' }}>CHECK-IN</label>
                  <div className="relative">
                    <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#d2c7b6' }} />
                    <input type="date" value={dates.checkIn} min={today}
                      onChange={e => { setDates({ checkIn: e.target.value, checkOut: dates.checkOut < e.target.value ? '' : dates.checkOut }); setSelectedRoom(null); }}
                      className="w-full pl-9 pr-3 py-3 rounded-xl text-sm focus:outline-none"
                      style={{ border: '1px solid #d2c7b6', fontFamily: 'Montserrat, sans-serif', color: '#625746' }}
                      data-testid="checkin-input" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-2 tracking-wider" style={{ color: '#917a6a' }}>CHECK-OUT</label>
                  <div className="relative">
                    <Calendar size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#d2c7b6' }} />
                    <input type="date" value={dates.checkOut} min={dates.checkIn || today}
                      onChange={e => { setDates({ ...dates, checkOut: e.target.value }); setSelectedRoom(null); }}
                      className="w-full pl-9 pr-3 py-3 rounded-xl text-sm focus:outline-none"
                      style={{ border: '1px solid #d2c7b6', fontFamily: 'Montserrat, sans-serif', color: '#625746' }}
                      data-testid="checkout-input" />
                  </div>
                </div>
              </div>
              {nights > 0 && (
                <p className="text-center text-sm font-medium" style={{ color: '#917a6a' }}>
                  {nights} noche{nights !== 1 ? 's' : ''}
                </p>
              )}
              <div className="pt-2 border-t" style={{ borderColor: '#f0e8dc' }}>
                <label className="block text-xs font-semibold mb-4 tracking-wider" style={{ color: '#917a6a' }}>HUÉSPEDES</label>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Users size={16} style={{ color: '#917a6a' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#625746' }}>Adultos</p>
                      <p className="text-xs" style={{ color: '#c8b8a8' }}>Mayores de 12 años</p>
                    </div>
                  </div>
                  <Counter value={guests.adults} onChange={v => setGuests({ ...guests, adults: v })} min={1} max={4} />
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Users size={16} style={{ color: '#917a6a' }} />
                    <div>
                      <p className="text-sm font-medium" style={{ color: '#625746' }}>Niños</p>
                      <p className="text-xs" style={{ color: '#c8b8a8' }}>Menores de 12 años</p>
                    </div>
                  </div>
                  <Counter value={guests.children} onChange={v => setGuests({ ...guests, children: v })} min={0} max={4} />
                </div>
              </div>
              <button data-testid="check-availability-btn"
                onClick={fetchAvailability}
                disabled={!dates.checkIn || !dates.checkOut || nights <= 0 || loadingAvail}
                className="w-full py-4 rounded-xl font-semibold text-sm transition-all disabled:opacity-50"
                style={{ background: '#625746', color: '#fcf5e0', letterSpacing: '0.05em' }}>
                {loadingAvail ? 'Verificando...' : 'Buscar disponibilidad'} {!loadingAvail && <ChevronRight size={16} className="inline ml-1" />}
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: Room Selection */}
        {step === 2 && (
          <div>
            <h2 style={{ fontFamily: 'Georgia, serif', color: '#625746', fontSize: '28px', fontWeight: 400, marginBottom: 6 }}>Elige tu habitación</h2>
            <p style={{ color: '#917a6a', fontSize: '13px', marginBottom: 24 }}>
              {dates.checkIn} → {dates.checkOut} · {nights} noche{nights !== 1 ? 's' : ''} · {guests.adults} adulto{guests.adults !== 1 ? 's' : ''}
            </p>
            <div className="space-y-4">
              {availability.map(room => (
                <div key={room.type} data-testid={`room-option-${room.type}`}
                  className={`bg-white rounded-2xl overflow-hidden transition-all cursor-pointer ${!room.available ? 'opacity-50 pointer-events-none' : ''}`}
                  style={{ border: selectedRoom?.type === room.type ? '2px solid #625746' : '1px solid #e8dfd5', boxShadow: selectedRoom?.type === room.type ? '0 0 0 3px rgba(98,87,70,0.1)' : 'none' }}
                  onClick={() => room.available && setSelectedRoom(room)}>
                  <div className="flex">
                    <div className="w-36 sm:w-48 flex-shrink-0 relative" style={{ height: 160 }}>
                      <img src={ROOM_IMAGES[room.type]} alt={room.label} className="w-full h-full object-cover" />
                      {!room.available && (
                        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
                          <span className="text-white text-xs font-semibold">No disponible</span>
                        </div>
                      )}
                    </div>
                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <h3 style={{ fontFamily: 'Georgia, serif', color: '#625746', fontSize: '20px', fontWeight: 400 }}>{room.label}</h3>
                            <p style={{ color: '#917a6a', fontSize: '12px' }}>{room.available_count} disponible{room.available_count !== 1 ? 's' : ''}</p>
                          </div>
                          {selectedRoom?.type === room.type && (
                            <div className="w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#625746' }}>
                              <Check size={12} color="white" />
                            </div>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-1 mt-3">
                          {ROOM_AMENITIES[room.type].slice(0, 4).map((a, i) => (
                            <div key={i} className="flex items-center gap-1 px-2 py-1 rounded-full text-xs" style={{ background: '#f5ede2', color: '#917a6a' }}>
                              <a.icon size={11} strokeWidth={1.5} />{a.text}
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3">
                        <span style={{ color: '#625746', fontSize: '18px', fontWeight: 700 }}>${room.price_per_night.toLocaleString('es-MX')}</span>
                        <span style={{ color: '#917a6a', fontSize: '12px' }}> MXN/noche · total ${room.total_price.toLocaleString('es-MX')} MXN</span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => setStep(1)} className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all" style={{ border: '1px solid #d2c7b6', color: '#625746', background: 'white' }}>
                <ChevronLeft size={16} /> Atrás
              </button>
              <button data-testid="continue-room-btn" onClick={() => setStep(3)} disabled={!selectedRoom}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: '#625746', color: '#fcf5e0' }}>
                Continuar <ChevronRight size={16} className="inline ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Extras */}
        {step === 3 && (
          <div>
            <h2 style={{ fontFamily: 'Georgia, serif', color: '#625746', fontSize: '28px', fontWeight: 400, marginBottom: 6 }}>Personaliza tu estancia</h2>
            <p style={{ color: '#917a6a', fontSize: '13px', marginBottom: 24 }}>Agrega servicios adicionales para una experiencia completa</p>
            <div className="space-y-3 mb-4">
              {EXTRAS.map(ex => (
                <div key={ex.key} data-testid={`extra-${ex.key}`}
                  className="bg-white rounded-xl p-5 flex items-center gap-4 cursor-pointer transition-all"
                  style={{ border: extras[ex.key] ? '2px solid #625746' : '1px solid #e8dfd5', boxShadow: extras[ex.key] ? '0 0 0 3px rgba(98,87,70,0.1)' : 'none' }}
                  onClick={() => setExtras({ ...extras, [ex.key]: !extras[ex.key] })}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: extras[ex.key] ? '#625746' : '#f5ede2' }}>
                    <ex.icon size={18} style={{ color: extras[ex.key] ? '#fcf5e0' : '#917a6a' }} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm" style={{ color: '#625746' }}>{ex.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#917a6a' }}>{ex.desc}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold" style={{ color: '#625746' }}>{ex.priceLabel}</p>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center mt-1 ml-auto transition-all`}
                      style={{ borderColor: extras[ex.key] ? '#625746' : '#d2c7b6', background: extras[ex.key] ? '#625746' : 'transparent' }}>
                      {extras[ex.key] && <Check size={11} color="white" />}
                    </div>
                  </div>
                </div>
              ))}
              {/* Personalizado card */}
              <div className="bg-white rounded-xl p-5" style={{ border: '1px solid #e8dfd5' }}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: '#f5ede2' }}>
                    <Phone size={18} style={{ color: '#917a6a' }} strokeWidth={1.5} />
                  </div>
                  <div>
                    <p className="font-semibold text-sm" style={{ color: '#625746' }}>Solicitud personalizada</p>
                    <p className="text-xs mt-0.5" style={{ color: '#917a6a' }}>¿Deseas algo especial? Contáctanos para una cotización</p>
                    <a href="tel:+52XXXXXXXXXX" className="text-xs font-semibold mt-1 inline-block" style={{ color: '#625746' }}>
                      +52 (000) 000-0000
                    </a>
                  </div>
                </div>
              </div>
            </div>
            {calcExtrasTotal() > 0 && (
              <p className="text-sm text-center mb-4" style={{ color: '#917a6a' }}>
                Extras: +${calcExtrasTotal().toLocaleString('es-MX')} MXN
              </p>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold" style={{ border: '1px solid #d2c7b6', color: '#625746', background: 'white' }}>
                <ChevronLeft size={16} /> Atrás
              </button>
              <button data-testid="continue-extras-btn" onClick={() => setStep(4)} className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{ background: '#625746', color: '#fcf5e0' }}>
                Continuar <ChevronRight size={16} className="inline ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: Guest Info */}
        {step === 4 && (
          <div>
            <h2 style={{ fontFamily: 'Georgia, serif', color: '#625746', fontSize: '28px', fontWeight: 400, marginBottom: 6 }}>Tus datos</h2>
            <p style={{ color: '#917a6a', fontSize: '13px', marginBottom: 24 }}>Para confirmar tu reserva necesitamos algunos datos</p>
            <div className="bg-white rounded-2xl p-6 space-y-4" style={{ border: '1px solid #e8dfd5' }}>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-2 tracking-wider" style={{ color: '#917a6a' }}>NOMBRE *</label>
                  <input value={guestInfo.first_name} onChange={e => setGuestInfo({ ...guestInfo, first_name: e.target.value })}
                    placeholder="Juan" className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                    style={{ border: '1px solid #d2c7b6', fontFamily: 'Montserrat, sans-serif', color: '#625746' }}
                    data-testid="guest-first-name" />
                </div>
                <div>
                  <label className="block text-xs font-semibold mb-2 tracking-wider" style={{ color: '#917a6a' }}>APELLIDO *</label>
                  <input value={guestInfo.last_name} onChange={e => setGuestInfo({ ...guestInfo, last_name: e.target.value })}
                    placeholder="García" className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                    style={{ border: '1px solid #d2c7b6', fontFamily: 'Montserrat, sans-serif', color: '#625746' }}
                    data-testid="guest-last-name" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2 tracking-wider" style={{ color: '#917a6a' }}>EMAIL *</label>
                <input type="email" value={guestInfo.email} onChange={e => setGuestInfo({ ...guestInfo, email: e.target.value })}
                  placeholder="juan@ejemplo.com" className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                  style={{ border: '1px solid #d2c7b6', fontFamily: 'Montserrat, sans-serif', color: '#625746' }}
                  data-testid="guest-email" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2 tracking-wider" style={{ color: '#917a6a' }}>TELÉFONO *</label>
                <input type="tel" value={guestInfo.phone} onChange={e => setGuestInfo({ ...guestInfo, phone: e.target.value })}
                  placeholder="+52 555 123 4567" className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                  style={{ border: '1px solid #d2c7b6', fontFamily: 'Montserrat, sans-serif', color: '#625746' }}
                  data-testid="guest-phone" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2 tracking-wider" style={{ color: '#917a6a' }}>N° DE DOCUMENTO <span style={{ color: '#c8b8a8', fontWeight: 400, letterSpacing: 0 }}>(opcional)</span></label>
                <input value={guestInfo.id_number} onChange={e => setGuestInfo({ ...guestInfo, id_number: e.target.value })}
                  placeholder="INE, Pasaporte..." className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                  style={{ border: '1px solid #d2c7b6', fontFamily: 'Montserrat, sans-serif', color: '#625746' }}
                  data-testid="guest-id" />
              </div>
              <div>
                <label className="block text-xs font-semibold mb-2 tracking-wider" style={{ color: '#917a6a' }}>¿VIENES POR ALGÚN EVENTO? <span style={{ color: '#c8b8a8', fontWeight: 400, letterSpacing: 0 }}>(opcional)</span></label>
                <input value={guestInfo.event_name} onChange={e => setGuestInfo({ ...guestInfo, event_name: e.target.value })}
                  placeholder="Ej: Boda García-López, Cumpleaños González..." className="w-full px-4 py-3 rounded-xl text-sm focus:outline-none"
                  style={{ border: '1px solid #d2c7b6', fontFamily: 'Montserrat, sans-serif', color: '#625746' }}
                  data-testid="guest-event" />
              </div>
            </div>
            <div className="flex gap-3 mt-5">
              <button onClick={() => setStep(3)} className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold" style={{ border: '1px solid #d2c7b6', color: '#625746', background: 'white' }}>
                <ChevronLeft size={16} /> Atrás
              </button>
              <button data-testid="continue-guest-btn"
                onClick={() => {
                  if (!guestInfo.first_name || !guestInfo.last_name || !guestInfo.email || !guestInfo.phone) {
                    setError('Por favor completa todos los campos requeridos');
                    return;
                  }
                  setError(''); setStep(5);
                }}
                className="flex-1 py-3 rounded-xl text-sm font-semibold" style={{ background: '#625746', color: '#fcf5e0' }}>
                Continuar <ChevronRight size={16} className="inline ml-1" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 5: Payment & Summary */}
        {step === 5 && (
          <div>
            <h2 style={{ fontFamily: 'Georgia, serif', color: '#625746', fontSize: '28px', fontWeight: 400, marginBottom: 6 }}>Resumen y pago</h2>
            <p style={{ color: '#917a6a', fontSize: '13px', marginBottom: 24 }}>Revisa tu reserva y elige cómo pagar</p>
            {/* Summary */}
            <div className="bg-white rounded-2xl p-6 mb-5" style={{ border: '1px solid #e8dfd5' }}>
              <p className="text-xs font-semibold tracking-wider mb-4" style={{ color: '#917a6a' }}>RESUMEN DE RESERVA</p>
              <div className="flex gap-4 items-center mb-5">
                <img src={ROOM_IMAGES[selectedRoom?.type]} alt="room" className="w-16 h-16 object-cover rounded-xl flex-shrink-0" />
                <div>
                  <p className="font-semibold text-sm" style={{ color: '#625746' }}>{selectedRoom?.type === 'junior_suite' ? 'Junior Suite' : 'Habitación Doble'}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#917a6a' }}>{dates.checkIn} → {dates.checkOut} · {nights} noche{nights !== 1 ? 's' : ''}</p>
                  <p className="text-xs mt-0.5" style={{ color: '#917a6a' }}>{guests.adults} adulto{guests.adults !== 1 ? 's' : ''}{guests.children ? `, ${guests.children} niño${guests.children !== 1 ? 's' : ''}` : ''}</p>
                </div>
              </div>
              <div className="space-y-2 py-4 border-t border-b" style={{ borderColor: '#f0e8dc' }}>
                <div className="flex justify-between text-sm">
                  <span style={{ color: '#917a6a' }}>Habitación ({nights} noches)</span>
                  <span style={{ color: '#625746', fontWeight: 600 }}>${(selectedRoom?.price_per_night * nights).toLocaleString('es-MX')} MXN</span>
                </div>
                {extras.desayuno && <div className="flex justify-between text-sm"><span style={{ color: '#917a6a' }}>Desayuno</span><span style={{ color: '#625746', fontWeight: 600 }}>${(200 * guests.adults * nights).toLocaleString('es-MX')} MXN</span></div>}
                {extras.early_checkin && <div className="flex justify-between text-sm"><span style={{ color: '#917a6a' }}>Early Check-in</span><span style={{ color: '#625746', fontWeight: 600 }}>$300 MXN</span></div>}
                {extras.late_checkout && <div className="flex justify-between text-sm"><span style={{ color: '#917a6a' }}>Late Check-out</span><span style={{ color: '#625746', fontWeight: 600 }}>$300 MXN</span></div>}
              </div>
              <div className="flex justify-between items-center mt-4">
                <span className="font-bold" style={{ color: '#625746', fontSize: '15px' }}>Total</span>
                <span className="font-bold" style={{ color: '#625746', fontSize: '22px' }}>${totalPrice.toLocaleString('es-MX')} MXN</span>
              </div>
            </div>
            {/* Payment method */}
            <div className="bg-white rounded-2xl p-6 mb-5" style={{ border: '1px solid #e8dfd5' }}>
              <p className="text-xs font-semibold tracking-wider mb-4" style={{ color: '#917a6a' }}>MÉTODO DE PAGO</p>
              <div className="space-y-3">
                <div data-testid="pay-at-hotel-option"
                  className="flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all"
                  style={{ border: paymentMethod === 'at_hotel' ? '2px solid #625746' : '1px solid #e8dfd5', background: paymentMethod === 'at_hotel' ? 'rgba(98,87,70,0.04)' : 'white' }}
                  onClick={() => setPaymentMethod('at_hotel')}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: paymentMethod === 'at_hotel' ? '#625746' : '#f5ede2' }}>
                    <Building2 size={18} style={{ color: paymentMethod === 'at_hotel' ? '#fcf5e0' : '#917a6a' }} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm" style={{ color: '#625746' }}>Pagar en el hotel</p>
                    <p className="text-xs mt-0.5" style={{ color: '#917a6a' }}>Confirma tu reserva ahora y paga al llegar</p>
                  </div>
                  <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: paymentMethod === 'at_hotel' ? '#625746' : '#d2c7b6', background: paymentMethod === 'at_hotel' ? '#625746' : 'transparent' }}>
                    {paymentMethod === 'at_hotel' && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </div>
                <div data-testid="pay-online-option"
                  className="flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all"
                  style={{ border: paymentMethod === 'online' ? '2px solid #625746' : '1px solid #e8dfd5', background: paymentMethod === 'online' ? 'rgba(98,87,70,0.04)' : 'white' }}
                  onClick={() => setPaymentMethod('online')}>
                  <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: paymentMethod === 'online' ? '#625746' : '#f5ede2' }}>
                    <CreditCard size={18} style={{ color: paymentMethod === 'online' ? '#fcf5e0' : '#917a6a' }} strokeWidth={1.5} />
                  </div>
                  <div className="flex-1">
                    <p className="font-semibold text-sm" style={{ color: '#625746' }}>Pagar en línea</p>
                    <p className="text-xs mt-0.5" style={{ color: '#917a6a' }}>Pago seguro con tarjeta vía Stripe</p>
                  </div>
                  <div className="w-5 h-5 rounded-full border-2 flex items-center justify-center" style={{ borderColor: paymentMethod === 'online' ? '#625746' : '#d2c7b6', background: paymentMethod === 'online' ? '#625746' : 'transparent' }}>
                    {paymentMethod === 'online' && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(4)} className="flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold" style={{ border: '1px solid #d2c7b6', color: '#625746', background: 'white' }}>
                <ChevronLeft size={16} /> Atrás
              </button>
              <button data-testid="confirm-booking-btn" onClick={handleConfirmBooking} disabled={loading}
                className="flex-1 py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-60"
                style={{ background: '#625746', color: '#fcf5e0' }}>
                {loading ? 'Procesando...' : paymentMethod === 'online' ? 'Ir a pagar' : 'Confirmar reserva'}
                {!loading && <ChevronRight size={16} className="inline ml-1" />}
              </button>
            </div>
          </div>
        )}

        {/* STEP 6: Confirmation */}
        {step === 6 && (
          <div>
            {!confirmation && pollingSessionId && (
              <div className="bg-white rounded-2xl p-10 text-center" style={{ border: '1px solid #e8dfd5' }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: '#f5ede2' }}>
                  <CreditCard size={28} style={{ color: '#917a6a' }} strokeWidth={1.5} />
                </div>
                <h2 style={{ fontFamily: 'Georgia, serif', color: '#625746', fontSize: '24px', fontWeight: 400, marginBottom: 8 }}>Verificando pago...</h2>
                <p style={{ color: '#917a6a', fontSize: '14px' }}>Estamos confirmando tu pago. Un momento, por favor.</p>
                <div className="flex justify-center gap-1 mt-6">
                  {[0, 1, 2].map(i => (
                    <div key={i} className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#917a6a', animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}
            {confirmation && (
              <div className="bg-white rounded-2xl overflow-hidden" style={{ border: '1px solid #e8dfd5' }}>
                <div className="py-10 px-8 text-center" style={{ background: 'linear-gradient(135deg, #625746, #917a6a)' }}>
                  <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: 'rgba(252,245,224,0.2)' }}>
                    <Check size={32} color="#fcf5e0" strokeWidth={2} />
                  </div>
                  <p style={{ color: '#d2c7b6', fontSize: '11px', letterSpacing: '0.3em', marginBottom: 8 }}>ALMA HOTEL BOUTIQUE</p>
                  <h2 style={{ fontFamily: 'Georgia, serif', color: '#fcf5e0', fontSize: '30px', fontWeight: 300, marginBottom: 8 }}>¡Reserva confirmada!</h2>
                  <p style={{ color: 'rgba(210,199,182,0.85)', fontSize: '13px' }}>Referencia: <strong style={{ color: '#fcf5e0' }}>#{confirmation.booking_ref}</strong></p>
                </div>
                <div className="p-8">
                  {confirmation.room_number && (
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      {[
                        ['Habitación', `#${confirmation.room_number} · ${confirmation.room_type === 'junior_suite' ? 'Junior Suite' : 'Doble'}`],
                        ['Noches', confirmation.nights || nights],
                        ['Check-in', confirmation.check_in_date || dates.checkIn],
                        ['Check-out', confirmation.check_out_date || dates.checkOut],
                      ].map(([k, v]) => (
                        <div key={k} className="text-center p-3 rounded-xl" style={{ background: '#faf8f3' }}>
                          <p className="text-xs mb-1" style={{ color: '#917a6a' }}>{k}</p>
                          <p className="font-semibold text-sm" style={{ color: '#625746' }}>{v}</p>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="text-center p-4 rounded-xl mb-6" style={{ background: '#f5ede2' }}>
                    <p className="text-xs mb-1" style={{ color: '#917a6a' }}>Total</p>
                    <p className="font-bold text-xl" style={{ color: '#625746' }}>${(confirmation.total_amount || totalPrice).toLocaleString('es-MX')} MXN</p>
                  </div>
                  <p className="text-sm text-center mb-6 leading-relaxed" style={{ color: '#917a6a' }}>
                    Hemos enviado un email de confirmación a <strong>{guestInfo.email}</strong>.<br />
                    Si tienes alguna consulta, no dudes en contactarnos.
                  </p>
                  <Link to="/catalogo" className="block w-full py-3 rounded-xl text-sm font-semibold text-center transition-all"
                    style={{ background: '#625746', color: '#fcf5e0', textDecoration: 'none' }}>
                    Volver al inicio
                  </Link>
                  <Link to="/mi-reserva" className="block w-full py-2.5 rounded-xl text-sm font-medium text-center mt-2 transition-all"
                    style={{ border: '1px solid #d2c7b6', color: '#917a6a', textDecoration: 'none' }}>
                    Consultar mi reserva
                  </Link>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
