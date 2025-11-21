"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Project = {
  id: string;
  name: string;
  public_key: string;
};

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/login");
        return;
      }

      const { data, error } = await supabase
        .from("projects")
        .select("*")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        setError(error.message);
      } else {
        setProjects((data || []) as Project[]);
      }

      setLoading(false);
    };

    load();
  }, [router]);

  const createProject = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!newName.trim()) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      router.push("/login");
      return;
    }

    const publicKey = crypto.randomUUID();

    const { data, error } = await supabase
      .from("projects")
      .insert({
        name: newName.trim(),
        owner_id: user.id,
        public_key: publicKey,
      })
      .select()
      .single();

    if (error) {
      setError(error.message);
      return;
    }

    setProjects((prev) => [...prev, data as Project]);
    setNewName("");
  };

  if (loading) return <div className="p-6">Loading...</div>;

  return (
    <main className="p-6 space-y-6">
      <h1 className="text-2xl font-bold mb-4">Your Projects</h1>

      <form onSubmit={createProject} className="flex gap-2 items-center">
        <input
          className="border px-3 py-2 rounded flex-1"
          placeholder="Project name (e.g. My SaaS App)"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <button className="px-4 py-2 rounded bg-black text-white" type="submit">
          Create
        </button>
      </form>

      {error && <p className="text-sm text-red-500">{error}</p>}

      <ul className="mt-4 space-y-2">
        {projects.map((p) => (
          <li
            key={p.id}
            className="border rounded p-3 cursor-pointer hover:bg-gray-50"
            onClick={() => router.push(`/projects/${p.id}`)}
          >
            <div className="font-medium">{p.name}</div>
            <div className="text-xs text-gray-500">
              Public key: <code>{p.public_key}</code>
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
