import Spline from "@splinetool/react-spline";

export default function SplineScene({ scene, className = "" }) {
  return (
    <div className={"relative h-full w-full bg-black " + className}>
      <Spline scene={scene} className="h-full w-full" />
    </div>
  );
}
