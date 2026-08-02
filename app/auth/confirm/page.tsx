'use client'

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthConfirmPage() {
  const router = useRouter()
  const searchParams = useSearchParams()

  useEffect(() => {
    const code = searchParams.get('code')
    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          router.push('/login')
        } else {
          router.push('/dashboard')
        }
      })
    } else {
      router.push('/login')
    }
  }, [router, searchParams])

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <p className="text-white text-sm">ログイン中...</p>
    </div>
  )
}
