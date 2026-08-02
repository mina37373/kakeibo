'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function Home() {
  const router = useRouter()

  useEffect(() => {
    const hash = window.location.hash
    const params = new URLSearchParams(hash.replace('#', ''))
    const type = params.get('type')
    const access_token = params.get('access_token')
    const refresh_token = params.get('refresh_token')

    if (type === 'recovery' && access_token) {
      // パスワードリセットリンク → update-passwordへ
      router.push('/update-password' + window.location.hash)
      return
    }

    if ((type === 'bearer' || type === 'signup') && access_token && refresh_token) {
      // OAuthログイン → セッション設定してdashboardへ
      supabase.auth.setSession({ access_token, refresh_token }).then(() => {
        router.push('/dashboard')
      })
      return
    }

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session) {
        router.push('/login')
      } else {
        router.push('/dashboard')
      }
    })
  }, [router])

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-500">読み込み中...</p>
    </div>
  )
}
