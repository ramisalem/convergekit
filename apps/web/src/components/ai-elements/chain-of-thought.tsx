'use client'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { cn } from '@/lib/utils'
import { ChevronDown, Circle } from 'lucide-react'
import React from 'react'

export type ChainOfThoughtItemProps = React.ComponentProps<'div'>

export const ChainOfThoughtItem = ({ children, className, ...props }: ChainOfThoughtItemProps) => (
  <div className={cn('text-sm text-muted-foreground', className)} {...props}>
    {children}
  </div>
)

export type ChainOfThoughtTriggerProps = React.ComponentProps<typeof CollapsibleTrigger> & {
  leftIcon?: React.ReactNode
  swapIconOnHover?: boolean
}

export const ChainOfThoughtTrigger = ({
  children,
  className,
  leftIcon,
  swapIconOnHover = true,
  ...props
}: ChainOfThoughtTriggerProps) => (
  <CollapsibleTrigger
    className={cn(
      'group flex cursor-pointer items-center justify-start gap-1 text-left text-sm text-muted-foreground transition-colors hover:text-foreground',
      className,
    )}
    {...props}
  >
    <div className="flex min-w-0 flex-1 items-center gap-2">
      {leftIcon ? (
        <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
          <span className={cn('transition-opacity', swapIconOnHover && 'group-hover:opacity-0')}>
            {leftIcon}
          </span>
          {swapIconOnHover ? (
            <ChevronDown className="absolute size-4 opacity-0 transition-opacity group-hover:opacity-100 group-data-[state=open]:rotate-180" />
          ) : null}
        </span>
      ) : (
        <span className="relative inline-flex size-4 shrink-0 items-center justify-center">
          <Circle className="size-2 fill-current" />
        </span>
      )}
      <span className="min-w-0">{children}</span>
    </div>
    <ChevronDown className="ml-auto size-4 shrink-0 transition-transform group-data-[state=open]:rotate-180" />
  </CollapsibleTrigger>
)

export type ChainOfThoughtContentProps = React.ComponentProps<typeof CollapsibleContent>

export const ChainOfThoughtContent = ({
  children,
  className,
  ...props
}: ChainOfThoughtContentProps) => (
  <CollapsibleContent
    className={cn(
      'overflow-hidden text-popover-foreground outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:slide-out-to-top-2 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2',
      className,
    )}
    {...props}
  >
    <div className="grid grid-cols-[min-content_minmax(0,1fr)] gap-x-4">
      <div className="ml-[0.4375rem] h-full w-px bg-primary/20 group-data-[last=true]:hidden" />
      <div className="ml-[0.4375rem] h-full w-px bg-transparent group-data-[last=false]:hidden" />
      <div className="mt-2 min-w-0 space-y-2">{children}</div>
    </div>
  </CollapsibleContent>
)

export type ChainOfThoughtProps = {
  children: React.ReactNode
  className?: string
}

export function ChainOfThought({ children, className }: ChainOfThoughtProps) {
  const childrenArray = React.Children.toArray(children)

  return (
    <div className={cn('space-y-0', className)}>
      {childrenArray.map((child, index) => (
        <React.Fragment key={index}>
          {React.isValidElement(child)
            ? React.cloneElement(child as React.ReactElement<ChainOfThoughtStepProps>, {
                isLast: index === childrenArray.length - 1,
              })
            : null}
        </React.Fragment>
      ))}
    </div>
  )
}

export type ChainOfThoughtStepProps = {
  children: React.ReactNode
  className?: string
  isLast?: boolean
}

export const ChainOfThoughtStep = ({
  children,
  className,
  isLast = false,
  ...props
}: ChainOfThoughtStepProps & React.ComponentProps<typeof Collapsible>) => (
  <Collapsible className={cn('group', className)} data-last={isLast} {...props}>
    {children}
    <div className="flex justify-start group-data-[last=true]:hidden">
      <div className="ml-[0.4375rem] h-4 w-px bg-primary/20" />
    </div>
  </Collapsible>
)
