import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { useState } from 'react'
import { TooltipProvider } from '@/components/ui/tooltip'
import { RealtimeProvider } from '@/realtime/provider'
import { createQueryClient } from './query-client'
import { createAppRouter } from './router'
import { SessionSync } from './session-sync'

export function App() {
  const [queryClient] = useState(createQueryClient)
  const [router] = useState(() => createAppRouter(queryClient))
  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeProvider>
        <TooltipProvider delayDuration={200}>
          <SessionSync router={router} />
          <RouterProvider router={router} />
        </TooltipProvider>
      </RealtimeProvider>
    </QueryClientProvider>
  )
}
