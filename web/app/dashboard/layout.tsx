import { DashboardNav } from "@/components/dashboard/DashboardNav";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <DashboardNav />
      <main className="flex-1 bg-canvas">
        <div className="max-w-6xl mx-auto px-4 md:px-6 py-10">{children}</div>
      </main>
    </>
  );
}
