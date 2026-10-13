import ServiceWorkerRegistrar from './sw-register';
import './globals.css';

export const metadata = {
  title: 'Daymark',
  description: 'A checklist for tasks',
  manifest: '/manifest.json',
  applicationName: 'Daymark',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Daymark',
  },
  icons: {
    icon: [
      { url: '/icons/favicon-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: '/icons/apple-touch-icon.png',
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  themeColor: '#10140f',
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
