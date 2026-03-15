import type { SVGProps } from 'react';

export function AppIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 256 256"
      {...props}
    >
      <path fill="none" d="M0 0h256v256H0z" />
      <path
        fill="currentColor"
        d="M213 85.3V208a8 8 0 0 1-8 8H51a8 8 0 0 1-8-8V48a8 8 0 0 1 8-8h112.2a8 8 0 0 1 5.6 2.3l42 42a8 8 0 0 1 2.2 5.7Z"
        opacity=".2"
      />
      <path
        fill="currentColor"
        d="M213 88H168a8 8 0 0 1-8-8V32a8 8 0 0 0-8-8H51a16 16 0 0 0-16 16v160a16 16 0 0 0 16 16h154a16 16 0 0 0 16-16V88a8 8 0 0 0-8-8Zm-47-8h29.2L167 50.8V80Zm-32 96a40 40 0 1 1 40-40 40 40 0 0 1-40 40Z"
      />
    </svg>
  );
}
