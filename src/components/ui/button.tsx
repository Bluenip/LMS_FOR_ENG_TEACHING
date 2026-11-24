import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-[#4F46E5] text-white shadow-sm hover:bg-[#4338CA] hover:-translate-y-[0.5px] active:translate-y-0",
        accent:
          "bg-[#F97316] text-white shadow-sm hover:bg-[#EA580C] hover:-translate-y-[0.5px] active:translate-y-0",
        destructive:
          "bg-[#BA1A1A] text-white shadow-sm hover:bg-[#93000A]",
        outline:
          "border border-slate-200 bg-white text-[#0B1C30] hover:border-slate-300 hover:bg-slate-50",
        secondary:
          "bg-[#E5EEFF] text-[#3525CD] hover:bg-[#DCE9FF]",
        ghost: "text-[#464555] hover:bg-slate-100 hover:text-[#0B1C30]",
        link: "text-[#4F46E5] underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-11 rounded-xl px-6 text-base",
        icon: "h-9 w-9 rounded-xl",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
