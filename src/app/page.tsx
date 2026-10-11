import { auth } from "@clerk/nextjs/server";
import AuthenticatedApp from "@/components/AuthenticatedApp";

export default async function HomePage() {
  await auth.protect();
  return <AuthenticatedApp />;
}
