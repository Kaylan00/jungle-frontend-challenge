import { useRouterState } from '@tanstack/react-router'
import { Heart } from 'lucide-react'
import { useOpenAuth } from '@/features/auth/auth-overlay'
import { useSession } from '@/features/auth/use-session'
import { cn } from '@/lib/utils'
import { useFavorites, useToggleFavorite } from './hooks'

export function FavoriteButton({
  nftId,
  nftName,
  size = 'md',
  withLabel = false,
  className,
  iconClassName,
}: {
  nftId: string
  nftName: string
  size?: 'sm' | 'md'
  withLabel?: boolean
  className?: string
  iconClassName?: string
}) {
  const { user } = useSession()
  const { data } = useFavorites()
  const toggle = useToggleFavorite()
  const openAuth = useOpenAuth()
  const href = useRouterState({ select: (s) => s.location.href })
  const active = Boolean(data?.nftIds.includes(nftId))

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!user) {
      // Favoritos exigem conta: login por cima desta página e volta para ela depois.
      openAuth({ redirect: href })
      return
    }
    toggle.mutate({ nftId, value: !active, name: nftName })
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? `Remover ${nftName} dos favoritos` : `Favoritar ${nftName}`}
      data-testid="favorite-button"
      className={cn(
        'relative z-20 inline-flex items-center justify-center gap-2 rounded-full border border-transparent text-foreground transition-[color,background-color,border-color,scale] duration-200 hover:border-primary/60 hover:text-primary [&>svg]:transition-transform [&>svg]:duration-200 hover:[&>svg]:scale-110',
        size === 'sm' ? 'size-8 bg-background/80' : 'h-9 rounded-md border-primary/70 px-3 text-sm',
        active && 'text-primary',
        className,
      )}
    >
      <Heart className={cn('size-4', iconClassName, active && 'fill-current')} aria-hidden="true" />
      {withLabel && <span>{active ? 'Favoritado' : 'Favoritar'}</span>}
    </button>
  )
}
