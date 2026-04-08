import React from "react";

interface LoadingDotsProps {
  size?: number;
  children?: React.ReactNode;
}

const dots = [
  { animationDelay: "0s" },
  { animationDelay: "0.2s", marginLeft: 4 },
  { animationDelay: "0.4s", marginLeft: 4 },
];

export const LoadingDots = ({ size = 6, children }: LoadingDotsProps) => {
  return (
    <span className="inline-flex items-center">
      {children && <div className="mr-3">{children}</div>}
      {dots.map((dot, i) => (
        <span
          key={i}
          className="bg-ds-gray-900 inline-block rounded-full animate-loading"
          style={{ height: size, width: size, ...dot }}
        />
      ))}
    </span>
  );
};
