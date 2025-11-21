// app/api/identify/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { corsHeaders } from "../_cors"; // adjust path if different

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: corsHeaders,
  });
}

export async function POST(req: NextRequest) {
  const supabase = createServerSupabaseClient();

  try {
    const body = await req.json();
    const { projectKey, userId, email } = body;

    if (!projectKey || !userId) {
      return NextResponse.json(
        { error: "projectKey and userId are required" },
        { status: 400, headers: corsHeaders }
      );
    }

    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("*")
      .eq("public_key", projectKey)
      .single();

    if (projectError || !project) {
      return NextResponse.json(
        { error: "Project not found" },
        { status: 404, headers: corsHeaders }
      );
    }

    const { data: existingUser, error: trialError } = await supabase
      .from("trial_users")
      .select("*")
      .eq("project_id", project.id)
      .eq("external_user_id", userId)
      .maybeSingle();

    if (trialError) {
      console.error(trialError);
    }

    if (existingUser) {
      await supabase
        .from("trial_users")
        .update({
          email: email || existingUser.email,
          last_seen_at: new Date().toISOString(),
        })
        .eq("id", existingUser.id);
    } else {
      await supabase.from("trial_users").insert({
        project_id: project.id,
        external_user_id: userId,
        email: email || null,
        first_seen_at: new Date().toISOString(),
        last_seen_at: new Date().toISOString(),
      });
    }

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
