'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [mode, setMode] = useState<'login' | 'signup'>('login')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    if (mode === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError('メールアドレスまたはパスワードが違います')
      else router.push('/dashboard')
    } else {
      const { error } = await supabase.auth.signUp({ email, password })
      if (error) setError('登録に失敗しました: ' + error.message)
      else setError('確認メールを送りました。メールをご確認ください。')
    }
    setLoading(false)
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-blue-500 rounded-2xl mb-4">
            <span className="text-white text-2xl">📒</span>
          </div>
          <h1 className="text-2xl font-bold text-white">Kakeibo</h1>
          <p className="text-slate-400 text-sm mt-1">家計簿・会計管理アプリ</p>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          <div className="flex bg-slate-800 rounded-xl p-1 mb-6">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${mode === 'login' ? 'bg-blue-500 text-white' : 'text-slate-400'}`}
            >
              ログイン
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 text-sm font-medium rounded-lg transition-colors ${mode === 'signup' ? 'bg-blue-500 text-white' : 'text-slate-400'}`}
            >
              新規登録
            </button>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">メールアドレス</label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
                placeholder="example@email.com"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">パスワード</label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
                placeholder="••••••••"
                required
              />
            </div>

            {error && <p className="text-sm text-center px-2 py-2 rounded-lg bg-red-950 text-red-400">{error}</p>}

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-xl py-3 text-sm font-medium mt-1 transition-colors disabled:opacity-50"
            >
              {loading ? '処理中...' : mode === 'login' ? 'ログイン' : '登録する'}
            </button>
          </form>
        </div>
      </div>
    </div>
  )
}
