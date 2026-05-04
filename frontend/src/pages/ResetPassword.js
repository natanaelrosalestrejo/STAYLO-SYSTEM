import { useState } from 'react';
import { useNavigate, useSearchParams, Navigate } from 'react-router-dom';
import api from '../utils/api';
import { toast } from 'sonner';
import { Eye, EyeOff, Lock, Layers, ShieldCheck } from 'lucide-react';

export default function ResetPassword() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [loading, setLoading] = useState(false);

  if (!token) return <Navigate to="/forgot-password" replace />;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (newPassword.length < 8) { toast.error('La contraseña debe tener al menos 8 caracteres'); return; }
    if (newPassword !== confirmPassword) { toast.error('Las contraseñas no coinciden'); return; }
    setLoading(true);
    try {
      await api.post('/auth/reset-password', { token, new_password: newPassword });
      toast.success('Contraseña actualizada. Inicia sesión.');
      navigate('/login', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.detail || 'El enlace es inválido o ya expiró');
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
          <div className="flex items-center gap-3 mb-4">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: '#faf6f1', border: '1px solid #e8dfd5' }}>
              <ShieldCheck size={18} style={{ color: '#625746' }} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-base font-semibold"
                style={{ color: '#625746', fontFamily: 'Montserrat, sans-serif' }}>
                Nueva contraseña
              </h2>
              <p className="text-xs" style={{ color: '#b8a898', fontFamily: 'Montserrat, sans-serif' }}>
                Elige una contraseña segura para tu cuenta
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
                style={{ color: '#917a6a', fontFamily: 'Montserrat, sans-serif' }}>
                Nueva contraseña
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#d2c7b6' }} />
                <input
                  type={showNew ? 'text' : 'password'}
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="Mínimo 8 caracteres"
                  className="w-full pl-9 pr-10 py-2.5 rounded-lg text-sm transition-all outline-none"
                  style={{ border: '1px solid #e0d4c8', fontFamily: 'Montserrat, sans-serif', color: '#625746' }}
                  onFocus={e => e.target.style.borderColor = '#917a6a'}
                  onBlur={e => e.target.style.borderColor = '#e0d4c8'}
                />
                <button type="button" onClick={() => setShowNew(!showNew)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#d2c7b6' }}>
                  {showNew ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold mb-1.5 uppercase tracking-wide"
                style={{ color: '#917a6a', fontFamily: 'Montserrat, sans-serif' }}>
                Confirmar contraseña
              </label>
              <div className="relative">
                <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#d2c7b6' }} />
                <input
                  type={showConfirm ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  placeholder="Repite la contraseña"
                  className="w-full pl-9 pr-10 py-2.5 rounded-lg text-sm transition-all outline-none"
                  style={{ border: '1px solid #e0d4c8', fontFamily: 'Montserrat, sans-serif', color: '#625746' }}
                  onFocus={e => e.target.style.borderColor = '#917a6a'}
                  onBlur={e => e.target.style.borderColor = '#e0d4c8'}
                />
                <button type="button" onClick={() => setShowConfirm(!showConfirm)}
                  className="absolute right-3 top-1/2 -translate-y-1/2" style={{ color: '#d2c7b6' }}>
                  {showConfirm ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-lg font-semibold text-sm transition-all active:scale-95 disabled:opacity-60 flex items-center justify-center gap-2 mt-2"
              style={{ background: '#625746', color: '#fcf5e0', fontFamily: 'Montserrat, sans-serif', letterSpacing: '0.05em' }}
              onMouseEnter={e => !loading && (e.currentTarget.style.background = '#4d4238')}
              onMouseLeave={e => !loading && (e.currentTarget.style.background = '#625746')}>
              {loading && <div className="w-4 h-4 border-2 border-[#fcf5e0] border-t-transparent rounded-full animate-spin" />}
              {loading ? 'Guardando...' : 'Guardar nueva contraseña'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
