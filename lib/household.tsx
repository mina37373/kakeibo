'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type HouseholdContextType = {
  householdId: string | null
  inviteCode: string | null
  members: { user_id: string; role: string; joined_at: string }[]
  loading: boolean
  joinHousehold: (code: string) => Promise<{ error: string | null }>
  refreshHousehold: () => Promise<void>
}

const HouseholdContext = createContext<HouseholdContextType>({
  householdId: null, inviteCode: null, members: [], loading: true,
  joinHousehold: async () => ({ error: null }),
  refreshHousehold: async () => {},
})

export function HouseholdProvider({ children }: { children: React.ReactNode }) {
  const [householdId, setHouseholdId] = useState<string | null>(null)
  const [inviteCode, setInviteCode] = useState<string | null>(null)
  const [members, setMembers] = useState<{ user_id: string; role: string; joined_at: string }[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) initHousehold(session.user.id)
      else { setHouseholdId(null); setInviteCode(null); setLoading(false) }
    })
    return () => subscription.unsubscribe()
  }, [])

  const initHousehold = async (userId: string) => {
    setLoading(true)
    // すでに世帯に所属しているか確認
    const { data: member } = await supabase
      .from('household_members')
      .select('household_id')
      .eq('user_id', userId)
      .single()

    if (member?.household_id) {
      await loadHousehold(member.household_id)
    } else {
      // UUIDをクライアント側で生成してから挿入（RLSのタイミング問題を回避）
      const newId = crypto.randomUUID()
      await supabase.from('households').insert({ id: newId, created_by: userId })
      await supabase.from('household_members').insert({
        household_id: newId,
        user_id: userId,
        role: 'owner',
      })
      // 既存データを世帯に紐付け
      await supabase.from('transactions').update({ household_id: newId })
        .eq('created_by', userId).is('household_id', null)
      await supabase.from('accounts').update({ household_id: newId })
        .is('household_id', null)
      await supabase.from('payment_methods').update({ household_id: newId })
        .is('household_id', null)
      await loadHousehold(newId)
    }
    setLoading(false)
  }

  const loadHousehold = async (id: string) => {
    const { data: household } = await supabase
      .from('households')
      .select('id, invite_code')
      .eq('id', id)
      .single()
    if (household) {
      setHouseholdId(household.id)
      setInviteCode(household.invite_code)
    }
    const { data: mems } = await supabase
      .from('household_members')
      .select('user_id, role, joined_at')
      .eq('household_id', id)
    if (mems) setMembers(mems)
  }

  const joinHousehold = async (code: string): Promise<{ error: string | null }> => {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return { error: 'ログインが必要です' }

    const { data: household } = await supabase
      .from('households')
      .select('id')
      .eq('invite_code', code.toUpperCase().trim())
      .single()

    if (!household) return { error: '招待コードが正しくありません' }

    // すでに同じ世帯なら何もしない
    if (household.id === householdId) return { error: 'すでにこの家計簿に参加しています' }

    const { error } = await supabase.from('household_members').insert({
      household_id: household.id,
      user_id: session.user.id,
      role: 'member',
    })

    if (error) return { error: '参加に失敗しました' }

    // 既存データを新しい世帯に移す
    await supabase.from('transactions').update({ household_id: household.id })
      .eq('created_by', session.user.id)
    await loadHousehold(household.id)
    return { error: null }
  }

  const refreshHousehold = async () => {
    if (householdId) await loadHousehold(householdId)
  }

  return (
    <HouseholdContext.Provider value={{ householdId, inviteCode, members, loading, joinHousehold, refreshHousehold }}>
      {children}
    </HouseholdContext.Provider>
  )
}

export const useHousehold = () => useContext(HouseholdContext)
