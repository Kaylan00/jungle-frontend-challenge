# Lighthouse — mediana de 5 medições

Data: 2026-11-18T21:18:40.360Z · Lighthouse 13.6.0 · Node v22.23.5

Ambiente: linux 6.18.58.1-microsoft-standard-WSL2, 4x 13th Gen Intel(R) Core(TM) i5-13450HX, 8 GB RAM

Condições: Build de produção (vite build) servido por vite preview em HTTPS/HTTP2 (como a Vercel); cenário padrão dos mocks (latência normal 150–400 ms); perfil mobile = throttling simulado padrão do Lighthouse (Moto G Power, 4G lento, CPU 4x); desktop = preset desktop do Lighthouse.

| Página | Perfil | Performance | Accessibility | Best Practices | SEO | LCP | CLS | TBT |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| / | mobile | 90 | 100 | 100 | 100 | 2.19 s | 0 | 363 ms |
| / | desktop | 100 | 100 | 100 | 100 | 0.55 s | 0 | 9 ms |
| /nft/nft-01 | mobile | 94 | 100 | 100 | 100 | 2.12 s | 0 | 266 ms |
| /nft/nft-01 | desktop | 100 | 100 | 100 | 100 | 0.51 s | 0 | 0 ms |
