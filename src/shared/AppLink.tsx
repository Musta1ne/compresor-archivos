import type { AnchorHTMLAttributes } from 'react'
import { navigate } from '../catalog/router'

export function AppLink({ href = '/', onClick, children, ...props }: AnchorHTMLAttributes<HTMLAnchorElement>) {
  return <a {...props} href={href} onClick={(event) => {
    onClick?.(event)
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || props.download != null || (props.target && props.target !== '_self')) return
    const url = new URL(href, window.location.href)
    if (url.origin !== window.location.origin || url.hash || url.search) return
    event.preventDefault()
    navigate(url.pathname)
  }}>{children}</a>
}
