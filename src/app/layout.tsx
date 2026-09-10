import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { UserProvider } from "@/context/UserContext";
import { SyncProvider } from "@/context/SyncProvider";
import { GroupProvider } from "@/context/GroupContext";
import { ToastProvider } from "@/context/ToastContext";
import { ToastContainer } from "@/components/ui/Toast";
import { ThemeProvider } from "@/context/ThemeContext";
import { RefreshProvider } from "@/context/RefreshContext";
import { LazyPushNotificationManager } from "@/components/features/LazyPushNotificationManager";
import { NavHistoryTracker } from "@/components/layout/NavHistoryTracker";
import { GlobalProgress } from "@/components/layout/GlobalProgress";
import { ViewTransitions } from "next-view-transitions";

const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-inter",
});

// Self-hosted (era um <link> render-blocking para fonts.googleapis.com).
const materialIcons = localFont({
  src: "./fonts/material-icons.woff2",
  weight: "400",
  style: "normal",
  display: "block",
  variable: "--font-material-icons",
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
    apple: [
      { url: '/apple-touch-icon.png' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/safari-pinned-tab.svg',
        color: '#2563eb'
      }
    ]
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'Order It All!',
    // Deixa o conteudo passar por baixo da status bar para que as faixas de
    // topo/fundo fiquem com o fundo do ecra atual em vez do fundo do body.
    statusBarStyle: 'black-translucent',
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
  // Cor da status bar no Android: igual ao topo dos ecras (Header / gradient-mesh).
  themeColor: '#2563eb',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-PT"
      className={`${inter.variable} ${materialIcons.variable}`}
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
        {/* Next emite mobile-web-app-capable; o iOS < 16.4 ainda precisa do legado
            para entrar em standalone e respeitar o status bar translucido. */}
        <meta name="apple-mobile-web-app-capable" content="yes" />
      </head>
      <body className={inter.className}>
        <ViewTransitions>
          <GlobalProgress />
          <UserProvider>
            <SyncProvider>
              <GroupProvider>
                <ToastProvider>
                  <ThemeProvider>
                    <RefreshProvider>
                      {children}
                      <NavHistoryTracker />
                      <ToastContainer />
                      <LazyPushNotificationManager />
                    </RefreshProvider>
                  </ThemeProvider>
                </ToastProvider>
              </GroupProvider>
            </SyncProvider>
          </UserProvider>
        </ViewTransitions>
      </body>
    </html>
  );
}
