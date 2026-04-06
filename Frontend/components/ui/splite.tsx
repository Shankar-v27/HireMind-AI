"use client";

import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";

const Spline = dynamic(() => import("@splinetool/react-spline"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full w-full items-center justify-center bg-transparent">
      <span className="loader" />
    </div>
  ),
});

interface SplineSceneProps {
  scene: string;
  className?: string;
}

export function SplineScene({ scene, className }: SplineSceneProps) {
  return (
    <div
      className={cn(
        "relative h-full min-h-[200px] w-full bg-black [&_canvas]:bg-black [&_.spline-container]:bg-black",
        className
      )}
    >
      <Spline scene={scene} className="h-full w-full bg-transparent" />
    </div>
  );
}
