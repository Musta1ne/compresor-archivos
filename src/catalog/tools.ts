import { FileVideo } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

export interface ToolMetadata {
  id: string
  path: `/${string}`
  name: string
  brandSuffix: string
  description: string
  category: string
  icon: LucideIcon
}

export const tools = [
  {
    id: 'video-compressor',
    path: '/comprimir-video',
    name: 'Compresor de video',
    brandSuffix: 'Compressor',
    description: 'Reduce el peso de un video con un presupuesto en MB y descarga el resultado en MP4. Procesamiento en tu navegador.',
    category: 'Video',
    icon: FileVideo,
  },
] as const satisfies readonly ToolMetadata[]

export type ToolId = typeof tools[number]['id']

export function findTool(pathname: string) {
  return tools.find((tool) => tool.path === pathname.replace(/\/+$/, ''))
}
