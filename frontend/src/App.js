import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate, useLocation } from "react-router-dom";
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
import OwnerHotelSummary from "./pages/OwnerHotelSummary";
import OwnerGardenSummary from "./pages/OwnerGardenSummary";
import PropertyManagement from "./pages/PropertyManagement";
import PlatformAdmin from "./pages/PlatformAdmin";
import HotelEvents from "./pages/HotelEvents";
import RoomTypes from "./pages/RoomTypes";
import Restaurant from "./pages/Restaurant";
import { canAccessRoute, getDefaultPathForRole } from "./utils/permissions";

function hasEffectiveModules(user) {
  if (!user || user.role === 'platform_admin') return true;
  return Array.isArray(user.modules) && user.modules.length > 0;
}

function LoginRoute() {
  const { user, logout } = useAuth();
  useEffect(() => {
    if (user && !hasEffectiveModules(user)) logout();
  }, [user, logout]);
  if (!user) return <Login />;
  if (!hasEffectiveModules(user)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <p className="text-slate-500 text-sm">Cerrando sesión…</p>
      </div>
    );
  }
  const next = getDefaultPathForRole(user);
  if (next) return <Navigate to={next} replace />;
  return <Login />;
}

const ProtectedRoute = ({ children, allowedRoles = null }) => {
  const { user, loading, logout } = useAuth();
  const location = useLocation();
  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-emerald-600 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-slate-500 text-sm">Cargando...</p>
      </div>
    </div>
  );
  if (!user) return <Navigate to="/login" replace />;
  if (!hasEffectiveModules(user)) {
    logout();
    return <Navigate to="/login" replace />;
  }
  if (!canAccessRoute(user, location.pathname, allowedRoles)) {
    const fallback = getDefaultPathForRole(user);
    if (fallback == null) {
      logout();
      return <Navigate to="/login" replace />;
    }
    return <Navigate to={fallback} replace />;
  }
  return <Layout>{children}</Layout>;
};

function AppRoutes() {
  const { user } = useAuth();
  const defaultPath = user
    ? (getDefaultPathForRole(user) ?? (user.role === 'platform_admin' ? '/platform-admin' : '/login'))
    : '/login';
  return (
    <Routes>
      <Route path="/login" element={<LoginRoute />} />
      <Route path="/platform-admin" element={<ProtectedRoute allowedRoles={['platform_admin']}><PlatformAdmin /></ProtectedRoute>} />
      <Route path="/platform-admin/:section" element={<ProtectedRoute allowedRoles={['platform_admin']}><PlatformAdmin /></ProtectedRoute>} />
      <Route path="/corporate" element={<ProtectedRoute allowedRoles={['manager','owner']}><CorporateDashboard /></ProtectedRoute>} />
      <Route path="/hotels" element={<ProtectedRoute allowedRoles={['manager','owner']}><HotelsOverview /></ProtectedRoute>} />
      <Route path="/event-gardens" element={<ProtectedRoute allowedRoles={['manager','owner']}><EventGardensOverview /></ProtectedRoute>} />
      <Route path="/owner/hotel/:propertyId" element={<ProtectedRoute allowedRoles={['owner']}><OwnerHotelSummary /></ProtectedRoute>} />
      <Route path="/owner/garden/:propertyId" element={<ProtectedRoute allowedRoles={['owner']}><OwnerGardenSummary /></ProtectedRoute>} />
      <Route path="/" element={<ProtectedRoute allowedRoles={['receptionist','sales','manager','owner']}><Dashboard /></ProtectedRoute>} />
      <Route path="/reservations" element={<ProtectedRoute allowedRoles={['receptionist','sales','manager','owner']}><Reservations /></ProtectedRoute>} />
      <Route path="/rooms" element={<ProtectedRoute allowedRoles={['receptionist','sales','manager','owner']}><Rooms /></ProtectedRoute>} />
      <Route path="/guests" element={<ProtectedRoute allowedRoles={['receptionist','sales','manager','owner']}><Guests /></ProtectedRoute>} />
      <Route path="/jardines" element={<ProtectedRoute allowedRoles={['manager','owner']}><EventGarden /></ProtectedRoute>} />
      <Route path="/hotel-events" element={<ProtectedRoute allowedRoles={['sales','manager','owner']}><HotelEvents /></ProtectedRoute>} />
      <Route path="/restaurant" element={<ProtectedRoute allowedRoles={['restaurant','receptionist','sales','manager','owner']}><Restaurant /></ProtectedRoute>} />
      <Route path="/room-types" element={<ProtectedRoute allowedRoles={['manager']}><RoomTypes /></ProtectedRoute>} />
      <Route path="/inbox" element={<ProtectedRoute><Inbox /></ProtectedRoute>} />
      <Route path="/tasks" element={<ProtectedRoute><Tasks /></ProtectedRoute>} />
      <Route path="/reports" element={<ProtectedRoute allowedRoles={['owner','manager','finance']}><Reports /></ProtectedRoute>} />
      <Route path="/staff" element={<ProtectedRoute allowedRoles={['platform_admin','manager']}><Staff /></ProtectedRoute>} />
      <Route path="/properties" element={<ProtectedRoute allowedRoles={['manager']}><PropertyManagement /></ProtectedRoute>} />
      <Route path="/catalogo" element={<ProtectedRoute allowedRoles={['receptionist', 'sales', 'manager', 'owner']}><RoomsCatalog /></ProtectedRoute>} />
      <Route path="/reservar" element={<BookingWizard />} />
      <Route path="/mi-reserva" element={<BookingLookup />} />
      <Route path="*" element={<Navigate to={defaultPath} replace />} />
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
