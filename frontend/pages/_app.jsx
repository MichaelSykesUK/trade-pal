import Head from 'next/head'
import Script from 'next/script'
import '../styles/globals.css'

const apiBase = process.env.NEXT_PUBLIC_API_BASE || 'http://localhost:8000'

export default function MyApp({ Component, pageProps }) {
  return (
    <>
      <Head>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>TradePal (Next)</title>
        <link rel="icon" href="/static/icons/icons8-candlestick-chart-office-m-96.ico" />
      </Head>
      <Script
        src="https://unpkg.com/lightweight-charts@4.0.1/dist/lightweight-charts.standalone.production.js"
        strategy="beforeInteractive"
      />
      <Script id="tradepal-api-base" strategy="beforeInteractive">
        {`window.TRADEPAL_API_BASE=${JSON.stringify(apiBase)};`}
      </Script>
      <Component {...pageProps} />
    </>
  )
}
