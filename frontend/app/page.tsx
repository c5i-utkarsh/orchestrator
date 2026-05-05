"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface DBCredentials {
  db_type: string;
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
}

export default function HomePage() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [domainLabel, setDomainLabel] = useState("general");
  const [files, setFiles] = useState<File[]>([]);
  const [dbCreds, setDbCreds] = useState<DBCredentials>({
    db_type: "", host: "localhost", port: 5432,
    database: "", username: "", password: "",
  });
  const [schemaPreview, setSchemaPreview] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setFiles(Array.from(e.dataTransfer.files));
  }, []);

  const testConnection = async () => {
    if (!dbCreds.db_type) return;
    setIsConnecting(true);
    setSchemaPreview(null);
    try {
      const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const res = await fetch(`${API}/api/v1/data/test-connection`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dbCreds),
      });
      const data = await res.json();
      setSchemaPreview(JSON.stringify(data.schema ?? data, null, 2));
    } catch {
      setSchemaPreview("Connection failed");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSubmit = async () => {
    if (!query.trim()) { setError("Please enter a question or goal"); return; }
    setIsSubmitting(true);
    setError("");

    try {
      const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
      const form = new FormData();
      for (const f of files) form.append("files", f);
      form.append("domain_label", domainLabel);
      if (dbCreds.db_type) {
        form.append("db_type", dbCreds.db_type);
        form.append("host", dbCreds.host);
        form.append("port", String(dbCreds.port));
        form.append("database", dbCreds.database);
        form.append("username", dbCreds.username);
        form.append("password", dbCreds.password);
      }

      const res = await fetch(`${API}/api/v1/data/ingest`, { method: "POST", body: form });
      const data = await res.json();

      // Store query + job_id in session storage for Step 2
      sessionStorage.setItem("job_id", data.job_id);
      sessionStorage.setItem("query", query);
      sessionStorage.setItem("domain_label", domainLabel);

      router.push("/processing");
    } catch (e: any) {
      setError(e.message ?? "Failed to start");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-12">
      <div className="mb-10 text-center">
        <h1 className="text-3xl font-bold text-brand-500 mb-2">AI Fine-Tuning Orchestrator</h1>
        <p className="text-gray-400 text-sm">Build domain SLMs from your corpus. Ask anything — the system routes to the right model.</p>
      </div>

      {/* Step indicator */}
      <div className="flex gap-2 mb-8 text-xs text-gray-500">
        {["1 · Setup", "2 · Processing", "3 · Recommendations"].map((s, i) => (
          <span key={i} className={`px-3 py-1 rounded-full ${i === 0 ? "bg-brand-600 text-white" : "bg-gray-800"}`}>{s}</span>
        ))}
      </div>

      {/* Query */}
      <section className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">Your question or goal</label>
        <textarea
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-3 text-gray-100 focus:outline-none focus:border-brand-500 resize-none"
          rows={3}
          placeholder="e.g. Analyze customer churn patterns and suggest retention strategies..."
          value={query}
          onChange={e => setQuery(e.target.value)}
        />
      </section>

      <section className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">Domain label</label>
        <input
          className="w-full bg-gray-900 border border-gray-700 rounded-lg px-4 py-2 text-gray-100 focus:outline-none focus:border-brand-500"
          placeholder="e.g. customer_analytics, medical_research, legal_contracts"
          value={domainLabel}
          onChange={e => setDomainLabel(e.target.value)}
        />
      </section>

      {/* Corpus upload */}
      <section className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">Corpus files (PDF, DOCX, CSV, JSON, Parquet)</label>
        <div
          onDrop={onDrop}
          onDragOver={e => e.preventDefault()}
          className="border-2 border-dashed border-gray-700 rounded-lg p-8 text-center cursor-pointer hover:border-brand-500 transition-colors"
          onClick={() => document.getElementById("file-input")?.click()}
        >
          <input
            id="file-input" type="file" multiple className="hidden"
            onChange={e => setFiles(Array.from(e.target.files ?? []))}
          />
          {files.length > 0 ? (
            <ul className="text-left text-sm text-gray-300 space-y-1">
              {files.map(f => <li key={f.name}>📄 {f.name} ({(f.size / 1024).toFixed(1)} KB)</li>)}
            </ul>
          ) : (
            <p className="text-gray-500 text-sm">Drag & drop files here, or click to browse</p>
          )}
        </div>
      </section>

      {/* DB credentials */}
      <section className="mb-6">
        <label className="block text-sm font-medium text-gray-300 mb-2">Database connection (optional)</label>
        <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 space-y-3">
          <select
            className="w-full bg-gray-800 border border-gray-600 rounded px-3 py-2 text-gray-100 text-sm focus:outline-none"
            value={dbCreds.db_type}
            onChange={e => setDbCreds(p => ({ ...p, db_type: e.target.value }))}
          >
            <option value="">-- Select database type --</option>
            <option value="postgresql">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="sqlite">SQLite</option>
            <option value="mongodb">MongoDB</option>
          </select>

          {dbCreds.db_type && (
            <div className="grid grid-cols-2 gap-3">
              {[
                { key: "host", label: "Host" },
                { key: "port", label: "Port" },
                { key: "database", label: "Database" },
                { key: "username", label: "Username" },
              ].map(({ key, label }) => (
                <input
                  key={key} placeholder={label}
                  className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-gray-100 text-sm focus:outline-none"
                  value={(dbCreds as any)[key]}
                  onChange={e => setDbCreds(p => ({ ...p, [key]: e.target.value }))}
                />
              ))}
              <input
                type="password" placeholder="Password"
                className="bg-gray-800 border border-gray-600 rounded px-3 py-2 text-gray-100 text-sm focus:outline-none col-span-2"
                value={dbCreds.password}
                onChange={e => setDbCreds(p => ({ ...p, password: e.target.value }))}
              />
              <button
                onClick={testConnection}
                disabled={isConnecting}
                className="col-span-2 bg-gray-700 hover:bg-gray-600 text-white py-2 rounded text-sm transition-colors disabled:opacity-50"
              >
                {isConnecting ? "Connecting…" : "Test Connection & Preview Schema"}
              </button>
            </div>
          )}

          {schemaPreview && (
            <pre className="bg-gray-800 rounded p-3 text-xs text-green-400 overflow-auto max-h-48">
              {schemaPreview}
            </pre>
          )}
        </div>
      </section>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <button
        onClick={handleSubmit}
        disabled={isSubmitting}
        className="w-full bg-brand-600 hover:bg-brand-500 text-white font-semibold py-3 rounded-lg transition-colors disabled:opacity-50"
      >
        {isSubmitting ? "Starting pipeline…" : "Build Domain SLM & Get Recommendations →"}
      </button>
    </main>
  );
}
