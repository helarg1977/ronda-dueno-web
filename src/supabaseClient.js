import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'https://yuucexxhecryveiqirsg.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_pNKdqpKXm3WhA52zM8FdLQ_qcCL8ooz'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)

const SESSION_KEY = 'ronda_dueno_sesion'

export function guardarSesion(usuario) {
  localStorage.setItem(SESSION_KEY, JSON.stringify(usuario))
}
export function leerSesion() {
  const raw = localStorage.getItem(SESSION_KEY)
  return raw ? JSON.parse(raw) : null
}
export function cerrarSesion() {
  localStorage.removeItem(SESSION_KEY)
}
