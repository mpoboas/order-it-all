import type { Metadata } from "next";
import "./globals.css";
import { UserProvider } from "@/context/UserContext";
import { GroupProvider } from "@/context/GroupContext";
import { ToastProvider } from "@/context/ToastContext";
import { ToastContainer } from "@/components/ui/Toast";
import { ThemeProvider } from "@/context/ThemeContext";
import PushNotificationManager from "@/components/features/PushNotificationManager";
import PageTransition from "@/components/layout/PageTransition";


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
    <html lang="pt-PT">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Poppins:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/icon?family=Material+Icons"
          rel="stylesheet"
        />
      </head>
      <body>
        <UserProvider>
          <GroupProvider>
            <ToastProvider>
              <ThemeProvider>
                {children}
                <ToastContainer />
                <PushNotificationManager />

              </ThemeProvider>
            </ToastProvider>
          </GroupProvider>
        </UserProvider>
      </body>
    </html>
  );
}
