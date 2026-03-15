import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "sonner";
import { AuthProvider, useAuth } from "./contexts/AuthContext";
import { PropertyProvider } from "./contexts/PropertyContext";
import Layout from "./components/Layout";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Reservations from "./pages/Reservations";
import Rooms from "./pages/Rooms";
import Guests from "./pages/Guests";
import Inbox from "./pages/Inbox";
import Tasks from "./pages/Tasks";
import Reports from "./pages/Reports";
import Staff from "./pages/Staff";
import RoomsCatalog from "./pages/RoomsCatalog";
import BookingWizard from "./pages/BookingWizard";
import BookingLookup from "./pages/BookingLookup";
import CorporateDashboard from "./pages/CorporateDashboard";
import EventGarden from "./pages/EventGarden";
import HotelsOverview from "./pages/HotelsOverview";
import EventGardensOverview from "./pages/EventGardensOverview";
import PropertyManagement from "./pages/PropertyManagement";
import PlatformAdmin from "./pages/PlatformAdmin";
import HotelEvents from "./pages/HotelEvents";
import RoomTypes from "./pages/RoomTypes";

const ProtectedRoute = ({ children, allowedRoles = null }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 text-sm">Cargando...</p>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(user.role)) {
    const fallback = user.role === 'platform_admin' ? '/platform-admin'
      : user.role === 'owner' ? '/corporate' : '/tasks';
    return <Navigate to={fallback} replace />;
  }
  return <Layout>{children}</Layout>;
};

function AppRoutes() {
  const { user } = useAuth();
  const defaultPath = user?.role === 'platform_admin' ? '/platform-admin'
    : user?.role === 'owner' ? '/corporate'
    : ['admin','receptionist'].includes(user?.role) ? '/'
    : '/tasks';
  return (
    <Routes>
      <Route path="/login" element={user ? <Navigate to={defaultPath} replace /> : <Login />} />
      <Route path="/platform-admin" element={<ProtectedRoute allowedRoles={['platform_admin']}><PlatformAdmin /></ProtectedRoute>} />
      <Route path="/platform-admin/:section" element={<ProtectedRoute allowedRoles={['platform_admin']}><PlatformAdmin /></ProtectedRoute>} />
      <Route path="/corporate" element={<ProtectedRoute allowedRoles={['admin','owner']}><CorporateDashboard /></ProtectedRoute>} />
      <Route path="/hotels" element={<ProtectedRoute allowedRoles={['admin','owner']}><HotelsOverview /></ProtectedRoute>} />
      <Route path="/event-gardens" element={<ProtectedRoute allowedRoles={['admin','owner']}><EventGardensOverview /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute allowedRoles={['admin','receptionist']}><Dashboard /></ProtectedRoute>} />
      <Route path="/reservations" element={<ProtectedRoute allowedRoles={['admin','receptionist']}><Reservations /></ProtectedRoute>} />
      <Route path="/rooms" element={<ProtectedRoute allowedRoles={['admin','receptionist']}><Rooms /></ProtectedRoute>} />
      <Route path="/guests" element={<ProtectedRoute allowedRoles={['admin','receptionist']}><Guests /></ProtectedRoute>} />
      <Route path="/jardines" element={<ProtectedRoute allowedRoles={['admin','receptionist','manager']}><EventGarden /></ProtectedRoute>} />
      <Route path="/hotel-events" element={<ProtectedRoute allowedRoles={['admin','receptionist','manager']}><HotelEvents /></ProtectedRoute>} />
      <Route path="/room-types" element={<ProtectedRoute allowedRoles={['admin','manager']}><RoomTypes /></ProtectedRoute>} />
      <Route path="/inbox" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute allowedRoles={['admin','owner']}><Reports /></ProtectedRoute>} />
      <Route path="/staff" element={<ProtectedRoute allowedRoles={['admin', 'platform_admin']}><Staff /></ProtectedRoute>} />
      <Route path="/properties" element={<ProtectedRoute allowedRoles={['admin']}><PropertyManagement /></ProtectedRoute>} />
      <Route path="/catalogo" element={<RoomsCatalog />} />
      <Route path="/reservar" element={<BookingWizard />} />
      <Route path="/mi-reserva" element={<BookingLookup />} />
      <Route path="*" element={<Navigate to={user ? defaultPath : '/login'} replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <PropertyProvider>
          <AppRoutes />
          <Toaster richColors position="top-right" />
        </PropertyProvider>
      </BrowserRouter>
    </AuthProvider>
  );
}
