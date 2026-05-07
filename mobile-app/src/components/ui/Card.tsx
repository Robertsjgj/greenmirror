import React from 'react';
interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
  action?: React.ReactNode;
  noPadding?: boolean;
}
export function Card({
  title,
  action,
  children,
  className = '',
  noPadding = false,
  ...props
}: CardProps) {
  return (
    <div
      className={`bg-white border border-slate-200 rounded-sm overflow-hidden ${className}`}
      {...props}>
      
      {(title || action) &&
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50/50">
          {title &&
        <h3 className="font-medium text-slate-700 text-sm uppercase tracking-wide">
              {title}
            </h3>
        }
          {action && <div>{action}</div>}
        </div>
      }
      <div className={noPadding ? '' : 'p-4'}>{children}</div>
    </div>);

}