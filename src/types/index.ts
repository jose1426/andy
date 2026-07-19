export interface Cliente {
  id: number
  nombre: string
  apellido: string | null
  cedula: string | null
  telefono: string | null
  direccion: string | null
  email: string | null
  referencia: string | null
  activo: boolean
  created_at: string
}

export type EstadoPrestamo = 'activo' | 'pagado' | 'en_mora' | 'cancelado'
export type Frecuencia = 'semanal' | 'quincenal' | 'mensual'

export interface Prestamo {
  id: number
  cliente_id: number
  monto: number
  tasa_interes: number
  frecuencia: Frecuencia
  num_cuotas: number
  fecha_inicio: string
  estado: EstadoPrestamo
  notas: string | null
  created_at: string
  cliente?: Cliente
}

export type EstadoCuota = 'pendiente' | 'pagada' | 'parcial' | 'atrasada' | 'capitalizada'

export interface Cuota {
  id: number
  prestamo_id: number
  numero: number
  fecha_vencimiento: string
  capital: number
  interes: number
  monto_cuota: number
  monto_pagado: number
  saldo_capital: number
  estado: EstadoCuota
  created_at: string
}

export interface Pago {
  id: number
  cuota_id: number
  prestamo_id: number
  monto: number
  fecha: string
  tipo: 'interes' | 'capital' | 'mixto'
  notas: string | null
  created_at: string
}

export interface Desembolso {
  id: number
  prestamo_id: number
  monto: number
  fecha: string
  notas: string | null
  created_at: string
}
