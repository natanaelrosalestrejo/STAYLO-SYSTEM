import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import { getDefaultPathForRole } from '../utils/permissions';
import { toast } from 'sonner';
import { Eye, EyeOff, Lock, Mail, Layers } from 'lucide-react';

const DEMO_ACCOUNTS = [
  { email: 'platform@almasystem.com', password: 'platform123', role: 'Platform Admin' },
  { email: 'admin@hotel.com', password: 'admin123', role: 'Gerente operativo (grupo)' },
  { email: 'owner@hotel.com', password: 'owner123', role: 'Owner' },
  { email: 'maria@hotel.com', password: 'recep123', role: 'Recepción' },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) { toast.error('Completa todos los campos'); return; }
    setLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      login(res.data.access_token, res.data.user);
      toast.success(`Bienvenido, ${res.data.user.name}`);
      const role = res.data.user.role;
      if (role === 'platform_admin') navigate('/platform-admin');
      else navigate(getDefaultPathForRole(res.data.user));
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Credenciales incorrectas');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4"
      style={{ background: 'linear-gradient(135deg, #1a1410 0%, #2d2318 40%, #3d3020 70%, #4a3d30 100%)' }}>
      <div className="w-full max-w-md fade-in">
        {/* Branding */}
        <div className="text-center mb-8">
          <div className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-5"
            style={{ background: 'rgba(252,245,224,0.1)', border: '1px solid rgba(252,245,224,0.2)' }}>
            <Layers size={24} style={{ color: '#fcf5e0' }} strokeWidth={1.5} />
          </div>
          <h1 style={{ fontFamily: 'Manrope, sans-serif', color: '#fcf5e0', fontSize: '36px', fontWeight: 800, letterSpacing: '0.15em', lineHeight: 1 }}>STAYLO</h1>
          <p style={{ color: '#917a6a', fontSize: '10px', letterSpacing: '0.22em', fontFamily: 'Montserrat, sans-serif', fontWeight: 500, marginTop: '7px', textTransform: 'uppercase' }}>Hospitality Operations Platform</p>
        </div>

        {/* Card */}
        <div className="rounded-2xl shadow-2xl p-8" style={{ background: '#ffffff', border: '1px solid #e8e0d4' }}>
          <h2 className="text-lg font-semibold mb-6" style={{ color: '#625746', fontFamily: 'Montserrat, sans-serif' }}>Iniciar sesión</h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: '#917a6a', fontFamily: 'Montserrat, sans-serif' }}>Correo</label>
              <div className="relative">
                <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#d2c7b6' }} />
                <input
                  data-testid="login-email"
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
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide" style={{ color: '#917a6a', fontFamily: 'Montserrat, sans-serif' }}>Contraseña</label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#d2c7b6' }} />
                <input
                  data-testid="login-password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-9 pr-10 py-2.5 rounded-lg text-sm transition-all outline-none"
                  style={{ border: '1px solid #e0d4c8', fontFamily: 'Montserrat, sans-serif', color: '#625746' }}
                  onFocus={e => e.target.style.borderColor = '#917a6a'}
                  onBlur={e => e.target.style.borderColor = '#e0d4c8'}
                />
                <button type="button" onClick={() => setShowPass(!showPass)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#d2c7b6' }}>
                  {showPass ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>
            <button
              data-testid="login-submit"
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg font-semibold text-sm transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              style={{ background: '#625746', color: '#fcf5e0', fontFamily: 'Montserrat, sans-serif', letterSpacing: '0.05em' }}
              onMouseEnter={e => !loading && (e.target.style.background = '#4d4238')}
              onMouseLeave={e => !loading && (e.target.style.background = '#625746')}
            >
              {loading ? <div className="w-4 h-4 border-2 border-[#fcf5e0] border-t-transparent rounded-full animate-spin" /> : null}
              {loading ? 'Ingresando...' : 'Ingresar'}
            </button>
          </form>

          {/* Demo accounts */}
          <div className="mt-6 pt-5" style={{ borderTop: '1px solid #f0e8dc' }}>
            <p className="text-xs font-semibold mb-3 uppercase tracking-wide" style={{ color: '#d2c7b6', fontFamily: 'Montserrat, sans-serif' }}>Cuentas demo</p>
            <div className="grid grid-cols-2 gap-2">
              {DEMO_ACCOUNTS.map(acc => (
                <button key={acc.email} data-testid={`demo-${acc.role.toLowerCase()}`}
                  onClick={() => { setEmail(acc.email); setPassword(acc.password); }}
                  className="text-left px-3 py-2 rounded-lg transition-colors"
                  style={{ background: '#faf6f1', border: '1px solid #e8dfd5' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f5ede0'}
                  onMouseLeave={e => e.currentTarget.style.background = '#faf6f1'}>
                  <p className="text-xs font-semibold" style={{ color: '#625746' }}>{acc.role}</p>
                  <p className="text-xs truncate" style={{ color: '#b8a898' }}>{acc.email}</p>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
