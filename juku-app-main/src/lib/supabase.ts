import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

export const supabaseEnvReady = Boolean(
  supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your_supabase') && !supabaseAnonKey.includes('your_supabase'),
)

export const supabase: SupabaseClient = supabaseEnvReady
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
    })
  : createClient('https://placeholder.supabase.co', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder', {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    })
