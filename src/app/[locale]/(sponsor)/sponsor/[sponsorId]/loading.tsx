import { ApplicationSkeleton } from "@/widgets/system-states";

/**
 * Loading boundary of this sidebar shell (SF-34, LD4): the content skeleton
 * renders inside the shell while a route segment renders on the server.
 */
export default function Loading() {
  return <ApplicationSkeleton />;
}
