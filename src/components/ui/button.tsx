import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold tracking-tight transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 active:translate-y-px [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-gradient-to-br from-primary via-primary to-primary-dark text-primary-foreground shadow-[0_18px_40px_-20px_color-mix(in_oklab,var(--color-primary)_82%,black_18%)] ring-1 ring-white/40 hover:-translate-y-0.5 hover:shadow-[0_24px_52px_-22px_color-mix(in_oklab,var(--color-primary)_86%,black_14%)]",
        destructive: "bg-gradient-to-br from-destructive via-destructive to-red-700 text-destructive-foreground shadow-[0_18px_40px_-20px_oklch(0.55_0.22_27)] ring-1 ring-white/25 hover:-translate-y-0.5 hover:shadow-[0_24px_52px_-22px_oklch(0.55_0.22_27)]",
        outline:
          "glass bg-background/80 text-foreground ring-1 ring-border hover:-translate-y-0.5 hover:bg-white/92 hover:text-foreground hover:shadow-[0_18px_42px_-24px_color-mix(in_oklab,var(--color-primary)_40%,black_60%)]",
        secondary: "glass-subtle bg-secondary/90 text-secondary-foreground ring-1 ring-border hover:-translate-y-0.5 hover:bg-secondary hover:text-foreground hover:shadow-[0_18px_42px_-24px_color-mix(in_oklab,var(--color-primary)_28%,black_72%)]",
        ghost: "text-foreground/90 hover:-translate-y-0.5 hover:bg-primary-soft/80 hover:text-foreground",
        link: "text-primary underline-offset-4 hover:text-primary-dark hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-full px-3 text-xs",
        lg: "h-11 rounded-full px-8",
        icon: "h-9 w-9",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
