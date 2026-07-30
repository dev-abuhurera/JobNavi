'use client'

import React from 'react'

type Variant = 'primary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?: Size
}

const base = 'inline-flex items-center justify-center gap-2 font-medium rounded-DEFAULT transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink'

const variants: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:bg-ink-soft',
  ghost: 'bg-transparent text-ink border border-line hover:bg-line/40',
  danger: 'bg-transparent text-clay border border-clay/30 hover:bg-clay/10',
}

const sizes: Record<Size, string> = {
  sm: 'text-xs px-3 py-2',
  md: 'text-sm px-4 py-2.5',
}

export function Button({ variant = 'primary', size = 'md', className = '', ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />
}