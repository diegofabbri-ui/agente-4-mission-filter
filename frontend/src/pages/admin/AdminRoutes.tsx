import { Routes, Route } from "react-router-dom";
import AdminStats from "./AdminStats";
import UserManagement from "./UserManagement";
import MissionAudit from "./MissionAudit";
import AIMetrics from "./AIMetrics";

export default function AdminRoutes() {
  return (
    <Routes>
      <Route path="adminstats" element={<AdminStats />} />
      <Route path="usermanagement" element={<UserManagement />} />
      <Route path="missionaudit" element={<MissionAudit />} />
      <Route path="aimetrics" element={<AIMetrics />} />
    </Routes>
  );
}


