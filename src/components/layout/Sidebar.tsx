'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const NAV = [
  { href: '/dashboard', label: 'Inicio', icon: '🏠', exact: true },
  { href: '/dashboard/clientes', label: 'Clientes', icon: '👥' },
  { href: '/dashboard/prestamos', label: 'Préstamos', icon: '📄' },
  { href: '/dashboard/cobros', label: 'Cobros', icon: '💰' },
  { href: '/dashboard/reportes', label: 'Reportes', icon: '📊' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="w-[220px] shrink-0 bg-white border-r border-[#e2e8f0] flex flex-col overflow-y-auto">
      <nav className="p-3 space-y-1">
        {NAV.map(item => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-colors ${
                active
                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                  : 'text-slate-600 hover:bg-slate-50 border border-transparent'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
