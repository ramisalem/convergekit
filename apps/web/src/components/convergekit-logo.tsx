import { cn } from '@/lib/utils'
import type { SVGProps } from 'react'

type ConvergeKitLogoMarkProps = SVGProps<SVGSVGElement> & {
  title?: string
}

export function ConvergeKitLogoMark({
  className,
  title,
  ...props
}: ConvergeKitLogoMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      role={title ? 'img' : 'presentation'}
      aria-hidden={title ? undefined : true}
      className={cn('block shrink-0', className)}
      {...props}
    >
      {title ? <title>{title}</title> : null}
      <rect width="32" height="32" rx="8" fill="var(--convergekit-ink)" />
      <path
        d="M8 10.25C12.6 10.25 14.8 16 20.7 16"
        fill="none"
        stroke="#f8747c"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <path
        d="M8 21.75C12.6 21.75 14.8 16 20.7 16"
        fill="none"
        stroke="#f14251"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <path
        d="M9.2 16H20.7"
        fill="none"
        stroke="white"
        strokeLinecap="round"
        strokeWidth="2.2"
      />
      <path
        d="M20.7 16L25 11.75M20.7 16L25 20.25"
        fill="none"
        stroke="#fba6a9"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
      <circle cx="8" cy="10.25" r="1.9" fill="#f8747c" />
      <circle cx="8" cy="21.75" r="1.9" fill="#f14251" />
      <circle cx="9.2" cy="16" r="1.9" fill="white" />
      <circle cx="20.7" cy="16" r="2.4" fill="#fff1f1" />
    </svg>
  )
}

type ConvergeKitLogoProps = {
  className?: string
  markClassName?: string
  labelClassName?: string
}

export function ConvergeKitLogo({
  className,
  markClassName,
  labelClassName,
}: ConvergeKitLogoProps) {
  return (
    <span className={cn('inline-flex min-w-0 items-center gap-2.5', className)}>
      <ConvergeKitLogoMark className={cn('h-6 w-6', markClassName)} />
      <span className={cn('truncate', labelClassName)}>Colab Ai Hub</span>
    </span>
  )
}
