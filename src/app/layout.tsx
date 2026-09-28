import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/context/UserContext";
import { SyncProvider } from "@/context/SyncProvider";
import { GroupProvider } from "@/context/GroupContext";
import { ToastProvider } from "@/context/ToastContext";
import { ToastContainer } from "@/components/ui/Toast";
import { HapticsA11yGuard } from '@/components/ui/HapticsA11yGuard';
import { ConnectivityBanner } from '@/components/layout/ConnectivityBanner';
import { ChunkErrorRecovery } from '@/components/layout/ChunkErrorRecovery';
import { ServiceWorkerRegistrar } from '@/components/layout/ServiceWorkerRegistrar';
import { ConfirmProvider } from "@/context/ConfirmContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { RefreshProvider } from "@/context/RefreshContext";
import { LazyPushNotificationManager } from "@/components/features/LazyPushNotificationManager";
import { NavHistoryTracker } from "@/components/layout/NavHistoryTracker";
import { GlobalProgress } from "@/components/layout/GlobalProgress";
import { RouteTransitions } from "@/components/layout/RouteTransitions";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Order It All! - A aplicação #1 de compras de Celorico de Basto!",
  description: "Com esta aplicação vais acabar com todas as discussões e lutas sobre quem vai pagar as minis!",
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-32x32.png', type: 'image/png' },
      { url: '/favicon-16x16.png', type: 'image/png' },
    ],
    // Opacos (fundo branco): o iOS pinta de preto a transparência de um
    // apple-touch-icon — o ícone antigo aparecia sobre um quadrado preto.
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180' },
      { url: '/apple-touch-icon-167x167.png', sizes: '167x167' },
      { url: '/apple-touch-icon-152x152.png', sizes: '152x152' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/safari-pinned-tab.svg',
        color: '#2563eb'
      }
    ]
  },
  appleWebApp: {
    capable: true,
    title: 'Order It All!',
    // Barra opaca: o iOS 27 desfoca o topo de todas as WPAs em
    // `black-translucent` (o conteúdo passava por baixo da barra). A cor da
    // barra vem de `.status-bar-color` (globals.css / StatusBarTint). ATENÇÃO:
    // o iOS congela isto no momento da instalação — quem já tinha a app no
    // ecrã principal tem de a remover e voltar a adicionar.
    statusBarStyle: 'default',
  },
  openGraph: {
    title: "Order It All! - A aplicação #1 de compras de Celorico de Basto!",
    description: "Com esta aplicação vais acabar com todas as discussões e lutas sobre quem vai pagar as minis!",
    images: ["/gui.jpg"],
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Necessario para que env(safe-area-inset-*) devolva valores reais e para
  // que a app pinte por baixo da status bar / home indicator.
  viewportFit: 'cover',
  // Cor da barra de estado (Android/Chrome): igual ao cabeçalho, que é
  // `--surface` — branco no claro, slate-900 no escuro. (Segue o tema do
  // sistema; o tema escolhido à mão na app não chega a esta meta.)
  themeColor: [
    // Azul da marca — igual à barra do topo (`<Header>`, `.brand-surface`).
    { media: '(prefers-color-scheme: light)', color: '#2563eb' },
    { media: '(prefers-color-scheme: dark)', color: '#1e40af' },
  ],
  // Chrome/Android: encolhe o layout viewport quando o teclado abre (em vez
  // de o sobrepor por cima) — o Safari ainda não implementa isto, daí o
  // reforço via `useVisualViewport` no `<Sheet>` (funciona nos dois).
  interactiveWidget: 'resizes-content',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-PT"
      className={inter.variable}
      suppressHydrationWarning
    >
      <head>
        {/* Aplica o tema guardado antes do primeiro paint — sem flash de tema errado.
            O ThemeContext apenas reafirma o que este script ja poe no <html>. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('theme');var d=t==='dark';var c=document.documentElement.classList;c.toggle('dark',d);c.toggle('light',!d);}catch(e){}})();`,
          }}
        />
        {/* `.is-ios` no <html> antes do 1º paint — usado só por `.status-bar-tint`
            (globals.css) para disfarçar a faixa de blur que o iOS/iPadOS 27
            (beta) pinta por cima da WPA instalada; não há media query fiável
            para "isto e WebKit no iOS" (Chrome/Firefox no iOS usam o mesmo
            motor e o mesmo bug). iPad com teclado/rato reporta-se como
            Macintosh — daí o `maxTouchPoints`. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var ua=navigator.userAgent;if(/iPad|iPhone|iPod/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1)){document.documentElement.classList.add('is-ios');}}catch(e){}})();`,
          }}
        />
        {/* Vigia do arranque: se ao fim de 10 s o ecrã de arranque ainda lá
            está, o JS da app não chegou a correr (tipicamente HTML de um build
            antigo a pedir ficheiros que o servidor já não tem, logo a seguir a
            um deploy/reinício) — recarrega UMA vez, que vai buscar o HTML novo.
            Script inline de propósito: tem de funcionar exatamente quando o
            JS da app falhou. Guarda de 60 s para nunca entrar em ciclo. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `setTimeout(function(){try{if(!document.querySelector('[data-app-splash]'))return;var k='oia-boot-reload',t=+sessionStorage.getItem(k)||0;if(Date.now()-t<60000)return;sessionStorage.setItem(k,String(Date.now()));location.reload();}catch(e){}},10000);`,
          }}
        />
        {/* Next emite mobile-web-app-capable; o iOS < 16.4 ainda precisa do legado
            para entrar em standalone e respeitar o status bar translucido. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={inter.className}>
        {/* Cor da barra de estado do iOS — tem de ser um elemento real no topo. */}
        <div aria-hidden className="status-bar-color" />
        <RouteTransitions>
          <GlobalProgress />
          <UserProvider>
            <SyncProvider>
              <GroupProvider>
                <ToastProvider>
                  <ConfirmProvider>
                    <ThemeProvider>
                      <RefreshProvider>
                        {children}
                        <NavHistoryTracker />
                        <ToastContainer />
                        <HapticsA11yGuard />
                        <ConnectivityBanner />
                        <ServiceWorkerRegistrar />
                        <ChunkErrorRecovery />
                        <LazyPushNotificationManager />
                      </RefreshProvider>
                    </ThemeProvider>
                  </ConfirmProvider>
                </ToastProvider>
              </GroupProvider>
            </SyncProvider>
          </UserProvider>
        </RouteTransitions>
      </body>
    </html>
  );
}
