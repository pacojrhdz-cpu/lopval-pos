-- ============================================================
-- LOPVAL POS — Esquema de base de datos para Supabase
-- Pizza y Toto Matilde — Grupo Lopval
-- ============================================================

-- Extensiones necesarias
create extension if not exists "uuid-ossp";

-- ============================================================
-- PERFILES DE USUARIO (extiende auth.users de Supabase)
-- ============================================================
create table public.profiles (
  id         uuid references auth.users on delete cascade primary key,
  name       text not null,
  role       text not null default 'cashier' check (role in ('cashier', 'admin')),
  active     boolean default true,
  created_at timestamptz default now()
);

-- Trigger: crear perfil automáticamente al registrar usuario
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', new.email), 'cashier');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ============================================================
-- CATEGORÍAS
-- ============================================================
create table public.categories (
  id         uuid primary key default uuid_generate_v4(),
  name       text not null,
  icon       text default '🍕',
  color      text default '#DC2626',
  sort_order int  default 0,
  active     boolean default true
);

-- ============================================================
-- PRODUCTOS
-- ============================================================
create table public.products (
  id          uuid primary key default uuid_generate_v4(),
  name        text not null,
  description text,
  category_id uuid references public.categories(id),
  price       numeric(10,2) not null check (price >= 0),
  image_url   text,
  active      boolean default true,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- ============================================================
-- INSUMOS / INGREDIENTES
-- ============================================================
create table public.ingredients (
  id              uuid primary key default uuid_generate_v4(),
  name            text not null,
  unit            text not null,          -- kg, pza, L, pack, etc.
  cost_per_unit   numeric(10,4) default 0,
  stock_quantity  numeric(10,3) default 0,
  min_stock       numeric(10,3) default 0, -- alerta de stock mínimo
  supplier        text,
  category        text,                   -- Sams, Zorro, Frutas, Carne Mart, etc.
  active          boolean default true,
  updated_at      timestamptz default now()
);

-- ============================================================
-- RECETAS (ingredientes por producto)
-- ============================================================
create table public.recipe_items (
  id            uuid primary key default uuid_generate_v4(),
  product_id    uuid references public.products(id) on delete cascade,
  ingredient_id uuid references public.ingredients(id),
  quantity      numeric(10,4) not null check (quantity > 0),
  unit          text not null,
  notes         text
);

-- ============================================================
-- VENTAS
-- ============================================================
create table public.sales (
  id              uuid primary key default uuid_generate_v4(),
  created_at      timestamptz default now(),
  cashier_id      uuid references public.profiles(id),
  cashier_name    text,
  subtotal        numeric(10,2) not null,
  discount        numeric(10,2) default 0,
  discount_reason text,
  total           numeric(10,2) not null,
  payment_method  text not null check (payment_method in ('efectivo','tarjeta','plataforma')),
  platform_name   text,         -- Rappi, Uber Eats, Mercado Pago, etc.
  cash_received   numeric(10,2),
  change_given    numeric(10,2),
  status          text default 'completed' check (status in ('completed','cancelled')),
  notes           text
);

-- ============================================================
-- ÍTEMS DE VENTA
-- ============================================================
create table public.sale_items (
  id           uuid primary key default uuid_generate_v4(),
  sale_id      uuid references public.sales(id) on delete cascade,
  product_id   uuid references public.products(id),
  product_name text not null,
  quantity     int  not null check (quantity > 0),
  unit_price   numeric(10,2) not null,
  subtotal     numeric(10,2) not null
);

-- ============================================================
-- MOVIMIENTOS DE INVENTARIO
-- ============================================================
create table public.inventory_movements (
  id            uuid primary key default uuid_generate_v4(),
  ingredient_id uuid references public.ingredients(id),
  type          text check (type in ('entrada','salida','ajuste')),
  quantity      numeric(10,3) not null,
  reason        text,
  user_id       uuid references public.profiles(id),
  created_at    timestamptz default now()
);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================
alter table public.profiles           enable row level security;
alter table public.categories         enable row level security;
alter table public.products           enable row level security;
alter table public.ingredients        enable row level security;
alter table public.recipe_items       enable row level security;
alter table public.sales              enable row level security;
alter table public.sale_items         enable row level security;
alter table public.inventory_movements enable row level security;

-- Políticas: usuarios autenticados pueden leer todo
create policy "Auth read categories"          on public.categories          for select using (auth.role() = 'authenticated');
create policy "Auth read products"            on public.products            for select using (auth.role() = 'authenticated');
create policy "Auth read ingredients"         on public.ingredients         for select using (auth.role() = 'authenticated');
create policy "Auth read recipe_items"        on public.recipe_items        for select using (auth.role() = 'authenticated');
create policy "Auth read sales"               on public.sales               for select using (auth.role() = 'authenticated');
create policy "Auth read sale_items"          on public.sale_items          for select using (auth.role() = 'authenticated');
create policy "Auth read inventory_movements" on public.inventory_movements for select using (auth.role() = 'authenticated');
create policy "Auth read profiles"            on public.profiles            for select using (auth.role() = 'authenticated');

-- Cajeros pueden insertar ventas
create policy "Auth insert sales"      on public.sales      for insert with check (auth.role() = 'authenticated');
create policy "Auth insert sale_items" on public.sale_items for insert with check (auth.role() = 'authenticated');

-- Admin puede modificar todo (verificamos rol en el perfil)
create policy "Admin update sales" on public.sales for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

create policy "Admin all categories" on public.categories for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "Admin all products" on public.products for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "Admin all ingredients" on public.ingredients for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "Admin all recipe_items" on public.recipe_items for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "Admin all inventory_movements" on public.inventory_movements for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));
create policy "Admin update profiles" on public.profiles for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'admin'));

-- Permitir al usuario ver y actualizar su propio perfil
create policy "User update own profile" on public.profiles for update using (auth.uid() = id);

-- ============================================================
-- REAL-TIME: habilitar para ventas
-- ============================================================
alter publication supabase_realtime add table public.sales;
alter publication supabase_realtime add table public.sale_items;

-- ============================================================
-- DATOS INICIALES — CATEGORÍAS
-- ============================================================
insert into public.categories (name, icon, color, sort_order) values
  ('Pizzas',     '🍕', '#DC2626', 1),
  ('Pastas',     '🍝', '#EA580C', 2),
  ('Ensaladas',  '🥗', '#16A34A', 3),
  ('Bebidas',    '🥤', '#2563EB', 4),
  ('Postres',    '🍰', '#9333EA', 5),
  ('Extras',     '🍟', '#CA8A04', 6);

-- ============================================================
-- DATOS INICIALES — PRODUCTOS
-- (ajusta precios según tu menú real)
-- ============================================================
insert into public.products (name, description, category_id, price) values
  -- PIZZAS
  ('Pizza Margarita',        'Salsa de tomate, mozzarella, albahaca fresca', (select id from public.categories where name='Pizzas'), 120.00),
  ('Pizza Pepperoni',        'Salsa de tomate, mozzarella, pepperoni', (select id from public.categories where name='Pizzas'), 145.00),
  ('Pizza Hawaiana',         'Salsa de tomate, mozzarella, jamón, piña', (select id from public.categories where name='Pizzas'), 145.00),
  ('Pizza 4 Quesos',         'Mozzarella, manchego, parmesano, queso azul', (select id from public.categories where name='Pizzas'), 160.00),
  ('Pizza BBQ Tocino',       'Salsa BBQ, mozzarella, tocino, cebolla', (select id from public.categories where name='Pizzas'), 155.00),
  ('Pizza Chorizo',          'Salsa de tomate, mozzarella, chorizo, jalapeño', (select id from public.categories where name='Pizzas'), 145.00),
  ('Pizza Vegetariana',      'Salsa de tomate, mozzarella, champiñones, pimientos, jitomate cherry', (select id from public.categories where name='Pizzas'), 140.00),
  ('Pizza Especial Lopval',  'La pizza de la casa con ingredientes especiales', (select id from public.categories where name='Pizzas'), 170.00),
  ('Pizza Caprese',          'Salsa de tomate, mozzarella, jitomate cherry, albahaca, vinagre balsámico', (select id from public.categories where name='Pizzas'), 150.00),
  ('Pizza Salami',           'Salsa de tomate, mozzarella, salami cocido', (select id from public.categories where name='Pizzas'), 145.00),
  -- PASTAS
  ('Spaghetti Bolognesa',    'Pasta espagueti con salsa boloñesa de res', (select id from public.categories where name='Pastas'), 95.00),
  ('Fettuccini Alfredo',     'Pasta fetuccini con salsa de crema y parmesano', (select id from public.categories where name='Pastas'), 98.00),
  ('Fusilli Pesto',          'Pasta fusilli con pesto de albahaca y nuez', (select id from public.categories where name='Pastas'), 92.00),
  ('Pasta 4 Quesos',         'Pasta con salsa de quesos (manchego, crema, parmesano, azul)', (select id from public.categories where name='Pastas'), 105.00),
  ('Pasta Arrabiata',        'Pasta con salsa de tomate picante', (select id from public.categories where name='Pastas'), 90.00),
  -- ENSALADAS
  ('Ensalada César',         'Lechuga, crutones, aderezo César, parmesano', (select id from public.categories where name='Ensaladas'), 78.00),
  ('Ensalada Caprese',       'Jitomate, mozzarella, albahaca, vinagre balsámico', (select id from public.categories where name='Ensaladas'), 82.00),
  ('Ensalada Mixta',         'Lechuga, jitomate cherry, pepino, cebolla morada, zanahoria', (select id from public.categories where name='Ensaladas'), 65.00),
  ('Ensalada de Frutas',     'Mezcla de frutas de temporada', (select id from public.categories where name='Ensaladas'), 70.00),
  -- BEBIDAS
  ('Agua 600ml',             'Agua embotellada', (select id from public.categories where name='Bebidas'), 20.00),
  ('Refresco',               'Coca-Cola, Sprite, Fanta (lata)', (select id from public.categories where name='Bebidas'), 28.00),
  ('Agua de Jamaica',        'Agua fresca de jamaica natural', (select id from public.categories where name='Bebidas'), 22.00),
  ('Limonada',               'Limonada natural con hielo', (select id from public.categories where name='Bebidas'), 25.00),
  ('Agua Mineral',           'Agua mineral con o sin gas', (select id from public.categories where name='Bebidas'), 22.00),
  -- POSTRES
  ('Brownie de Oreo',        'Brownie casero con galletas Oreo', (select id from public.categories where name='Postres'), 45.00),
  ('Gelatina de Domo',       'Gelatina de fresa con crema', (select id from public.categories where name='Postres'), 35.00),
  ('Tiramisú',               'Postre italiano de café', (select id from public.categories where name='Postres'), 55.00),
  -- EXTRAS
  ('Papas Fritas',           'Porción de papas fritas crujientes', (select id from public.categories where name='Extras'), 55.00),
  ('Pan de Ajo',             'Pan artesanal con mantequilla y ajo', (select id from public.categories where name='Extras'), 35.00),
  ('Extra Queso',            'Porción adicional de queso mozzarella', (select id from public.categories where name='Extras'), 20.00),
  ('Extra Pepperoni',        'Porción adicional de pepperoni', (select id from public.categories where name='Extras'), 25.00);

-- ============================================================
-- DATOS INICIALES — INSUMOS (del archivo de requisición)
-- ============================================================
insert into public.ingredients (name, unit, cost_per_unit, supplier, category) values
  -- SAMS
  ('Queso parmesano',         'pza',   203.58, 'Sams', 'Lácteos'),
  ('Queso azul',              'pza',   317.13, 'Sams', 'Lácteos'),
  ('Jamón kir',               'pza',   178.00, 'Sams', 'Embutidos'),
  ('Pasta fusilli',           'pza',    26.60, 'Sams', 'Pastas'),
  ('Pasta espagueti',         'pza',    26.60, 'Sams', 'Pastas'),
  ('Pasta fetuccini',         'pza',    26.60, 'Sams', 'Pastas'),
  ('Queso crema',             'pza',   162.66, 'Sams', 'Lácteos'),
  ('Salsa inglesa 1L',        'pza',   166.75, 'Sams', 'Salsas'),
  ('Aceite 5L',               'pza',   183.12, 'Sams', 'Aceites'),
  ('Harina (paquete 4)',      'pza',    60.36, 'Sams', 'Harinas'),
  ('Albahaca deshidratada',   'pza',   142.20, 'Sams', 'Especias'),
  ('Vino blanco',             'pza',   101.00, 'Sams', 'Bebidas'),
  ('Aceite para freidora',    'pza',   725.30, 'Sams', 'Aceites'),
  ('Bactericida',             'pza',    50.00, 'Sams', 'Limpieza'),
  ('Caldo de pollo',          'pza',   181.07, 'Sams', 'Condimentos'),
  ('Salsa Maggie',            'pza',   224.03, 'Sams', 'Salsas'),
  ('Vinagre balsámico',       'pza',   107.82, 'Sams', 'Aderezos'),
  ('Chorizo chata',           'pza',    63.42, 'Sams', 'Embutidos'),
  ('Garrafa valentina',       'pza',   121.98, 'Sams', 'Salsas'),
  ('Pastorcito',              'pza',   171.86, 'Sams', 'Embutidos'),
  ('Arándanos',               'pza',   142.00, 'Sams', 'Frutas'),
  ('Catsup sobres',           'caja',  142.20, 'Sams', 'Salsas'),
  -- ZORRO
  ('Crema lala',              'pza',   210.23, 'Zorro', 'Lácteos'),
  ('Sal',                     'pza',     0.00, 'Zorro', 'Especias'),
  ('Harina de hot cakes',     'pza',     0.00, 'Zorro', 'Harinas'),
  ('Elote (Zorro)',           'pza',     0.00, 'Zorro', 'Verduras'),
  -- FRUTAS Y VERDURAS
  ('Blueberry',               'pza',    45.00, 'Frutas/Verduras', 'Frutas'),
  ('Frambuesa',               'pza',    45.00, 'Frutas/Verduras', 'Frutas'),
  ('Piña',                    'pza',    45.00, 'Frutas/Verduras', 'Frutas'),
  ('Azúcar',                  'kg',     36.00, 'Frutas/Verduras', 'Abarrotes'),
  ('Jamaica',                 'kg',    100.00, 'Frutas/Verduras', 'Especias'),
  ('Albahaca fresca',         'manojo', 13.00, 'Frutas/Verduras', 'Hierbas'),
  ('Calabaza',                'kg',     26.00, 'Frutas/Verduras', 'Verduras'),
  ('Champiñones',             'kg',     87.00, 'Frutas/Verduras', 'Verduras'),
  ('Jitomate cherry',         'pza',    45.00, 'Frutas/Verduras', 'Verduras'),
  ('Cilantro',                'manojo', 10.00, 'Frutas/Verduras', 'Hierbas'),
  ('Jitomate',                'kg',     20.00, 'Frutas/Verduras', 'Verduras'),
  ('Limón',                   'kg',     14.00, 'Frutas/Verduras', 'Frutas'),
  ('Pimientos',               'kg',     32.00, 'Frutas/Verduras', 'Verduras'),
  ('Cebolla morada',          'kg',     40.00, 'Frutas/Verduras', 'Verduras'),
  ('Cebolla blanca',          'kg',     13.00, 'Frutas/Verduras', 'Verduras'),
  ('Nuez',                    'kg',    260.00, 'Frutas/Verduras', 'Frutos secos'),
  ('Apio',                    'kg',     13.00, 'Frutas/Verduras', 'Verduras'),
  ('Zanahoria',               'kg',     18.00, 'Frutas/Verduras', 'Verduras'),
  ('Cabeza de ajo',           'pza',    29.00, 'Frutas/Verduras', 'Verduras'),
  ('Ajo molido',              'kg',     23.00, 'Frutas/Verduras', 'Especias'),
  ('Lechuga',                 'pza',    10.00, 'Frutas/Verduras', 'Verduras'),
  ('Hierbas de olor',         'manojo', 10.00, 'Frutas/Verduras', 'Hierbas'),
  ('Pepino',                  'kg',     19.00, 'Frutas/Verduras', 'Verduras'),
  -- DAJO (Desechables)
  ('Charola cartón no. 7',    'pza',   405.40, 'Dajo', 'Desechables'),
  ('Salsa valentina sobres',  'caja',  359.90, 'Dajo', 'Desechables'),
  ('Bolsas 1kg',              'pza',   115.53, 'Dajo', 'Desechables'),
  ('Bolsa de basura',         'pza',    34.83, 'Dajo', 'Limpieza'),
  ('Servilletas',             'pza',    18.00, 'Dajo', 'Desechables'),
  ('Vaso primo',              'pack',   30.00, 'Dajo', 'Desechables'),
  ('Tenedores 25 pzas',       'pza',     8.25, 'Dajo', 'Desechables'),
  ('Vaso 1 litro',            'pack',   28.71, 'Dajo', 'Desechables'),
  ('Plato cartón no. 4',      'pza',   200.00, 'Dajo', 'Desechables'),
  ('Plato cartón no. 3',      'pack',   66.00, 'Dajo', 'Desechables'),
  ('Charola don bee',         'pack',  119.60, 'Dajo', 'Desechables'),
  ('Domo ensalada',           'pza',   119.00, 'Dajo', 'Desechables'),
  ('Hamburguesero',           'pza',   195.00, 'Dajo', 'Desechables'),
  ('Papel encerado',          'pack',    0.01, 'Dajo', 'Desechables'),
  ('Bolsa de camiseta',       'pza',    49.00, 'Dajo', 'Desechables'),
  ('Guantes de nitrilo',      'pza',     0.00, 'Dajo', 'Limpieza'),
  -- CARNE MART
  ('Manchego',                'kg',    105.00, 'Carne Mart', 'Lácteos'),
  ('Mozzarella',              'kg',     95.00, 'Carne Mart', 'Lácteos'),
  ('Pepperoni',               'kg',    164.50, 'Carne Mart', 'Embutidos'),
  ('Molida de res',           'kg',    115.30, 'Carne Mart', 'Carnes'),
  ('Caja para pizza',         'pza',     8.40, 'Carne Mart', 'Desechables'),
  ('Salami cocido',           'kg',     99.90, 'Carne Mart', 'Embutidos'),
  ('Margarina sin sal',       'kg',     75.90, 'Carne Mart', 'Lácteos'),
  ('Salsa para pizza',        'pza',   102.90, 'Carne Mart', 'Salsas'),
  ('Papas',                   'kg',    107.00, 'Carne Mart', 'Verduras'),
  ('Tocino',                  'kg',     93.95, 'Carne Mart', 'Carnes'),
  ('Mango habanero',          'pza',    50.00, 'Carne Mart', 'Salsas'),
  -- MATERIAS PRIMAS
  ('Levadura fresca',         'pza',    22.00, 'San Antonio', 'Harinas'),
  -- SUPER
  ('Catsup botella',          'pza',    41.00, 'Super', 'Salsas'),
  ('Lava trastes',            'pza',    22.50, 'Super', 'Limpieza'),
  ('Cloro',                   'pza',    21.50, 'Super', 'Limpieza'),
  ('Pinol',                   'pza',    30.00, 'Super', 'Limpieza');

-- ============================================================
-- RECETAS BÁSICAS DE EJEMPLO (Pizza Margarita)
-- ============================================================
insert into public.recipe_items (product_id, ingredient_id, quantity, unit) values
  (
    (select id from public.products where name = 'Pizza Margarita'),
    (select id from public.ingredients where name = 'Harina (paquete 4)'),
    0.250, 'kg'
  ),
  (
    (select id from public.products where name = 'Pizza Margarita'),
    (select id from public.ingredients where name = 'Mozzarella'),
    0.150, 'kg'
  ),
  (
    (select id from public.products where name = 'Pizza Margarita'),
    (select id from public.ingredients where name = 'Salsa para pizza'),
    0.100, 'pza'
  ),
  (
    (select id from public.products where name = 'Pizza Margarita'),
    (select id from public.ingredients where name = 'Albahaca fresca'),
    0.020, 'manojo'
  ),
  (
    (select id from public.products where name = 'Pizza Margarita'),
    (select id from public.ingredients where name = 'Caja para pizza'),
    1.000, 'pza'
  );
