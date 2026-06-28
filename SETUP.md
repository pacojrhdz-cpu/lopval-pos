# Lopval POS — Guía de instalación y deploy

## Requisitos previos
- Node.js 18+ instalado
- Cuenta en [Supabase](https://supabase.com) (gratuita)
- Cuenta en [Netlify](https://netlify.com) (gratuita)

---

## Paso 1 — Configurar Supabase

1. Entra a [app.supabase.com](https://app.supabase.com) y crea un nuevo proyecto.
2. En el menú lateral, ve a **SQL Editor** y ejecuta todo el contenido del archivo `supabase/schema.sql`. Esto creará todas las tablas y cargará los datos iniciales (categorías, productos, insumos).
3. Activa **Real-time** para las tablas `sales` y `sale_items`:
   - Ve a Database > Replication
   - Activa las dos tablas mencionadas (si el SQL no las activó automáticamente)
4. Obtén tus credenciales en **Settings > API**:
   - `URL`
   - `anon public` key

---

## Paso 2 — Crear usuarios

1. En Supabase ve a **Authentication > Users > Invite user** (o Add user).
2. Crea un usuario **admin** con correo y contraseña.
3. Crea uno o más usuarios **cajeros** con sus correos.
4. Para asignar el rol de admin, en **SQL Editor** ejecuta:
   ```sql
   UPDATE public.profiles SET role = 'admin' WHERE id = '<uuid-del-usuario>';
   ```
   Puedes ver el UUID del usuario en Authentication > Users.

---

## Paso 3 — Configurar variables de entorno

1. Copia el archivo `.env.example` a `.env`:
   ```bash
   cp .env.example .env
   ```
2. Edita `.env` con tus datos de Supabase:
   ```
   VITE_SUPABASE_URL=https://tu-proyecto.supabase.co
   VITE_SUPABASE_ANON_KEY=tu-anon-key-aqui
   ```

---

## Paso 4 — Ejecutar en desarrollo

```bash
npm install
npm run dev
```

Abre `http://localhost:5173` en el navegador.

---

## Paso 5 — Deploy en Netlify

### Opción A: Drag & Drop (más fácil)
1. Construye el proyecto:
   ```bash
   npm run build
   ```
2. Entra a [netlify.com](https://netlify.com) > Sites > **Deploy manually**
3. Arrastra la carpeta `dist/` que se generó.
4. En **Site settings > Environment variables**, agrega:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

### Opción B: GitHub + auto-deploy
1. Sube el proyecto a un repositorio de GitHub.
2. En Netlify, conecta el repositorio.
3. Configuración de build:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Agrega las variables de entorno en Netlify.

---

## Estructura del proyecto

```
lopval-pos/
├── supabase/
│   └── schema.sql          ← Esquema completo de BD + datos iniciales
├── src/
│   ├── pages/
│   │   ├── Login.jsx
│   │   ├── pos/
│   │   │   └── POS.jsx     ← Punto de venta (cajeros)
│   │   └── admin/
│   │       ├── Dashboard.jsx     ← Vista en tiempo real
│   │       ├── SalesHistory.jsx  ← Historial y filtros
│   │       ├── Statistics.jsx    ← Estadísticas detalladas
│   │       ├── Products.jsx      ← CRUD de productos
│   │       ├── Recipes.jsx       ← Gestión de recetas
│   │       └── Inventory.jsx     ← Inventario de insumos
│   ├── contexts/
│   │   └── AuthContext.jsx
│   ├── lib/
│   │   └── supabase.js
│   └── utils/
│       └── format.js
└── SETUP.md
```

---

## Roles de usuario

| Rol      | Acceso |
|----------|--------|
| cashier  | Solo POS (/pos) |
| admin    | POS + toda la administración |

---

## Módulos disponibles

- **POS**: Grid de productos por categoría, carrito, descuentos, pago (efectivo/tarjeta/plataforma)
- **Dashboard**: Ventas del día en tiempo real, histograma por hora, métodos de pago, top productos
- **Historial**: Filtro por fecha/método, detalle de cada orden
- **Estadísticas**: Diario/semanal/mensual/anual, tendencias, histograma horario
- **Productos**: Crear, editar, activar/desactivar, precios
- **Recetas**: Definir ingredientes y cantidades por producto, cálculo de costo
- **Inventario**: Stock de insumos, alertas de mínimo, entradas/salidas/ajustes, movimientos

---

## Preguntas frecuentes

**¿Cómo agrego un nuevo producto al menú?**
Admin > Productos > "Nuevo producto"

**¿Cómo actualizo el precio de un producto?**
Admin > Productos > clic en el lápiz del producto

**¿Cómo registro la llegada de mercancía?**
Admin > Inventario > flecha verde (↑) en el insumo correspondiente

**¿Cómo ve el admin las ventas en vivo?**
Admin > Dashboard — se actualiza automáticamente al registrar cada venta
