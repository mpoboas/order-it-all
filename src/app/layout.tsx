import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { UserProvider } from "@/context/UserContext";
import { GroupProvider } from "@/context/GroupContext";
import { ToastProvider } from "@/context/ToastContext";
import { ToastContainer } from "@/components/ui/Toast";
import { ThemeProvider } from "@/context/ThemeContext";
import { LazyPushNotificationManager } from "@/components/features/LazyPushNotificationManager";

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
    apple: [
      { url: '/apple-touch-icon.png' },
    ],
    other: [
      {
        rel: 'mask-icon',
        url: '/safari-pinned-tab.svg',
        color: '#7c3aed'
      }
    ]
  },
  manifest: '/manifest.json',
  openGraph: {
    title: "Order It All! - A aplicação #1 de compras de Celorico de Basto!",
    description: "Com esta aplicação vais acabar com todas as discussões e lutas sobre quem vai pagar as minis!",
    images: ["/gui.jpg"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-PT" className={inter.variable}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={inter.className}>
        <UserProvider>
          <GroupProvider>
            <ToastProvider>
              <ThemeProvider>
                {children}
                <ToastContainer />
                <LazyPushNotificationManager />
              </ThemeProvider>
            </ToastProvider>
          </GroupProvider>
        </UserProvider>
      </body>
    </html>
  );
}
