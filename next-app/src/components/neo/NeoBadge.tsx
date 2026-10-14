import React from 'react';
import styles from './NeoBadge.module.css';

interface NeoBadgeProps {
  children: React.ReactNode;
  color?: string;
  className?: string;
}

export const NeoBadge: React.FC<NeoBadgeProps> = ({
  children,
  color,
  className = '',
}) => {
  return (
    <span
      className={`${styles.badge} ${className}`}
      style={color ? { backgroundColor: color } : undefined}
    >
      {children}
    </span>
  );
};
