import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { CheckCircle, XCircle, Clock, Layers, ArrowLeft } from 'lucide-react';

export default function CheckoutStatus() {
  const { session_id } = useParams();
  const navigate = useNavigate();
  const [state, setState] = useState('loading'); // loading | paid | pending | error
  const [bookingRef, setBookingRef] = useState(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!session_id) { setState('error'); setErrorMsg('Sesión no encontrada.'); return; }
    api.get(`/public/checkout/status/${session_id}`)
      .then((r) => {
        if (r.data.status === 'paid') {
          setBookingRef(r.data.booking_ref);
          setState('paid');
        } else {
          setState('pending');
        }
      })
      .catch((err) => {
        const detail = err.response?.data?.detail;
        if (err.response?.status === 404) {
          setErrorMsg('No encontramos esta transacción. Verifica el enlace o contacta soporte.');
        } else if (err.response?.status === 503) {
          setErrorMsg('El servicio de pagos no está disponible en este momento.');
        } else {
          setErrorMsg(detail || 'Ocurrió un error al consultar el estado del pago.');
        }
        setState('error');
      });
  }, [session_id]);

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #1a1410 0%, #2d2318 40%, #3d3020 70%, #4a3d30 100%)' }}
    >
      <div className="w-full max-w-md fade-in">
        <div className="text-center mb-8">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: 'rgba(252,245,224,0.1)', border: '1px solid rgba(252,245,224,0.2)' }}
          >
            <Layers size={24} style={{ color: '#fcf5e0' }} strokeWidth={1.5} />
          </div>
          <h1 style={{ fontFamily: 'Manrope, sans-serif', color: '#fcf5e0', fontSize: '36px', fontWeight: 800, letterSpacing: '0.15em', lineHeight: 1 }}>STAYLO</h1>
          <p style={{ color: '#917a6a', fontSize: '10px', letterSpacing: '0.22em', fontFamily: 'Montserrat, sans-serif', fontWeight: 500, marginTop: '7px', textTransform: 'uppercase' }}>Hospitality Operations Platform</p>
        </div>

        <div className="rounded-2xl shadow-2xl p-8" style={{ background: '#ffffff', border: '1px solid #e8e0d4' }}>
          {state === 'loading' && (
            <div className="text-center py-4">
              <div className="w-10 h-10 border-2 border-[#625746] border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-sm" style={{ color: '#917a6a', fontFamily: 'Montserrat, sans-serif' }}>Verificando pago...</p>
            </div>
          )}

          {state === 'paid' && (
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#f0faf4', border: '1px solid #bbf0d0' }}>
                <CheckCircle size={28} style={{ color: '#2d7a4f' }} strokeWidth={1.5} />
              </div>
              <h2 className="text-lg font-semibold mb-1" style={{ color: '#625746', fontFamily: 'Montserrat, sans-serif' }}>
                ¡Pago confirmado!
              </h2>
              <p className="text-sm mb-4" style={{ color: '#917a6a', fontFamily: 'Montserrat, sans-serif', lineHeight: 1.6 }}>
                Tu reserva ha sido procesada exitosamente.
              </p>
              {bookingRef && (
                <div className="rounded-xl px-4 py-3 mb-5" style={{ background: '#f0faf4', border: '1px solid #bbf0d0' }}>
                  <p className="text-xs uppercase tracking-wide mb-1" style={{ color: '#2d7a4f', fontFamily: 'Montserrat, sans-serif', fontWeight: 600 }}>
                    Número de reserva
                  </p>
                  <p className="text-2xl font-bold tracking-widest" style={{ color: '#1a5c38', fontFamily: 'Manrope, sans-serif' }}>
                    {bookingRef}
                  </p>
                </div>
              )}
              <p className="text-xs mb-5" style={{ color: '#b8a898', fontFamily: 'Montserrat, sans-serif', lineHeight: 1.6 }}>
                Recibirás una confirmación por correo electrónico con los detalles de tu estadía.
              </p>
              <button
                onClick={() => navigate('/mi-reserva')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{ background: '#625746', color: '#fcf5e0', fontFamily: 'Montserrat, sans-serif', letterSpacing: '0.05em' }}
                onMouseEnter={e => e.currentTarget.style.background = '#4d4238'}
                onMouseLeave={e => e.currentTarget.style.background = '#625746'}
              >
                Ver mi reserva
              </button>
            </div>
          )}

          {state === 'pending' && (
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
                <Clock size={28} style={{ color: '#b45309' }} strokeWidth={1.5} />
              </div>
              <h2 className="text-base font-semibold mb-2" style={{ color: '#625746', fontFamily: 'Montserrat, sans-serif' }}>
                Pago en proceso
              </h2>
              <p className="text-sm mb-5" style={{ color: '#917a6a', fontFamily: 'Montserrat, sans-serif', lineHeight: 1.6 }}>
                Tu pago aún no ha sido confirmado por el proveedor. Esto puede tardar unos minutos. Si ya realizaste el pago, vuelve a consultar en breve.
              </p>
              <button
                onClick={() => { setState('loading'); api.get(`/public/checkout/status/${session_id}`).then(r => { if (r.data.status === 'paid') { setBookingRef(r.data.booking_ref); setState('paid'); } else { setState('pending'); } }).catch(() => setState('pending')); }}
                className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all mb-3"
                style={{ background: '#625746', color: '#fcf5e0', fontFamily: 'Montserrat, sans-serif', letterSpacing: '0.05em' }}
                onMouseEnter={e => e.currentTarget.style.background = '#4d4238'}
                onMouseLeave={e => e.currentTarget.style.background = '#625746'}
              >
                Verificar nuevamente
              </button>
            </div>
          )}

          {state === 'error' && (
            <div className="text-center py-2">
              <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
                <XCircle size={28} style={{ color: '#b91c1c' }} strokeWidth={1.5} />
              </div>
              <h2 className="text-base font-semibold mb-2" style={{ color: '#625746', fontFamily: 'Montserrat, sans-serif' }}>
                No pudimos verificar tu pago
              </h2>
              <p className="text-sm mb-5" style={{ color: '#917a6a', fontFamily: 'Montserrat, sans-serif', lineHeight: 1.6 }}>
                {errorMsg}
              </p>
              <button
                onClick={() => navigate('/mi-reserva')}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{ background: '#faf6f1', border: '1px solid #e8dfd5', color: '#625746', fontFamily: 'Montserrat, sans-serif' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5ede0'}
                onMouseLeave={e => e.currentTarget.style.background = '#faf6f1'}
              >
                <ArrowLeft size={14} />
                Consultar reserva
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
