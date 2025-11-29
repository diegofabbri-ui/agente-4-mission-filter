import { useEffect, useState } from "react";
import axios from "axios";

interface AuditEntry {
  id: string;
  mission_id: string | null;
  user_id: string | null;
  decision_type: string;
  explanation: string;
  created_at: string | null;
}

export default function MissionAudit() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);

  useEffect(() => {
    axios
      .get(`${import.meta.env.VITE_API_URL}/admin/audit`)
      .then((res) => setLogs(res.data))
      .catch(console.error);
  }, []);

  return (
    <div className="p-10 space-y-8">
      <h1 className="text-3xl font-semibold">Mission Audit Log</h1>

      <div className="space-y-3">
        {logs.map((l) => (
          <div
            key={l.id}
            className="p-4 bg-white rounded-xl shadow-sm border"
          >
            <p className="text-sm text-gray-500">{l.created_at}</p>
            <p className="font-semibold mt-1">Decision: {l.decision_type}</p>
            <p className="text-gray-700 mt-1">
              <strong>User:</strong> {l.user_id} <br />
              <strong>Mission:</strong> {l.mission_id ?? "N/A"}
            </p>

            <pre className="bg-gray-50 p-3 rounded-lg mt-3 text-sm">
              {l.explanation}
            </pre>
          </div>
        ))}
      </div>
    </div>
  );
}
