/** Telas com barra de ação própria no Figma mobile (detalhe, carrinho, pagamento) não mostram a navegação inferior. */
export const hasMobileNav = (pathname: string) => !/^\/(nft|carrinho|pagamento)/.test(pathname)
