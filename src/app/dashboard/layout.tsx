'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/context/AuthContext'
import { Header } from '@/components/layout/Header'
import { Sidebar } from '@/components/layout/Sidebar'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user) router.replace('/')
  }, [user, loading, router])

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gradient-to-br from-[#0f172a] to-[#064e3b]">
        <div className="w-10 h-10 border-4 border-white/30 border-t-white rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#f8fafc] print:h-auto print:overflow-visible print:bg-white">
      <div className="print:hidden">
        <Header />
      </div>
      <div className="flex flex-1 overflow-hidden print:overflow-visible">
        <div className="print:hidden">
          <Sidebar />
        </div>
        <main className="flex-1 overflow-y-auto p-7 print:overflow-visible print:p-0">
          {children}
        </main>
      </div>
    </div>
  )
}
