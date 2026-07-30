'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Compass, Mail, Lock, User, Loader2, ArrowRight, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const supabase = createClient()

  const signup = async (e: React.FormEvent) => {
    e.preventDefault(); setLoading(true); setError(null)
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName }, emailRedirectTo: `${window.location.origin}/auth/callback` } })
    if (error) { setError(error.message); setLoading(false) } else { setSuccess(true); setLoading(false) }
  }

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50/60 relative flex items-center justify-center p-6 overflow-hidden">
        {/* Ambient Orbs */}
        <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-400/15 rounded-full blur-[120px] pointer-events-none" />
        
        <div className="w-full max-w-md relative z-10 text-center space-y-5 bg-white/80 backdrop-blur-3xl border border-white rounded-3xl p-8 sm:p-10 shadow-[0_30px_70px_rgba(0,0,0,0.05)]">
          <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-200 rounded-3xl flex items-center justify-center mx-auto text-emerald-600 shadow-xs">
            <CheckCircle2 size={32} />
          </div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Check Your Email</h1>
          <p className="text-slate-500 text-sm leading-relaxed">
            We sent a confirmation link to <span className="font-bold text-slate-900">{email}</span>. Please click the link to activate your account.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center justify-center w-full py-3.5 px-5 rounded-2xl text-sm font-bold text-white bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 transition-all shadow-lg shadow-emerald-600/25 active:scale-95"
          >
            Return to Sign In
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-slate-50/60 relative flex items-center justify-center p-6 overflow-hidden">
      {/* Ambient Glass Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[500px] h-[500px] bg-emerald-400/15 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[500px] h-[500px] bg-teal-400/15 rounded-full blur-[120px] pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Header */}
        <div className="text-center">
          <div className="w-14 h-14 bg-gradient-to-tr from-emerald-600 to-teal-500 rounded-3xl flex items-center justify-center mx-auto shadow-xl shadow-emerald-500/25 text-white mb-3">
            <Compass size={28} />
          </div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-slate-900">Create Account</h1>
        </div>

        {/* Glass Card */}
        <div className="bg-white/80 backdrop-blur-3xl border border-white rounded-3xl p-8 sm:p-10 shadow-[0_30px_70px_rgba(0,0,0,0.05)] space-y-6">
          <form onSubmit={signup} className="space-y-4">
            <div>
              <label className="font-mono text-[10px] uppercase font-bold tracking-wider text-slate-500 block mb-1.5">
                Full Name
              </label>
              <div className="relative">
                <User className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                <input
                  type="text"
                  required
                  className="w-full bg-slate-50/80 border border-slate-200/80 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 rounded-2xl pl-11 pr-4 py-3.5 text-sm font-medium text-slate-900 transition-all placeholder:text-slate-400 outline-none"
                  placeholder="Jane Doe"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                />
              </div>
            </div>

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
              {loading ? <Loader2 className="animate-spin" size={18} /> : <>Create Account <ArrowRight size={16} /></>}
            </button>
          </form>

          {/* Footer Link */}
          <p className="text-center text-xs text-slate-500 font-medium">
            Already have an account?{' '}
            <Link href="/login" className="text-emerald-700 font-bold hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}