/** Estilos e regras compartilhados pelas telas de conta (entrar, criar conta, recuperar e redefinir senha). */

/** Campos e botões das telas de conta (Figma: 340px de largura, raio de 4px). */
export const authInput = 'rounded-[4px] pl-4 max-md:h-[50px] max-md:rounded-[10px]'
export const authSubmit =
  'h-[45px] rounded-[4px] bg-[#d28a4c] text-[16px] font-bold text-[#140d0a] hover:bg-[#dd9a60] max-md:h-[60px] max-md:rounded-[10px]'

/**
 * Tela de toque ou estreita (celular/tablet): não focar campo ao abrir. Focar um input abre o
 * teclado virtual, a página rola e o botão de fechar sai da tela antes de a pessoa decidir.
 */
export function isTouchLayout() {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(pointer: coarse), (max-width: 767.98px)').matches
}
