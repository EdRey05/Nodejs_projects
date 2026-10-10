import { DashboardClient } from './_components/dashboard-client';

export default function HomePage() {
    return (
        <div className="space-y-4">
            <h1 className="text-2xl font-semibold p-4 pb-0">Home</h1>
            <DashboardClient />
        </div>
    );
}