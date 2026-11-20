import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App as CapacitorApp } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import './index.css'
import App from './App.jsx'
import { supabase } from './lib/supabase'

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/service-worker.js').catch((error) => {
      console.error('Seyami service worker registration failed:', error)
    })
  })
}

if (Capacitor.isNativePlatform() && supabase) {
  const handleAuthUrl = async (rawUrl) => {
    if (!rawUrl) return
    const url = new URL(rawUrl)
    if (url.protocol !== 'com.seyami.app:' || url.hostname !== 'login-callback' || url.pathname !== '/') return

    const params = new URLSearchParams(url.hash.slice(1))
    const errorDescription = params.get('error_description')
    if (errorDescription) throw new Error(errorDescription)

    const code = url.searchParams.get('code')
    const result = code ? await supabase.auth.exchangeCodeForSession(code) : null
    if (result?.error) throw result.error
  }

  const reportAuthUrlError = (error) => console.error('Seyami email confirmation failed:', error)
  CapacitorApp.addListener('appUrlOpen', ({ url }) => {
    handleAuthUrl(url).catch(reportAuthUrlError)
  })
  CapacitorApp.getLaunchUrl()
    .then(({ url } = {}) => handleAuthUrl(url))
    .catch(reportAuthUrlError)
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
