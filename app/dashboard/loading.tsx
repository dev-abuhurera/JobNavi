import React from 'react'

export default function DashboardLoading() {
  return (
    <div className="animate-pulse space-y-6">
      <div className="h-8 w-48 bg-line/40 rounded-DEFAULT" />
      <div className="h-4 w-72 bg-line/30 rounded-DEFAULT" />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-28 bg-surface border border-line/50 rounded-DEFAULT p-4 flex flex-col justify-between">
            <div className="h-3 w-20 bg-line/50 rounded" />
            <div className="h-8 w-16 bg-line/60 rounded" />
            <div className="h-2 w-24 bg-line/40 rounded" />
          </div>
        ))}
      </div>

      <div className="h-64 bg-surface border border-line/50 rounded-DEFAULT p-6 mt-8" />
    </div>
  )
}
