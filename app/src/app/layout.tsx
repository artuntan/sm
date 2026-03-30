import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "type of — Cross-Platform Marketing Analysis",
  description:
    "Analyze Instagram and TikTok creator performance simultaneously. Follower counts, organic benchmarks, commercial detection — one coordinated lookup.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();

  return (
    <html lang={locale} suppressHydrationWarning>
      <head>
        {/* Blocking script to prevent flash-of-wrong-theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var p=JSON.parse(localStorage.getItem('cb-appearance'));if(p&&p.theme&&['dark','light','system'].includes(p.theme)){document.documentElement.setAttribute('data-theme',p.theme)}else{document.documentElement.setAttribute('data-theme','dark')}}catch(e){document.documentElement.setAttribute('data-theme','dark')}})()`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} antialiased`} suppressHydrationWarning>
        <NextIntlClientProvider locale={locale} messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
