# Lighthouse — mediana de 3 medições

Data: 2026-11-18T16:10:15.532Z · Lighthouse 13.6.0 · Node v22.23.5

Ambiente: linux 6.18.58.1-microsoft-standard-WSL2, 4x 13th Gen Intel(R) Core(TM) i5-13450HX, 8 GB RAM

Condições: Build de produção (vite build) servido por vite preview; cenário padrão dos mocks (latência normal 150–400 ms); perfil mobile = throttling simulado padrão do Lighthouse (Moto G Power, 4G lento, CPU 4x); desktop = preset desktop do Lighthouse.

| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| / | mobile | 82 | 100 | 100 | 100 | 3.84 s | 0 | 311 ms |
| / | desktop | 99 | 100 | 100 | 100 | 1.04 s | 0 | 0 ms |
| /nft/nft-01 | mobile | 84 | 100 | 100 | 100 | 3.78 s | 0 | 242 ms |
| /nft/nft-01 | desktop | 98 | 100 | 100 | 100 | 1.06 s | 0 | 0 ms |
