# Ejecución del reset limpio — base `staylo`

Documento operativo que complementa el [plan de reset](./reset-plan.md).

---

## A. Estrategia de ejecución (recomendada)

| Aspecto | Decisión |
|--------|----------|
| **Orden** | 1) Backup (Atlas snapshot o `mongodump --db staylo`). 2) Prueba en seco (`--dry-run`). 3) Ejecución con `STAYLO_RESET_CONFIRM=1`. |
| **Herramienta** | **Python** (`backend/scripts/reset_staylo_demo.py`): misma lógica que los modelos Pydantic, bcrypt alineado con `auth.py`, IDs deterministas. |
| **mongosh** | Solo para **validación de lectura** (`validate_staylo_readonly.mongosh.js`), no para borrar/reinsertar (menos riesgo de error manual). |
| **Seguridad** | El script **solo** usa la base de datos cuyo nombre es literalmente `staylo` (no lee `DB_NAME` del entorno para el target). Requiere `STAYLO_RESET_CONFIRM=1` para escritura destructiva. |

---

## B. Archivos y comandos

| Qué | Ruta / comando |
|-----|----------------|
| Script principal | `backend/scripts/reset_staylo_demo.py` |
| Validación read-only | `backend/scripts/validate_staylo_readonly.mongosh.js` |
| Variables | `MONGO_URL` en `.env` (o entorno); **no** hace falta que `DB_NAME=staylo` para el script (el nombre está fijado en código). |

### Prueba en seco (conexión + conteos actuales por colección)

```bash
cd backend
python scripts/reset_staylo_demo.py --dry-run
```

### Reset real

**PowerShell (Windows):**

```powershell
cd backend
$env:STAYLO_RESET_CONFIRM="1"
python scripts/reset_staylo_demo.py
```

**Bash:**

```bash
cd backend
export STAYLO_RESET_CONFIRM=1
python scripts/reset_staylo_demo.py
```

### Validación con mongosh (opcional)

```bash
mongosh "YOUR_MONGO_URI" backend/scripts/validate_staylo_readonly.mongosh.js
```

---

## C. Qué hace el script (resumen)

1. **Limpia** (en este orden) las colecciones listadas en `CLEAR_COLLECTIONS` dentro de `staylo` únicamente.
2. **Inserta** tenant, 3 propiedades, 4 usuarios, 40 habitaciones, 4 huéspedes, 4 reservas, espacios de evento (2 jardines), espacios hotel (3), 3 reservas de evento, 2 tareas, 2 mensajes.
3. **Deja** `role_permissions` vacío (0 documentos).
4. **No toca** `room_types` ni `amenities` (catálogo opcional; seguir usando seeds si hace falta repoblar).

### IDs deterministas (referencia)

| Entidad | ID |
|---------|-----|
| Tenant | `tenant_demo_alma` |
| Hotel | `alma_hotel` |
| Jardines | `garden_margati`, `garden_alma` |
| Usuarios | `user_demo_platform_admin`, `user_demo_owner`, `user_demo_admin`, `user_demo_receptionist` |

### Credenciales demo (igual que documentación del proyecto)

| Email | Rol | Contraseña |
|-------|-----|------------|
| platform@almasystem.com | platform_admin | platform123 |
| owner@hotel.com | owner | owner123 |
| admin@hotel.com | admin | admin123 |
| maria@hotel.com | receptionist | recep123 |

---

## D. Checklist post-reset

- [ ] `role_permissions.countDocuments({}) === 0`
- [ ] `rooms.countDocuments({}) === 40` y todos `property_id === "alma_hotel"`
- [ ] `properties.countDocuments({}) === 3` (1 hotel + 2 `event_garden`)
- [ ] `users`: owner y staff con `tenant_id === "tenant_demo_alma"`
- [ ] Login owner → corporativo muestra 3 propiedades en alcance
- [ ] Login admin → dashboard habitaciones = 40
- [ ] Login recepcionista → lista de habitaciones coherente
- [ ] Vistas jardines / eventos con datos en los dos jardines

---

## E. Si algo falla

- Comprobar `MONGO_URL` y conectividad a Atlas.
- Instalar dependencias del backend: `pip install -r requirements.txt` (passlib, pymongo, pydantic, python-dotenv).
- Ejecutar desde el directorio `backend/` para que `models` importe correctamente.
