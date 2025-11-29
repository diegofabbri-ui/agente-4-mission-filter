import { useEffect, useState } from "react";
import axios from "axios";

interface StatsResponse {
  totalUsers: number;
  totalMissions: number;
  activeUsers: number;
  avgRating: number | null;
  avgScore: number | null;
}

export default function AdminStats() {
  const [stats, setStats] = useState<StatsResponse | null>(null);

  useEffect(() => {
    axios
      .get(`${import.meta.env.VITE_API_URL}/admin/stats`)
      .then((res) => setStats(res.data))
      .catch(console.error);
  }, []);

  if (!stats)
    return <div className="p-8 text-gray-400">Loading statistics...</div>;

  return (
    <div className="p-10 space-y-10">
      <h1 className="text-3xl font-semibold">Admin Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card title="Total Users" value={stats.totalUsers} />
        <Card title="Total Missions" value={stats.totalMissions} />
        <Card title="Active Users" value={stats.activeUsers} />
        <Card title="Avg Rating" value={stats.avgRating ?? "N/A"} />
        <Card title="Avg Score" value={stats.avgScore ?? "N/A"} />
      </div>
    </div>
  );
}

function Card({ title, value }: { title: string; value: any }) {
  return (
    <div className="p-6 bg-white rounded-xl shadow-sm">
      <p className="text-gray-500">{title}</p>
      <p className="text-2xl font-bold mt-2">{value}</p>
    </div>
  );
}
