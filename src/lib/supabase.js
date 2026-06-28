import { createClient } from '@supabase/supabase-js'

const supabaseUrl  = import.meta.env.VITE_SUPABASE_URL
const supabaseKey  = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    '⚠️  Faltan variables de entorno de Supabase.\n' +
    'Copia .env.example como .env y llena los valores.'
  )
}

export const supabase = createClient(supabaseUrl ?? '', supabaseKey ?? '')
