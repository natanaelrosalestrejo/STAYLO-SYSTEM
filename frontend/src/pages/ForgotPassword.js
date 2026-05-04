import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../utils/api';
import { toast } from 'sonner';
import { Mail, Layers, ArrowLeft } from 'lucide-react';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email) { toast.error('Ingresa tu correo electrónico'); return; }
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
    } catch {
      // Always show success — don't leak whether email exists
      setSent(true);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #1a1410 0%, #2d2318 40%, #3d3020 70%, #4a3d30 100%)' }}>
      <div className="w-full max-w-md fade-in">
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: 'rgba(252,245,224,0.1)', border: '1px solid rgba(252,245,224,0.2)' }}>
            <Layers size={24} style={{ color: '#fcf5e0' }} strokeWidth={1.5} />
          </div>
          <h1 style={{ fontFamily: 'Manrope, sans-serif', color: '#fcf5e0', fontSize: '36px', fontWeight: 800, letterSpacing: '0.15em', lineHeight: 1 }}>STAYLO</h1>
          <p style={{ color: '#917a6a', fontSize: '10px', letterSpacing: '0.22em', fontFamily: 'Montserrat, sans-serif', fontWeight: 500, marginTop: '7px', textTransform: 'uppercase' }}>Hospitality Operations Platform</p>
        </div>

        <div className="rounded-2xl shadow-2xl p-8" style={{ background: '#ffffff', border: '1px solid #e8e0d4' }}>
          {sent ? (
            <div className="text-center py-2">
              <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4"
                style={{ background: '#f0faf4', border: '1px solid #bbf0d0' }}>
                <Mail size={22} style={{ color: '#2d7a4f' }} strokeWidth={1.5} />
              </div>
              <h2 className="text-base font-semibold mb-2"
                style={{ color: '#625746', fontFamily: 'Montserrat, sans-serif' }}>
                Revisa tu correo
              </h2>
              <p className="text-sm mb-6"
                style={{ color: '#917a6a', fontFamily: 'Montserrat, sans-serif', lineHeight: 1.6 }}>
                Si el correo está registrado, recibirás un enlace para restablecer tu contraseña en los próximos minutos.
              </p>
              <button onClick={() => navigate('/login')}
                className="w-full py-2.5 rounded-lg text-sm font-semibold transition-all"
                style={{ background: '#faf6f1', border: '1px solid #e8dfd5', color: '#625746', fontFamily: 'Montserrat, sans-serif' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f5ede0'}
                onMouseLeave={e => e.currentTarget.style.background = '#faf6f1'}>
                Volver al inicio de sesión
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3 mb-5">
                <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: '#faf6f1', border: '1px solid #e8dfd5' }}>
                  <Mail size={18} style={{ color: '#625746' }} strokeWidth={1.5} />
                </div>
                <div>
                  <h2 className="text-base font-semibold"
                    style={{ color: '#625746', fontFamily: 'Montserrat, sans-serif' }}>
                    ¿Olvidaste tu contraseña?
                  </h2>
                  <p className="text-xs" style={{ color: '#b8a898', fontFamily: 'Montserrat, sans-serif' }}>
                    Te enviaremos un enlace de recuperación
                  </p>
                </div>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
                    style={{ color: '#917a6a', fontFamily: 'Montserrat, sans-serif' }}>
                    Correo electrónico
                  </label>
                  <div className="relative">
                    <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#d2c7b6' }} />
                    <input
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      placeholder="correo@hotel.com"
                      className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm transition-all outline-none"
                      style={{ border: '1px solid #e0d4c8', fontFamily: 'Montserrat, sans-serif', color: '#625746' }}
                      onFocus={e => e.target.style.borderColor = '#917a6a'}
                      onBlur={e => e.target.style.borderColor = '#e0d4c8'}
                    />
                  </div>
                </div>

                <button type="submit" disabled={loading}
                  className="w-full py-3 rounded-lg font-semibold text-sm transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
                  style={{ background: '#625746', color: '#fcf5e0', fontFamily: 'Montserrat, sans-serif', letterSpacing: '0.05em' }}
                  onMouseEnter={e => !loading && (e.currentTarget.style.background = '#4d4238')}
                  onMouseLeave={e => !loading && (e.currentTarget.style.background = '#625746')}>
                  {loading && <div className="w-4 h-4 border-2 border-[#fcf5e0] border-t-transparent rounded-full animate-spin" />}
                  {loading ? 'Enviando...' : 'Enviar enlace'}
                </button>
              </form>

              <button onClick={() => navigate('/login')}
                className="w-full mt-4 flex items-center justify-center gap-1.5 text-xs transition-all"
                style={{ color: '#b8a898', fontFamily: 'Montserrat, sans-serif', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.currentTarget.style.color = '#625746'}
                onMouseLeave={e => e.currentTarget.style.color = '#b8a898'}>
                <ArrowLeft size={13} />
                Volver al inicio de sesión
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
