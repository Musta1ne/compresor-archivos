import { useSyncExternalStore } from 'react'

function subscribeLocation(callback: () => void) {
  window.addEventListener('popstate', callback)
  return () => window.removeEventListener('popstate', callback)
}

export function usePathname() {
  return useSyncExternalStore(subscribeLocation, () => window.location.pathname)
}

export function navigate(pathname: string) {
  if (window.location.pathname === pathname && !window.location.search && !window.location.hash) return
  window.history.pushState(null, '', pathname)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
