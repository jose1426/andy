import { createClient } from '@supabase/supabase-js'

// Mismo proyecto Supabase que Planilla C11 — tablas propias con prefijo prestamos_.
export const SUPABASE_URL = 'https://zwaebrdgqrchrqdyenck.supabase.co'
export const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3YWVicmRncXJjaHJxZHllbmNrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzkxNTAxNzAsImV4cCI6MjA5NDcyNjE3MH0.X8MKHa6zhUdQw5zW2DSRogoZtV2iHEAWc8ScqvbzkXc'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storageKey: 'prestamos-auth',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})
