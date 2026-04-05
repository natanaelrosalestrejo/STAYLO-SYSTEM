import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import api from '../utils/api';
import {
  Wifi, Wind, Tv, BedDouble, ShowerHead, Lock, Sofa, Shirt,
  Droplets, SprayCan, ChevronRight, ArrowLeft, Edit2, Sparkles
} from 'lucide-react';

// Map common amenity keywords → icon
const AMENITY_ICON_MAP = [
  { keywords: ['wifi', 'wi-fi', 'internet'],         Icon: Wifi },
  { keywords: ['aire', 'a/c', 'ac', 'acondicionado', 'ventilador', 'secador'],  Icon: Wind },
  { keywords: ['tv', 'televisión', 'television', 'pantalla'], Icon: Tv },
  { keywords: ['cama', 'king', 'queen', 'bed'],       Icon: BedDouble },
  { keywords: ['regadera', 'ducha', 'shower', 'lluvia'], Icon: ShowerHead },
  { keywords: ['seguridad', 'caja', 'safe', 'cerradura', 'lock'], Icon: Lock },
  { keywords: ['sofá', 'sofa', 'sillón', 'lounge'],  Icon: Sofa },
  { keywords: ['vestidor', 'closet', 'ropero'],       Icon: Shirt },
  { keywords: ['lavabo', 'baño privado', 'tina', 'jacuzzi', 'privado'], Icon: Droplets },
  { keywords: ['amenidades', 'spa', 'kit', 'toiletries'], Icon: SprayCan },
];

const getAmenityIcon = (name) => {
  const lower = name.toLowerCase();
  for (const { keywords, Icon } of AMENITY_ICON_MAP) {
    if (keywords.some(k => lower.includes(k))) return Icon;
  }
  return Sparkles;
};

const RoomCard = ({ rt, isAdmin, onEdit }) => {
  const img = rt.images?.[0];
  return (
    <div className="bg-white rounded-2xl overflow-hidden shadow-md border fade-in"
      style={{ borderColor: '#e8dfd5' }}
      data-testid={`catalog-card-${rt.id}`}>
      {/* Image */}
      <div className="relative overflow-hidden" style={{ height: '280px' }}>
        {img ? (
          <img src={img} alt={rt.name} className="w-full h-full object-cover transition-transform duration-500 hover:scale-105" />
        ) : (
          <div className="w-full h-full flex items-center justify-center" style={{ background: '#f0e8dc' }}>
            <div className="text-center">
              <BedDouble size={48} style={{ color: '#d2c7b6', margin: '0 auto 8px' }} strokeWidth={1} />
              <p style={{ color: '#c8b8a8', fontSize: '13px', fontFamily: 'Montserrat, sans-serif' }}>Imagen próximamente</p>
            </div>
          </div>
        )}
        {/* Status badge */}
        <div className="absolute top-4 left-4">
          <span className="px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: '#625746', color: '#fcf5e0', fontFamily: 'Montserrat, sans-serif', letterSpacing: '0.05em' }}>
            {rt.name}
          </span>
        </div>
        {/* Edit button for manager */}
        {isAdmin && (
          <button onClick={onEdit}
            data-testid={`catalog-edit-${rt.id}`}
            className="absolute top-4 right-4 w-8 h-8 rounded-full flex items-center justify-center transition-all"
            style={{ background: 'rgba(255,255,255,0.9)', color: '#625746' }}
            title="Editar tipo de habitación">
            <Edit2 size={14} />
          </button>
        )}
      </div>

      {/* Content */}
      <div className="p-7">
        <div className="mb-4">
          <div className="flex items-start justify-between mb-2">
            <h3 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', color: '#625746', fontSize: '28px', fontWeight: 400, lineHeight: 1.2, letterSpacing: '0.02em' }}>
              {rt.name}
            </h3>
            <span style={{ color: '#625746', fontSize: '18px', fontWeight: 700, fontFamily: 'Manrope, sans-serif', marginLeft: '12px', flexShrink: 0 }}>
              ${(rt.base_price || 0).toLocaleString('es-MX')}<span style={{ fontSize: '12px', fontWeight: 400, color: '#917a6a' }}>/noche</span>
            </span>
          </div>
          {rt.description && (
            <p style={{ color: '#917a6a', fontSize: '14px', fontFamily: 'Montserrat, sans-serif', lineHeight: 1.6 }}>
              {rt.description}
            </p>
          )}
        </div>

        {/* Capacity */}
        <div className="flex items-center gap-2 mb-5">
          <span style={{ color: '#d2c7b6', fontSize: '12px', fontFamily: 'Montserrat, sans-serif', fontWeight: 500 }}>
            Capacidad: {rt.capacity} persona{rt.capacity !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Amenities */}
        {rt.amenities?.length > 0 && (
          <div className="mb-6">
            <p style={{ color: '#917a6a', fontSize: '11px', fontFamily: 'Montserrat, sans-serif', fontWeight: 600, letterSpacing: '0.15em', marginBottom: '12px' }}>
              EQUIPAMIENTO
            </p>
            <div className="grid grid-cols-2 gap-2">
              {rt.amenities.map((amenity, i) => {
                const AmenityIcon = getAmenityIcon(amenity);
                return (
                  <div key={i} className="amenity-chip">
                    <AmenityIcon size={13} strokeWidth={1.5} style={{ color: '#917a6a', flexShrink: 0 }} />
                    <span>{amenity}</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Images count */}
        {rt.images?.length > 1 && (
          <p style={{ color: '#b0a090', fontSize: '11px', fontFamily: 'Montserrat, sans-serif', marginBottom: '16px' }}>
            {rt.images.length} fotografías disponibles
          </p>
        )}

        {/* CTA */}
        <Link to="/reservar"
          className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-all"
          style={{ background: '#625746', color: '#fcf5e0', fontFamily: 'Montserrat, sans-serif', letterSpacing: '0.05em', textDecoration: 'none' }}
          onMouseEnter={e => e.currentTarget.style.background = '#4d4238'}
          onMouseLeave={e => e.currentTarget.style.background = '#625746'}
          data-testid={`reserve-btn-${rt.id}`}>
          Reservar ahora <ChevronRight size={16} />
        </Link>
      </div>
    </div>
  );
};

export default function RoomsCatalog() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [roomTypes, setRoomTypes] = useState([]);
  const [loading, setLoading] = useState(true);

  const isAdmin = user && user.role === 'manager';

  useEffect(() => {
    const fetchRoomTypes = async () => {
      try {
        const res = await api.get('/room-types');
        setRoomTypes(res.data.filter(rt => rt.status === 'active'));
      } catch {
        setRoomTypes([]);
      } finally {
        setLoading(false);
      }
    };
    fetchRoomTypes();
  }, []);

  const handleEdit = (rt) => {
    navigate('/room-types');
  };

  return (
    <div className="min-h-screen" style={{ background: '#faf8f3' }}>
      {/* Top Bar */}
      <div className="px-6 py-3 flex items-center justify-between" style={{ background: 'white', borderBottom: '1px solid #e8dfd5' }}>
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ border: '1px solid rgba(98,87,70,0.25)', background: 'rgba(98,87,70,0.06)' }}>
            <span style={{ fontFamily: 'Manrope, sans-serif', color: '#625746', fontSize: '10px', fontWeight: 700, letterSpacing: '0.06em' }}>S</span>
          </div>
          <div>
            <span style={{ fontFamily: 'Manrope, sans-serif', color: '#625746', fontSize: '16px', fontWeight: 700, letterSpacing: '0.04em' }}>STAYLO</span>
            <span style={{ color: '#917a6a', fontSize: '10px', letterSpacing: '0.06em', fontFamily: 'Montserrat, sans-serif', fontWeight: 500, marginLeft: '8px' }}>Catálogo</span>
          </div>
        </div>
        {user ? (
          <div className="flex items-center gap-3">
            {isAdmin && (
              <button onClick={() => navigate('/room-types')}
                data-testid="manage-room-types-btn"
                className="flex items-center gap-2 text-sm transition-colors px-3 py-1.5 rounded-lg border"
                style={{ color: '#625746', borderColor: '#e8dfd5', fontFamily: 'Montserrat, sans-serif', fontWeight: 500, background: 'none', cursor: 'pointer' }}>
                <Edit2 size={14} /> Gestionar tipos
              </button>
            )}
            <button onClick={() => navigate('/')} data-testid="back-to-system-btn"
              className="flex items-center gap-2 text-sm transition-colors"
              style={{ color: '#917a6a', fontFamily: 'Montserrat, sans-serif', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer' }}>
              <ArrowLeft size={15} /> Panel de gestión
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-4">
            <Link to="/mi-reserva" className="text-sm transition-colors"
              style={{ color: '#917a6a', fontFamily: 'Montserrat, sans-serif', fontWeight: 500, textDecoration: 'none' }}>
              Consultar reserva
            </Link>
            <Link to="/reservar" className="text-sm font-semibold px-4 py-2 rounded-full transition-all"
              style={{ background: '#625746', color: '#fcf5e0', fontFamily: 'Montserrat, sans-serif', textDecoration: 'none', letterSpacing: '0.04em' }}>
              Reservar
            </Link>
          </div>
        )}
      </div>

      {/* Hero */}
      <div className="py-16 px-6 text-center" style={{ background: 'linear-gradient(180deg, #625746 0%, #917a6a 100%)' }}>
        <p style={{ color: '#d2c7b6', fontSize: '11px', letterSpacing: '0.2em', fontFamily: 'Montserrat, sans-serif', fontWeight: 500, marginBottom: '12px' }}>
          STAYLO
        </p>
        <h1 style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', color: '#fcf5e0', fontSize: '52px', fontWeight: 300, lineHeight: 1.1, letterSpacing: '0.02em', marginBottom: '16px' }}>
          Nuestras Habitaciones
        </h1>
        <p style={{ color: 'rgba(210,199,182,0.85)', fontSize: '14px', fontFamily: 'Montserrat, sans-serif', maxWidth: '480px', margin: '0 auto', lineHeight: 1.7 }}>
          Espacios diseñados para ofrecerte una estancia única, llena de confort y calidez en cada detalle.
        </p>
        <div className="flex items-center justify-center gap-4 mt-8">
          <div style={{ width: '40px', height: '1px', background: 'rgba(210,199,182,0.4)' }} />
          <span style={{ color: 'rgba(210,199,182,0.6)', fontSize: '12px', fontFamily: 'Manrope, sans-serif', fontWeight: 600, letterSpacing: '0.12em' }}>STAYLO</span>
          <div style={{ width: '40px', height: '1px', background: 'rgba(210,199,182,0.4)' }} />
        </div>
        <Link to="/reservar" className="inline-flex items-center gap-2 mt-8 px-8 py-3 rounded-full font-semibold text-sm transition-all"
          style={{ background: '#fcf5e0', color: '#625746', fontFamily: 'Montserrat, sans-serif', letterSpacing: '0.05em', textDecoration: 'none' }}
          data-testid="hero-reserve-btn">
          Reservar ahora <ChevronRight size={16} />
        </Link>
      </div>

      {/* Rooms Grid */}
      <div className="max-w-5xl mx-auto px-6 py-14">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-8 h-8 border-2 border-[#625746] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : roomTypes.length === 0 ? (
          <div className="text-center py-12">
            <BedDouble size={48} style={{ color: '#d2c7b6', margin: '0 auto 12px' }} strokeWidth={1} />
            <p style={{ color: '#917a6a', fontFamily: 'Montserrat, sans-serif', fontSize: '15px' }}>
              No hay tipos de habitación configurados aún.
            </p>
            {isAdmin && (
              <button onClick={() => navigate('/room-types')}
                className="mt-4 px-6 py-2.5 rounded-full text-sm font-semibold"
                style={{ background: '#625746', color: '#fcf5e0', fontFamily: 'Montserrat, sans-serif' }}>
                Configurar tipos de habitación
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {roomTypes.map(rt => (
              <RoomCard key={rt.id} rt={rt} isAdmin={isAdmin} onEdit={() => handleEdit(rt)} />
            ))}
          </div>
        )}

        {/* Info Section */}
        <div className="mt-14 text-center py-10 px-8 rounded-2xl" style={{ background: 'rgba(98,87,70,0.05)', border: '1px solid #e8dfd5' }}>
          <p style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', color: '#625746', fontSize: '26px', fontWeight: 400, marginBottom: '10px' }}>
            ¿Listo para reservar?
          </p>
          <p style={{ color: '#917a6a', fontSize: '13px', fontFamily: 'Montserrat, sans-serif', marginBottom: '20px', lineHeight: 1.6 }}>
            Contamos con {roomTypes.length > 0 ? `${roomTypes.length} tipo${roomTypes.length !== 1 ? 's' : ''} de habitación` : 'habitaciones'} disponibles.
            <br />Para reservaciones o consultas, contáctenos directamente.
          </p>
          <div className="flex items-center justify-center gap-2">
            <div style={{ width: '30px', height: '1px', background: '#d2c7b6' }} />
            <span style={{ color: '#d2c7b6', fontSize: '13px', fontFamily: 'Manrope, sans-serif', fontWeight: 600, letterSpacing: '0.08em' }}>STAYLO</span>
            <div style={{ width: '30px', height: '1px', background: '#d2c7b6' }} />
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="py-6 text-center" style={{ borderTop: '1px solid #e8dfd5' }}>
        <p style={{ color: '#c8b8a8', fontSize: '11px', fontFamily: 'Montserrat, sans-serif', letterSpacing: '0.1em' }}>
          © 2025 STAYLO. Todos los derechos reservados.
        </p>
      </div>
    </div>
  );
}
