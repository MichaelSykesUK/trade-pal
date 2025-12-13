import Script from 'next/script'
import './globals.css'

export const metadata = {
  title: 'TradePal',
  description: 'TradePal market dashboard',
  icons: {
    icon: '/static/icons/icons8-candlestick-chart-office-m-96.ico',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Script
          src="https://unpkg.com/lightweight-charts@4.0.1/dist/lightweight-charts.standalone.production.js"
          strategy="beforeInteractive"
        />
        {children}
      </body>
    </html>
  )
}
