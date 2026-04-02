"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [status, setStatus] = useState("loading...");

  useEffect(() => {
    fetch("http://localhost:8000/health")
      .then((res) => res.json())
      .then((data) => setStatus(data.status))
      .catch(() => setStatus("failed"));
  }, []);

  return (
    <main className="p-10">
      <h1>Probabilis Connection Test</h1>
      <p>Backend status: {status}</p>
    </main>
  );
}
