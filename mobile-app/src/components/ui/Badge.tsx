import React from 'react';
type BadgeVariant = 'neutral' | 'healthy' | 'caution' | 'alert' | 'info';
interface BadgeProps {
  children: React.ReactNode;
  variant?: BadgeVariant;
  className?: string;
  size?: 'sm' | 'md';
}
export function Badge({
  children,
  variant = 'neutral',
  className = '',
  size = 'md'
}: BadgeProps) {
  const variants = {
    neutral: 'bg-slate-100 text-slate-600 border-slate-200',
    healthy: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    caution: 'bg-amber-50 text-amber-700 border-amber-200',
    alert: 'bg-red-50 text-red-700 border-red-200',
    info: 'bg-blue-50 text-blue-700 border-blue-200'
  };
  const sizes = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-2.5 py-0.5'
  };
  return (
    <span
      className={`
      inline-flex items-center justify-center font-medium rounded-full border
      ${variants[variant]}
      ${sizes[size]}
      ${className}
    `}>
      
      {children}
    </span>);

}