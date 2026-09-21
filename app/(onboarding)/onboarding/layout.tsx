import type { ReactNode } from "react";

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <div className="flex min-h-screen items-start justify-center bg-scene p-4 md:items-center md:p-8">{children}</div>;
}
