import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  metadataBase: new URL('https://squirrel-board-trish-dex.triput79.chatgpt.site'),
  title: 'Squirrel Board',
  description: 'Capture ideas with your agent. Decide what deserves to become work.',
  openGraph: {
    title: 'Squirrel Board',
    description: 'Capture ideas with your agent. Decide what deserves to become work.',
    images: [{ url: '/og.png', width: 1734, height: 907, alt: 'Squirrel Board' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Squirrel Board',
    description: 'Capture ideas with your agent. Decide what deserves to become work.',
    images: ['/og.png'],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
