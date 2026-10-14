import Script from 'next/script';
import ServiceWorkerRegistrar from './sw-register';
import './globals.css';

const themeBoot = `(function(){try{var t=localStorage.getItem('daymark-theme');if(t!=='dark'&&t!=='light')return;document.documentElement.dataset.theme=t;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',t==='dark'?'#12110f':'#f3efe6');}catch(e){}})();`;

export const metadata = {
  title: 'Daymark',
  description: 'A checklist for tasks',
  manifest: '/manifest.json',
  applicationName: 'Daymark',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
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
  themeColor: '#f3efe6',
  viewportFit: 'cover',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script id="daymark-theme" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeBoot }} />
        {children}
        <ServiceWorkerRegistrar />
      </body>
    </html>
  );
}
