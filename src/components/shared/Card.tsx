interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

export default function Card({
  children,
  className = "",
  title,
  action,
}: CardProps) {
  return (
    <div
      className={`bg-surface rounded-xl border border-surface-hover p-5 ${className}`}
    >
      {(title || action) && (
        <div className="flex items-center justify-between mb-4">
          {title && (
            <h3 className="text-sm font-medium text-text-muted uppercase tracking-wider">
              {title}
            </h3>
          )}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
