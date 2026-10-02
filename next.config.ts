import type { NextConfig } from "next";

// ID do build, partilhado com o service worker (`SW_URL` leva-o no URL): cada
// deploy instala um SW novo que pré-guarda os estáticos desse build — ver
// `public/sw.js` e `src/app/sw-manifest.json/route.ts`.
// Gerado UMA vez por processo (o config é avaliado várias vezes, e os workers
// do build herdam o `process.env`) — senão cada avaliação dava um id diferente.
if (!process.env.BUILD_ID) process.env.BUILD_ID = Date.now().toString(36);
const buildId = process.env.BUILD_ID;

const nextConfig: NextConfig = {
  poweredByHeader: false,
  generateBuildId: () => buildId,
  env: {
    NEXT_PUBLIC_BUILD_ID: buildId,
  },
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
    // As páginas são todas client components que lêem da cache local (Dexie),
    // por isso o payload RSC de cada rota é praticamente estático. O default
    // `dynamic: 0` fá-lo re-buscar a cada navegação (2s em 3G, mesmo em
    // revisitas). Cachear no Router Cache do cliente → revisita instantânea, e
    // o `router.prefetch` passa a valer a pena.
    staleTimes: {
      dynamic: 300,
      static: 600,
    },
    // Prefetch de hover/intent passa a ser um prefetch dinâmico completo (não só
    // o shell), para a navegação seguinte não pagar nada.
    dynamicOnHover: true,
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pb-orderit.povoas.top",
      },
      {
        protocol: "https",
        hostname: "www.continente.pt",
      },
      {
        protocol: "https",
        hostname: "www.pingodoce.pt",
      },
    ],
  },
};

export default nextConfig;
