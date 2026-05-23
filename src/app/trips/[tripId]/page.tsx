import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { TripDashboard } from "@/components/TripDashboard";
import { mockItinerary } from "@/data/mock-trip";

export default async function SavedTripPage({
  params,
}: {
  params: Promise<{ tripId: string }>;
}) {
  const { tripId } = await params;

  return (
    <div>
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 text-sm md:flex-row md:items-center md:justify-between md:px-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 font-semibold text-slate-700 hover:text-blue-700"
          >
            <ArrowLeft className="size-4" />
            Back to planner
          </Link>
          <span className="font-medium text-slate-500">
            Saved trip preview: {tripId || mockItinerary.id}
          </span>
        </div>
      </div>
      <TripDashboard />
    </div>
  );
}
