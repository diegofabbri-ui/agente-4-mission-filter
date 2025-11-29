import { useEffect, useState } from "react";
import axios from "axios";

interface AIMetric {
  userId: string;
  sample: number;
  avgRating: number | null;
  correlation: number | null;
  quality: string;
}

export default function AIMetrics() {
  const [metrics, setMetrics] = useState<AIMetric[]>([]);

  useEffect(() => {
    axios
      .get(`${import.meta.env.VITE_API_URL}/admin/learning/metrics`)
      .then((res) => setMetrics(res.data))
      .catch(console.error);
  }, []);

  return (
    <div className="p-10 space-y-8">
      <h1 className="text-3xl font-semibold">AI Learning Metrics</h1>

      <div className="space-y-4">
        {metrics.map((m) => (
          <div
            key={m.userId}
            className="p-4 bg-white rounded-xl shadow-sm border"
          >
            <p className="font-semibold">{m.userId}</p>
            <p className="text-gray-700">
              Samples: {m.sample}
              <br />
              Avg Rating: {m.avgRating ?? "N/A"}
              <br />
              Correlation: {m.correlation ?? "N/A"}
              <br />
              Quality: {m.quality}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}
