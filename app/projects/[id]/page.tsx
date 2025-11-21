"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Project = {
  id: string;
  name: string;
  public_key: string;
};

export default function ProjectDetailPage() {
  const router = useRouter();
  const params = useParams();
  const projectId = params?.id as string;
  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);

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
        .eq("id", projectId)
        .eq("owner_id", user.id)
        .single();

      if (!error && data) {
        setProject(data as Project);
      }

      setLoading(false);
    };

    load();
  }, [projectId, router]);

  if (loading) return <div className="p-6">Loading...</div>;
  if (!project) return <div className="p-6">Project not found</div>;

  const snippet = `
<script>
(function() {
  const PROJECT_KEY = "${project.public_key}";
  const BASE_URL = "https://YOUR_APP_DOMAIN_HERE"; // replace with your deployed domain

  window.TrialEngine = {
    identify: function(userId, email) {
      fetch(BASE_URL + "/api/identify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectKey: PROJECT_KEY, userId, email }),
      });
    },
    track: function(userId, eventName, properties) {
      fetch(BASE_URL + "/api/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectKey: PROJECT_KEY,
          userId,
          eventName,
          properties: properties || {},
        }),
      });
    }
  };
})();
</script>
`.trim();

  return (
    <main className="p-6 space-y-4">
      <h1 className="text-2xl font-bold">{project.name}</h1>
      <p className="text-sm text-gray-600">
        Public key: <code>{project.public_key}</code>
      </p>

      <section className="space-y-2">
        <h2 className="font-semibold">Install snippet</h2>
        <p className="text-sm text-gray-600">
          Paste this into your app&apos;s HTML (or main layout) and replace
          <code>trial-engine.vercel.app</code> with your real domain.
        </p>
        <pre className="bg-gray-900 text-gray-100 text-xs p-4 rounded overflow-x-auto">
          {snippet}
        </pre>
      </section>
    </main>
  );
}
