'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { Compass, Mail, Lock, Loader2, ArrowRight } from 'lucide-react'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const router = useRouter()
  const supabase = createClient()

  const login = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setError(error.message); setLoading(false) } else { router.refresh(); router.push('/dashboard') }
  }

  const oauth = async (provider: 'google' | 'github') => {
    setLoading(true)
    await supabase.auth.signOut()
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
        queryParams: { prompt: 'select_account' },
      },
    })
    if (error) { setError(error.message); setLoading(false) }
  }

  return (
    <div className="min-h-screen bg-slate-50/60 relative flex items-center justify-center p-6 overflow-hidden">
      {/* Decorative Ambient Glass Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-400/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-teal-400/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-14 h-14 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/25 text-white mb-3">
            <Compass size={28} />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Welcome Back</h1>
        </div>

        {/* Glass Card */}
        <div className="bg-white/80 backdrop-blur-3xl border border-white rounded-3xl p-8 sm:p-10 shadow-[0_30px_70px_rgba(0,0,0,0.05)] space-y-6">
          <form onSubmit={login} className="space-y-4">
            <div>
              <label className="font-mono text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1.5">
                Email Address
              </label>
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="email"
                  required
                  className="w-full bg-slate-50/80 border border-slate-200/80 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-medium text-slate-900 transition-all placeholder:text-slate-400 outline-none"
                  placeholder="name@company.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                />
              </div>
            </div>

            <div>
              <label className="font-mono text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1.5">
                Password
              </label>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="password"
                  required
                  className="w-full bg-slate-50/80 border border-slate-200/80 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-medium text-slate-900 transition-all placeholder:text-slate-400 outline-none"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <div className="p-3.5 bg-rose-50 border border-rose-200/80 rounded-2xl text-rose-700 text-xs font-semibold">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 px-5 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all shadow-lg shadow-emerald-600/25 active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <>Sign In <ArrowRight size={16} /></>}
            </button>
          </form>

          {/* Divider */}
          <div className="relative flex items-center justify-center">
            <div className="border-t border-slate-200/80 w-full" />
            <span className="bg-white px-3 font-mono text-[10px] uppercase tracking-wider font-bold text-slate-400 absolute">
              Or
            </span>
          </div>

          {/* Social Logins */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => oauth('google')}
              disabled={loading}
              className="py-3 px-4 rounded-2xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/80 transition-all shadow-2xs hover:shadow-xs flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              Google
            </button>
            <button
              type="button"
              onClick={() => oauth('github')}
              disabled={loading}
              className="py-3 px-4 rounded-2xl text-xs font-bold text-slate-700 bg-white hover:bg-slate-50 border border-slate-200/80 transition-all shadow-2xs hover:shadow-xs flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              GitHub
            </button>
          </div>
        </div>

        {/* Footer Link */}
        <p className="text-center text-xs text-slate-500 font-medium">
          Don&apos;t have an account?{' '}
          <Link href="/signup" className="text-emerald-700 font-bold hover:underline">
            Create an account
          </Link>
        </p>
      </div>
    </div>
  )
}