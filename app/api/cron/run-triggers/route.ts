import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabaseServer";
import { Resend } from "resend";
import { corsHeaders } from "../../_cors"; // if you created the shared file

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (token !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = createServerSupabaseClient();
  const resend = new Resend(process.env.RESEND_API_KEY);

  // 1. get all triggers
  const { data: triggers } = await supabase
    .from("triggers")
    .select("*")
    .eq("active", true);

  if (!triggers || triggers.length === 0) {
    return NextResponse.json({ ok: true, msg: "No active triggers" });
  }

  for (const trigger of triggers) {
    if (trigger.type !== "no_return_after_signup") continue;

    const hours = trigger.params.hours || 24;

    // users who signed up but never returned in the last X hours
    const { data: matches } = await supabase.rpc(
      "find_inactive_trial_users", // we'll add SQL soon
      {
        project_id_input: trigger.project_id,
        hours_input: hours,
      }
    );

    for (const user of matches || []) {
      // avoid sending duplicates
      const { data: existingNudge } = await supabase
        .from("nudges")
        .select("*")
        .eq("trigger_id", trigger.id)
        .eq("trial_user_id", user.id)
        .maybeSingle();

      if (existingNudge) continue;

      // create nudge
      const { data: insertedNudge } = await supabase
        .from("nudges")
        .insert({
          project_id: trigger.project_id,
          trigger_id: trigger.id,
          trial_user_id: user.id,
          scheduled_for: new Date().toISOString(),
        })
        .select()
        .single();

      if (!user.email) continue;

      // send the actual email
      await resend.emails.send({
        from: "Trial Engine <noreply@trialengine.dev>",
        to: user.email,
        subject: trigger.email_subject,
        html: trigger.email_body,
      });

      await supabase
        .from("nudges")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", insertedNudge.id);
    }
  }

  return NextResponse.json({ ok: true });
}
