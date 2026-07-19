'use client'

import { useAuth } from '@/context/AuthContext'

export function Header() {
  const { user, logout } = useAuth()
  const fecha = new Date().toLocaleDateString('es-PA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })

  return (
    <header className="h-16 flex items-center justify-between px-6 bg-gradient-to-r from-[#0f172a] to-[#0f2e1f] border-b border-black/10 shrink-0">
      <div className="flex items-center gap-2.5">
        <span className="text-xl">💵</span>
        <span className="text-white font-bold text-[15px] tracking-wide">Préstamos Xpress</span>
      </div>
      <div className="flex items-center gap-4">
        <div className="text-right hidden sm:block">
          <div className="text-[12px] font-bold text-white leading-tight">{user?.nombre}</div>
          <div className="text-[10px] text-emerald-200/70 leading-tight capitalize">{fecha}</div>
        </div>
        <button
          onClick={logout}
          className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 border border-white/10 text-white text-[12px] font-semibold transition-colors"
        >
          Salir
        </button>
      </div>
    </header>
  )
}
