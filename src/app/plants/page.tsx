import { auth } from "@clerk/nextjs/server";
import Link from "next/link";
import ToastContainer from "@/components/Toast";
import AuthenticatedApp from "@/components/AuthenticatedApp";
import AuthControls from "@/components/AuthControls";

// Standalone route for the same plant/job-site admin shown in the main app's Plants tab
export default async function PlantsPage() {
  await auth.protect();
  return (
    <div className="min-h-screen bg-surface text-on-surface">
      <ToastContainer />
      <header className="sticky top-0 z-30 flex items-center h-14 px-5 bg-primary text-on-primary shadow-md gap-3">
        <Link href="/" className="flex items-center gap-1 text-on-primary/80 hover:text-on-primary transition-colors text-sm">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M19 12H5M12 5l-7 7 7 7" />
          </svg>
          Back
        </Link>
        <span className="h-4 w-px bg-on-primary/30" />
        <span className="font-medium tracking-wide flex-1">Plants &amp; Job Sites</span>
        <AuthControls />
      </header>
      <AuthenticatedApp catalogueOnly />
    </div>
  );
}
