"use client";

import { useEffect, useState } from "react";

export default function Notifications({ userId }: { userId: string }) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [open, setOpen] = useState(false);

  async function loadNotifications() {
    if (!userId) return;

    const res = await fetch(`http://localhost:5000/notifications?userId=${userId}`);
    const data = await res.json();
    setNotifications(data);
  }

  useEffect(() => {
    loadNotifications();

    const interval = setInterval(loadNotifications, 2000);

    return () => clearInterval(interval);
  }, [userId]);

  return (
    <div className="relative">
      <button
        onClick={() => {
          setOpen(!open);
          loadNotifications();
        }}
        className="relative text-xl"
      >
        🔔

        {notifications.length > 0 && (
          <span className="absolute -top-2 -right-2 bg-red-600 text-white text-xs px-1 rounded-full">
            {notifications.length}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white border shadow rounded p-2 z-50">
          {notifications.length === 0 ? (
            <p className="text-sm text-gray-400">No notifications</p>
          ) : (
            notifications.map((n) => (
              <div key={n.id} className="border-b p-2 text-sm">
                <p>{n.message}</p>
                <p className="text-xs text-gray-400">
                  {new Date(n.createdAt).toLocaleString()}
                </p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}