import './globals.css';

import type {Metadata} from 'next';
import {Geist, Geist_Mono as GeistMono} from 'next/font/google';

const geistSans = Geist({variable: '--font-geist-sans', subsets: ['latin']});
const geistMono = GeistMono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'Binary',
  description: 'Your personal AI assistant, running on your own machine.',
};

export default function RootLayout({children}: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
