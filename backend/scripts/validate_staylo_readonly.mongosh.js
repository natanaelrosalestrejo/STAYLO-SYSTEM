/**
 * Read-only validation for database `staylo` after reset.
 * Does NOT delete or modify data.
 *
 * Usage:
 *   mongosh "<YOUR_MONGO_URI>" validate_staylo_readonly.mongosh.js
 * Or from mongosh shell:
 *   use staylo
 *   load("scripts/validate_staylo_readonly.mongosh.js")
 */
const dbname = "staylo";
const d = db.getSiblingDB(dbname);
print("=== STAYLO validation (read-only) ===");
print("database:", dbname);
print("tenants:", d.tenants.countDocuments({}));
print("properties:", d.properties.countDocuments({}));
print("rooms:", d.rooms.countDocuments({}));
print("users:", d.users.countDocuments({}));
print("guests:", d.guests.countDocuments({}));
print("reservations:", d.reservations.countDocuments({}));
print("event_spaces:", d.event_spaces.countDocuments({}));
print("hotel_spaces:", d.hotel_spaces.countDocuments({}));
print("event_bookings:", d.event_bookings.countDocuments({}));
print("role_permissions (expect 0):", d.role_permissions.countDocuments({}));
print("tasks:", d.tasks.countDocuments({}));
print("messages:", d.messages.countDocuments({}));
print("--- Expected IDs ---");
print("tenant:", d.tenants.findOne({ id: "tenant_demo_alma" }) ? "tenant_demo_alma OK" : "MISSING");
print("hotel:", d.properties.findOne({ id: "alma_hotel" }) ? "alma_hotel OK" : "MISSING");
print("gardens:", d.properties.countDocuments({ type: "event_garden" }), "event_garden properties");
print("rooms for alma_hotel:", d.rooms.countDocuments({ property_id: "alma_hotel" }));
print("done.");
