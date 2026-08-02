'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

export default function UpdatePasswordPage() {
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.updateUser({ password })
    if (error) setError('パスワード更新に失敗しました: ' + error.message)
    else setDone(true)
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
          <p className="text-slate-400 text-sm mt-1">新しいパスワードを設定</p>
        </div>

        <div className="bg-slate-900 rounded-2xl border border-slate-800 p-6">
          {done ? (
            <div className="text-center">
              <p className="text-green-400 mb-4">パスワードを更新しました！</p>
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-xl py-3 text-sm font-medium transition-colors"
              >
                ダッシュボードへ
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">新しいパスワード</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm outline-none focus:border-blue-500 transition-colors placeholder:text-slate-600"
                  placeholder="新しいパスワード"
                  required
                  minLength={6}
                />
              </div>
              {error && <p className="text-sm text-center px-2 py-2 rounded-lg bg-red-950 text-red-400">{error}</p>}
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white rounded-xl py-3 text-sm font-medium transition-colors disabled:opacity-50"
              >
                {loading ? '処理中...' : 'パスワードを更新する'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
