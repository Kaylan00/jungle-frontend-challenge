# Lighthouse — mediana de 3 medições

Data: 2026-11-17T17:47:02.047Z · Lighthouse 13.6.0 · Node v22.23.5

Ambiente: linux 6.18.58.1-microsoft-standard-WSL2, 4x 13th Gen Intel(R) Core(TM) i5-13450HX, 8 GB RAM

Condições: Build de produção (vite build) servido por vite preview; cenário padrão dos mocks (latência normal 150–400 ms); perfil mobile = throttling simulado padrão do Lighthouse (Moto G Power, 4G lento, CPU 4x); desktop = preset desktop do Lighthouse.

| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| / | mobile | 71 | 100 | 100 | 100 | 4.23 s | 0 | 601 ms |
| / | desktop | 98 | 100 | 100 | 100 | 1.19 s | 0 | 6 ms |
| /nft/nft-01 | mobile | 76 | 100 | 100 | 100 | 4.05 s | 0 | 444 ms |
| /nft/nft-01 | desktop | 98 | 100 | 100 | 100 | 1.11 s | 0 | 0 ms |
