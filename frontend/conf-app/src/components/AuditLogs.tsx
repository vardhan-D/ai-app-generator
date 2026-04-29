"use client";

import { useEffect, useState } from "react";

type AuditLog = {
  id: string | number;
  userId: string;
  action: string;
  entityName: string;
  message: string;
  createdAt: string;
};

export default function AuditLogs({ userId }: { userId: string }) {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [open, setOpen] = useState(false);

  async function loadAuditLogs() {
    if (!userId) return;

    const res = await fetch(`http://localhost:5000/audit-logs?userId=${userId}`);
    const data = await res.json();

    setLogs(data);
  }

  useEffect(() => {
    loadAuditLogs();

    const interval = setInterval(loadAuditLogs, 3000);

    return () => clearInterval(interval);
  }, [userId]);

  return (
    <div className="border rounded p-4 mb-6">
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold">Audit Logs</h2>

        <button
          onClick={() => {
            setOpen(!open);
            loadAuditLogs();
          }}
          className="border px-3 py-1 rounded"
        >
          {open ? "Hide Logs" : "Show Logs"}
        </button>
      </div>

      {open && (
        <div className="mt-4">
          {logs.length === 0 ? (
            <p className="text-sm text-gray-400">No audit logs yet</p>
          ) : (
            <div className="space-y-2">
              {logs.map((log) => (
                <div key={log.id} className="border p-3 rounded text-sm">
                  <p className="font-medium">{log.message}</p>
                  <p className="text-gray-500">
                    Action: {log.action} | Entity: {log.entityName}
                  </p>
                  <p className="text-xs text-gray-400">
                    {new Date(log.createdAt).toLocaleString()}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}