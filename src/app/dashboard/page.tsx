'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase/client'
import { fmtMoney, reconciliarPrestamosVencidos } from '@/lib/prestamos'

interface Stats {
  totalClientes: number
  prestamosActivos: number
  carteraActiva: number
  cuotasAtrasadas: number
  cobradoMes: number
  cobradoMesAnterior: number
}

export default function DashboardHome() {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      const hoy = new Date().toISOString().slice(0, 10)
      // Cobrado esta quincena: el ciclo real de cobro es 1-15 / 16-fin de mes, no el mes calendario completo.
      const hoyDate = new Date()
      const anioMes = hoyDate.toISOString().slice(0, 7)
      const inicioQuincena = hoyDate.getDate() <= 15 ? `${anioMes}-01` : `${anioMes}-16`
      // Mes calendario anterior completo (1 al ultimo dia).
      const inicioMesAnterior = new Date(hoyDate.getFullYear(), hoyDate.getMonth() - 1, 1).toISOString().slice(0, 10)
      const finMesAnterior = new Date(hoyDate.getFullYear(), hoyDate.getMonth(), 0).toISOString().slice(0, 10)
      await reconciliarPrestamosVencidos(supabase)

      const [clientesRes, prestamosRes, cuotasTodasRes, cuotasRes, pagosMesRes, pagosMesAnteriorRes] = await Promise.all([
        supabase.from('clientes').select('id', { count: 'exact', head: true }).eq('activo', true),
        supabase.from('prestamos').select('id,monto,estado').in('estado', ['activo', 'en_mora']),
        supabase.from('cuotas').select('prestamo_id,monto_pagado,interes'),
        supabase.from('cuotas').select('id,fecha_vencimiento,estado').lt('fecha_vencimiento', hoy).in('estado', ['pendiente', 'atrasada']),
        supabase.from('pagos').select('monto').gte('fecha', inicioQuincena),
        supabase.from('pagos').select('monto').gte('fecha', inicioMesAnterior).lte('fecha', finMesAnterior),
      ])

      // Cartera activa = saldo de capital pendiente (monto - abonos a capital), no el monto original desembolsado.
      const capitalPagadoPorPrestamo = new Map<number, number>()
      for (const c of (cuotasTodasRes.data || []) as any[]) {
        const abono = Math.max(0, Number(c.monto_pagado || 0) - Number(c.interes || 0))
        capitalPagadoPorPrestamo.set(c.prestamo_id, (capitalPagadoPorPrestamo.get(c.prestamo_id) || 0) + abono)
      }
      const carteraActiva = (prestamosRes.data || []).reduce((s, p: any) =>
        s + Math.max(0, Number(p.monto || 0) - (capitalPagadoPorPrestamo.get(p.id) || 0)), 0)
      const cobradoMes = (pagosMesRes.data || []).reduce((s, p: any) => s + Number(p.monto || 0), 0)
      const cobradoMesAnterior = (pagosMesAnteriorRes.data || []).reduce((s, p: any) => s + Number(p.monto || 0), 0)

      setStats({
        totalClientes: clientesRes.count || 0,
        prestamosActivos: (prestamosRes.data || []).length,
        carteraActiva,
        cuotasAtrasadas: (cuotasRes.data || []).length,
        cobradoMes,
        cobradoMesAnterior,
      })
      setLoading(false)
    })()
  }, [])

  const cards = [
    { label: 'Clientes activos', value: stats?.totalClientes ?? 0, icon: '👥', color: 'from-[#0369a1] to-[#0284c7]', href: '/dashboard/clientes' },
    { label: 'Préstamos activos', value: stats?.prestamosActivos ?? 0, icon: '📄', color: 'from-[#059669] to-[#10b981]', href: '/dashboard/prestamos' },
    { label: 'Cartera activa', value: fmtMoney(stats?.carteraActiva), icon: '💰', color: 'from-[#7c3aed] to-[#a855f7]', href: '/dashboard/prestamos' },
    { label: 'Cuotas atrasadas', value: stats?.cuotasAtrasadas ?? 0, icon: '⚠️', color: 'from-[#dc2626] to-[#ef4444]', href: '/dashboard/reportes' },
    { label: 'Cobrado esta quincena', value: fmtMoney(stats?.cobradoMes), icon: '✅', color: 'from-[#0f172a] to-[#334155]', href: '/dashboard/reportes' },
    { label: 'Cobrado mes anterior', value: fmtMoney(stats?.cobradoMesAnterior), icon: '📅', color: 'from-[#b45309] to-[#d97706]', href: '/dashboard/reportes' },
  ]

  return (
    <div className="space-y-6 animate-fadeIn">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a]">Inicio</h1>
        <p className="text-[14px] text-slate-500 mt-0.5">Resumen general del sistema de préstamos</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        {cards.map(c => (
          <Link key={c.label} href={c.href} className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm overflow-hidden hover:shadow-md transition-shadow">
            <div className={`h-1.5 bg-gradient-to-r ${c.color}`} />
            <div className="p-5">
              <div className="flex items-center justify-between mb-2">
                <span className="text-2xl">{c.icon}</span>
              </div>
              <div className="text-[22px] font-extrabold text-[#0f172a] leading-tight">
                {loading ? '…' : c.value}
              </div>
              <div className="text-[12px] text-slate-500 mt-0.5">{c.label}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[#e2e8f0] shadow-sm p-6">
        <div className="text-[15px] font-bold text-[#0f172a] mb-3">Accesos rápidos</div>
        <div className="flex flex-wrap gap-3">
          <Link href="/dashboard/clientes" className="px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[13px] font-bold hover:bg-emerald-100 transition-colors">
            ＋ Nuevo cliente
          </Link>
          <Link href="/dashboard/prestamos" className="px-4 py-2.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 text-[13px] font-bold hover:bg-emerald-100 transition-colors">
            ＋ Nuevo préstamo
          </Link>
          <Link href="/dashboard/reportes" className="px-4 py-2.5 rounded-lg bg-slate-50 border border-slate-200 text-slate-700 text-[13px] font-bold hover:bg-slate-100 transition-colors">
            📊 Ver reportes
          </Link>
        </div>
      </div>
    </div>
  )
}
