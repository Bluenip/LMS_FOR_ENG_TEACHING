import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default: "bg-[#EEF2FF] text-[#3525CD]",
        indigo: "bg-[#4F46E5] text-white",
        orange: "bg-[#FFEDD5] text-[#C2410C]",
        mint: "bg-[#DCFCE7] text-[#15803D]",
        sky: "bg-[#E0F2FE] text-[#0369A1]",
        purple: "bg-[#EDE9FE] text-[#6D28D9]",
        danger: "bg-[#FEF2F2] text-[#BA1A1A] border border-red-200",
        neutral: "bg-slate-100 text-slate-700",
        outline: "border border-slate-200 bg-white text-[#464555]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
