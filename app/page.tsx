// app/page.tsx
import { supabase } from "@/lib/supabaseClient";

export default async function Home() {
  const { data, error } = await supabase.from("test_table").select("*").limit(1);

  console.log("Supabase test:", data, error);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-3xl font-bold mb-4">Trial Engine</h1>
      <p className="text-gray-600">
        If you see this, your Next.js app is running.
      </p>
      <p className="mt-2 text-sm text-gray-500">
        Supabase connection status: check the console / logs.
      </p>
    </main>
  );
}
