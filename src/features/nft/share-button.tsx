/**
 * Compartilhar o NFT. Com a Web Share API (celulares e alguns desktops) abre a folha de compartilhamento do
 * sistema; sem ela, ou se ela falhar, copia o link e confirma com "Link copiado" (toast + aria-live + o próprio
 * botão). Cancelar a folha do sistema não é erro e não copia nada.
 */
import { Check, Link2, Share2 } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { announce } from '@/lib/announcer'
import { cn } from '@/lib/utils'

/** Link canônico do NFT (com a edição escolhida, se houver), sem estado de tela (login aberto etc.). */
function nftShareUrl(nftId: string, editionId?: string) {
  const url = new URL(`/nft/${encodeURIComponent(nftId)}`, window.location.origin)
  if (editionId) url.searchParams.set('edicao', editionId)
  return url.href
}

/** Folha de compartilhamento do sistema disponível (celulares, alguns desktops)? */
const canNativeShare = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function'

async function copyText(text: string) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    /* sem permissão: tenta o jeito antigo */
  }
  try {
    const area = document.createElement('textarea')
    area.value = text
    area.setAttribute('readonly', '')
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const ok = document.execCommand('copy')
    area.remove()
    return ok
  } catch {
    return false
  }
}

export function ShareButton({ nftId, nftName, editionId, variant = 'inline', className }: { nftId: string; nftName: string; editionId?: string; variant?: 'inline' | 'round'; className?: string }) {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const share = async () => {
    const url = nftShareUrl(nftId, editionId)
    if (canNativeShare()) {
      try {
        await navigator.share({ title: nftName, text: `${nftName} na Kurio`, url })
        return
      } catch (error) {
        // A pessoa fechou a folha de compartilhamento: nada a fazer.
        if (error instanceof DOMException && error.name === 'AbortError') return
        // Qualquer outra falha (sem permissão, dados recusados): copia o link.
      }
    }
    if (await copyText(url)) {
      setCopied(true)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setCopied(false), 2500)
      toast.success('Link copiado', { id: 'share-link', description: 'Cole onde quiser compartilhar.' })
      announce(`Link copiado: ${nftName}`)
    } else {
      const message = 'Não foi possível copiar o link. Copie o endereço na barra do navegador.'
      toast.error(message, { id: 'share-link' })
      announce(message, 'assertive')
    }
  }

  const Icon = copied ? Check : canNativeShare() ? Share2 : Link2
  if (variant === 'round') {
    return (
      <button
        type="button"
        onClick={() => void share()}
        aria-label={copied ? 'Link copiado' : `Compartilhar ${nftName}`}
        data-testid="share-button"
        className={cn('grid place-items-center rounded-full transition-colors hover:text-highlight', className)}
      >
        <Icon className="size-[17px]" strokeWidth={1.75} aria-hidden="true" />
      </button>
    )
  }
  return (
    <button
      type="button"
      onClick={() => void share()}
      data-testid="share-button"
      className={cn('inline-flex items-center gap-1.5 rounded-sm font-bold transition-colors hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', className)}
    >
      <Icon className="size-4" aria-hidden="true" />
      {copied ? 'Link copiado' : canNativeShare() ? 'Compartilhar…' : 'Copiar link'}
      {!copied && <span className="sr-only"> de {nftName}</span>}
    </button>
  )
}
