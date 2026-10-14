import React from 'react';
import styles from './NeoCard.module.css';

interface NeoCardProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  inner?: boolean;
}

export const NeoCard: React.FC<NeoCardProps> = ({
  children,
  inner = false,
  className = '',
  ...props
}) => {
  return (
    <div
      className={`${styles.card} ${inner ? styles.inner : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
