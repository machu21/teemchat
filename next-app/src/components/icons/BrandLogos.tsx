import React from 'react';

interface BrandLogoProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string;
  color?: string;
  className?: string;
}

/**
 * Official Google Android Bugdroid Logo
 */
export const AndroidLogo: React.FC<BrandLogoProps> = ({
  size = 24,
  color = '#3DDC84',
  className = '',
  ...props
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Android"
      role="img"
      {...props}
    >
      {/* Eyes */}
      <circle cx="7" cy="14.3" r="1" fill="#FFFFFF" />
      <circle cx="17" cy="14.3" r="1" fill="#FFFFFF" />
      {/* Bugdroid Head + Antennae */}
      <path
        d="M17.52 15.34c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1m-11.04 0c-.55 0-1-.45-1-1s.45-1 1-1 1 .45 1 1-.45 1-1 1m11.4-6.02l2-3.46c.1-.18.04-.4-.14-.5-.18-.1-.4-.04-.5.14l-2.02 3.5C15.55 8.22 13.82 7.8 12 7.8c-1.82 0-3.55.42-5.22 1.2L4.76 5.5c-.1-.18-.33-.24-.5-.14-.18.1-.24.33-.14.5l2 3.46C2.69 11.19.34 14.66 0 18.78h24c-.34-4.12-2.69-7.59-6.12-9.46z"
        fill={color}
      />
    </svg>
  );
};

/**
 * Official Apple Inc. Vector Logo
 */
export const AppleLogo: React.FC<BrandLogoProps> = ({
  size = 24,
  color = 'currentColor',
  className = '',
  ...props
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 170 170"
      fill={color}
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Apple"
      role="img"
      {...props}
    >
      <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.59-7.71-11.66-14.01-6.19-9.56-11.08-20.91-14.68-34.05-3.6-13.14-5.4-24.97-5.4-35.48 0-14.38 3.5-26.39 10.5-36.02 7-9.63 16.03-14.56 27.09-14.78 4.79 0 10.15 1.25 16.08 3.76 5.93 2.51 9.94 3.77 12.03 3.77 1.85 0 5.86-1.26 12.03-3.77 6.17-2.51 11.41-3.66 15.72-3.45 12.44.66 22.25 5.08 29.43 13.26-10.89 6.64-16.22 15.68-16 27.13.22 9.04 3.66 16.56 10.31 22.56 6.65 6 14.59 9.38 23.82 10.14-2.18 6.53-4.8 13.06-7.87 19.59zM119.22 31.84c0-7.72 2.76-14.88 8.28-21.48 5.53-6.61 12.39-10.36 20.59-11.26.11 1.09.16 1.95.16 2.59 0 7.61-2.87 14.9-8.62 21.86-5.74 6.97-12.7 10.74-20.88 11.31-.08-.87-.13-1.88-.13-3.02z" />
    </svg>
  );
};
