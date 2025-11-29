import { useEffect, useState } from "react";
import axios from "axios";

interface User {
  id: string;
  email: string;
  status: string | null;
  created_at: string | null;
}

export default function UserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    axios
      .get(`${import.meta.env.VITE_API_URL}/admin/users`)
      .then((res) => setUsers(res.data))
      .catch(console.error);
  }, []);

  const filtered = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.id.includes(search)
  );

  return (
    <div className="p-10 space-y-8">
      <h1 className="text-3xl font-semibold">User Management</h1>

      <input
        type="text"
        className="px-4 py-2 border rounded-lg w-full"
        placeholder="Search user by email or ID"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="space-y-3">
        {filtered.map((u) => (
          <div
            key={u.id}
            className="p-4 bg-white rounded-xl shadow-sm flex justify-between"
          >
            <div>
              <p className="font-semibold">{u.email}</p>
              <p className="text-sm text-gray-500">{u.id}</p>
              <p className="text-sm text-gray-500">
                Status: {u.status ?? "N/A"}
              </p>
            </div>

            <button
              className="px-4 py-2 bg-blue-600 text-white rounded-lg"
              onClick={() =>
                axios.post(
                  `${import.meta.env.VITE_API_URL}/admin/learning/run/${u.id}`
                )
              }
            >
              Run Learning
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
