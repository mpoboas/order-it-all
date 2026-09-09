import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
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
