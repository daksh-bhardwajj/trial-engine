/* eslint-disable prefer-const */
// app/api/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { corsHeaders } from "../_cors";

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
    const { projectKey, userId, eventName, properties } = body;

    if (!projectKey || !userId || !eventName) {
      return NextResponse.json(
        { error: "projectKey, userId and eventName are required" },
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

    let { data: trialUser, error: trialError } = await supabase
      .from("trial_users")
      .select("*")
      .eq("project_id", project.id)
      .eq("external_user_id", userId)
      .maybeSingle();

    if (trialError) {
      console.error(trialError);
    }

    if (!trialUser) {
      const { data: inserted, error: insertError } = await supabase
        .from("trial_users")
        .insert({
          project_id: project.id,
          external_user_id: userId,
          first_seen_at: new Date().toISOString(),
          last_seen_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error(insertError);
        return NextResponse.json(
          { error: "Failed to create trial user" },
          { status: 500, headers: corsHeaders }
        );
      }

      trialUser = inserted;
    } else {
      await supabase
        .from("trial_users")
        .update({ last_seen_at: new Date().toISOString() })
        .eq("id", trialUser.id);
    }

    await supabase.from("events").insert({
      project_id: project.id,
      trial_user_id: trialUser.id,
      event_name: eventName,
      properties: properties || {},
      created_at: new Date().toISOString(),
    });

    return NextResponse.json({ ok: true }, { headers: corsHeaders });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500, headers: corsHeaders }
    );
  }
}
